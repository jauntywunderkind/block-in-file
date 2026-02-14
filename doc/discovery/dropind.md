# Drop-in Directory Support for block-in-file

## Overview

This document explores options for adding `.d` directory (drop-in) support to `block-in-file`. The goal is to allow positional input arguments to be either:
1. A filename (if it exists as a file)
2. A glob pattern that expands via tinyglobby

With an optional `--full-path` flag to match against the full path instead of just the filename.

The resulting block content would be the concatenation of all matched files.

---

## Background: What are .d Directories?

The `.d` directory convention (pronounced "dot-d" or "drop-in") is a Unix/Linux pattern for modular configuration management. Instead of a single monolithic config file, configurations are split across multiple files in a directory.

### Examples from the Wild

| System | Directory | Purpose |
|--------|-----------|---------|
| systemd | `/etc/systemd/system/*.service.d/` | Override service units |
| apt | `/etc/apt/sources.list.d/` | Additional package sources |
| nginx | `/etc/nginx/conf.d/` | Site configurations |
| sudo | `/etc/sudoers.d/` | Additional sudo rules |
| cron | `/etc/cron.d/` | System cron jobs |
| SSH | `/etc/ssh/sshd_config.d/` | SSH daemon config snippets |
| sysctl | `/etc/sysctl.d/` | Kernel parameters |
| logrotate | `/etc/logrotate.d/` | Log rotation configs |

### Key Characteristics

1. **Lexicographic ordering**: Files are typically processed in sorted order
2. **Modularity**: Each file contains a discrete piece of configuration
3. **Composability**: All files concatenate to form the full configuration
4. **Package-friendly**: Packages can add/remove their own config files without touching others

---

# Journal - Tech Stack Review

## tinyglobby

**Source**: [`/home/rektide/archive/SuperchupuDev/tinyglobby`](file:///home/rektide/archive/SuperchupuDev/tinyglobby)

A fast, minimal glob library with only 2 subdependencies (vs globby's 23, fast-glob's 17). Used by major projects including vite, vitest, pnpm, typescript-eslint, and more.

### API Surface

```typescript
import { glob, globSync, convertPathToPattern, escapePath, isDynamicPattern } from 'tinyglobby';

// Async usage
await glob(['files/*.ts', '!**/*.d.ts'], { cwd: 'src' });

// Sync usage  
globSync('src/**/*.ts', { ignore: '**/*.d.ts' });

// Utilities
convertPathToPattern('/path/with spaces'); // escapes for glob
escapePath('/path/with spaces'); // escapes special chars
isDynamicPattern('*.ts'); // true - contains glob chars
```

### Relevant Options for Our Use Case

| Option | Type | Default | Relevance |
|--------|------|---------|-----------|
| `absolute` | boolean | false | **Critical** - for `--full-path` matching |
| `cwd` | string | process.cwd() | **Critical** - base directory for relative patterns |
| `dot` | boolean | false | Match hidden files (`.d` directories) |
| `ignore` | string[] | [] | Exclude patterns |
| `onlyFiles` | boolean | true | We want files, not directories |
| `deep` | number | Infinity | Control recursion depth |
| `expandDirectories` | boolean | true | Auto-expand directory patterns |

### Key Observations

1. **`absolute` option**: When true, returns absolute paths. This could be used to match against full path patterns.

2. **Pattern syntax**: Supports standard glob patterns (`*`, `**`, `?`, `[...]`), brace expansion (`{a,b}`), and negation (`!pattern`).

3. **Sync vs Async**: We currently use async I/O, so `glob()` is the natural fit.

4. **Error handling**: Returns empty array for no matches (not an error).

---

# Journal - Current Input Handling Analysis

Reviewed the current input handling in block-in-file:

### Files Examined

- [`/src/input.ts`](/src/input.ts) - Input file handling
- [`/src/plugins/io.ts`](/src/plugins/io.ts) - IO plugin with readFile
- [`/block-in-file.ts`](/block-in-file.ts) - CLI entry point

### Current Flow

```
CLI positional args → files[]
  ↓
For each file:
  ↓
io.readFile(configExt.input) → inputBlock
  ↓
processFile(file, inputBlock, ...)
```

### Key Observations

1. **Input comes from `-i` flag** (or stdin by default), NOT from positional arguments
2. **Positional args are TARGET files** to modify, not input sources
3. **Single input source**: Currently reads from one source (file or stdin)

This is different from what I initially understood. The request is about:
- Making the **input source** (`-i`) support glob patterns
- Not the positional target files

---

# Journal - Clarifying the Feature Request

After reviewing the code, I need to clarify what "dropind" means in context:

### Two Possible Interpretations

**Option A: Glob-based Input Source**
```bash
# Read all files matching pattern, concatenate, use as block content
block-in-file target.txt -i 'conf.d/*.conf'
block-in-file target.txt -i '/etc/app/**/*.conf' --full-path
```

**Option B: Target Directory Drop-in Style**
```bash
# Apply same block to multiple target files matched by glob
block-in-file 'targets.d/*.txt' -i block-content.txt
```

Based on the original request mentioning "the block is the concatenation of all these results", **Option A** seems to be the intent.

### Proposed Behavior

```
-i value    | Exists as file? | Behavior
------------|-----------------|----------
file.txt    | Yes             | Read file.txt
file.txt    | No              | Treat as glob pattern
'*.conf'    | N/A (glob)      | Glob expand, read all, concatenate
'conf.d/*'  | N/A (glob)      | Glob expand, read all, concatenate
```

---

# Journal - Implementation Design

## File Detection Strategy

The key question: How do we distinguish between a literal filename and a glob pattern?

### Approaches

1. **Existence check first**: If `-i` value exists as a file, use it directly. Otherwise, treat as glob.

2. **Glob character detection**: If `-i` contains glob characters (`*`, `?`, `[`, `]`, `{`, `}`), treat as glob.

3. **Explicit flag**: Require `--glob` flag to enable glob mode.

**Recommendation**: Approach 1 (existence check first) with tinyglobby's `isDynamicPattern()` as a hint.

```typescript
import { glob, isDynamicPattern } from 'tinyglobby';

async function resolveInput(input: string, options: { fullpath?: boolean }): Promise<string[]> {
  // Check if it's a literal file that exists
  try {
    await fs.access(input);
    return [input]; // Single file, return as-is
  } catch {
    // Doesn't exist as literal, try as glob pattern
  }
  
  // Expand as glob
  const files = await glob(input, {
    absolute: options.fullpath,
    onlyFiles: true,
  });
  
  // Sort for deterministic ordering
  return files.sort();
}
```

## --full-path Option

When `--full-path` is set:
- tinyglobby's `absolute: true` option is enabled
- Pattern matching happens against full paths
- Useful for patterns like `/etc/app/**/*.conf`

```typescript
const files = await glob(pattern, {
  absolute: opts.fullPath, // --full-path flag
  cwd: process.cwd(),
  onlyFiles: true,
});
```

## File Ordering

For predictable concatenation, files should be sorted:
1. Lexicographically by default (A-Z)
2. Could add `--sort` option later for custom ordering

```typescript
const files = matchedFiles.sort((a, b) => a.localeCompare(b));
```

## Concatenation

```typescript
async function concatenateFiles(files: string[]): Promise<string> {
  const contents = await Promise.all(
    files.map(f => fs.readFile(f, 'utf-8'))
  );
  return contents.join('\n');
}
```

---

## Proposed API Changes

### New CLI Options

| Flag | Arguments | Description |
|------|-----------|-------------|
| `--full-path` | none | Match glob patterns against full paths (enables absolute paths in tinyglobby) |

### Modified Behavior

| Flag | Current | Proposed |
|------|---------|----------|
| `-i` | Single file path or `-` for stdin | File path, `-` for stdin, or glob pattern (if file doesn't exist) |

### Code Changes Required

1. **`src/plugins/config.ts`**: Add `--full-path` option
2. **`src/plugins/io.ts`**: Modify `readFile` to handle glob expansion
3. **`src/input.ts`**: Add `resolveInput` function for glob detection
4. **New `src/glob-input.ts`**: Centralize glob handling logic

---

# Journal - Integration Points

### Dependencies

Add tinyglobby to `package.json`:
```json
{
  "dependencies": {
    "tinyglobby": "^0.2.0"
  }
}
```

### Modified Files

```
src/
├── plugins/
│   ├── config.ts     # Add --full-path option
│   └── io.ts         # Update readFile to handle globs
├── input.ts          # Add glob resolution
└── glob-input.ts     # NEW: Glob handling utilities
```

---

## Examples of Use

### Basic Glob Input
```bash
# Read all .conf files from drop-in directory
block-in-file app.conf -i '/etc/myapp/conf.d/*.conf'

# Result: block content = concat of all matched files
```

### With Full Path Matching
```bash
# Match against full path
block-in-file app.conf -i '/etc/**/*.conf' --full-path
```

### Fallback to Literal File
```bash
# If literal file exists, use it (no glob expansion)
block-in-file app.conf -i literal-file.txt
```

### Multiple Patterns (Future Enhancement)
```bash
# Could support multiple patterns
block-in-file app.conf -i 'conf.d/*.conf' -i 'overrides/*.conf'
```

---

## Options and Alternatives

### Alternative 1: Explicit --glob Flag

Require explicit opt-in to glob behavior:
```bash
block-in-file app.conf -i 'conf.d/*.conf' --glob
```

**Pros**: Clear intent, no ambiguity
**Cons**: Extra typing, less intuitive

### Alternative 2: Dedicated --input-dir Flag

Separate directory input from file input:
```bash
block-in-file app.conf --input-dir conf.d/
```

**Pros**: Very explicit, matches existing patterns in other tools
**Cons**: Less flexible, can't do pattern filtering

### Alternative 3: Auto-detect with .d Suffix

Automatically treat paths ending in `.d` as directories:
```bash
block-in-file app.conf -i conf.d  # Auto-globs conf.d/*
```

**Pros**: Follows existing conventions
**Cons**: Might conflict with literal `.d` files

### Recommendation: Auto-detect with Existence Check (Proposed Approach)

The auto-detect approach with existence check first provides the best UX:
- No extra flags needed
- Follows "do what I mean" principle
- Backward compatible with existing usage

---

## Decision Points

### Decision 1: Glob Detection Strategy

**Question**: How do we determine if `-i` value is a glob pattern?

**Options**:
1. File existence check (proposed)
2. Check for glob characters with `isDynamicPattern()`
3. Require explicit `--glob` flag

**Recommendation**: Option 1 with fallback to Option 2 as a hint.

### Decision 2: File Ordering

**Question**: How should matched files be ordered for concatenation?

**Options**:
1. Lexicographic sort (default)
2. No guaranteed order
3. Modification time order

**Recommendation**: Option 1 (lexicographic) for predictability.

### Decision 3: Error Handling

**Question**: What if glob matches no files?

**Options**:
1. Error/warning and proceed with empty content
2. Error and abort
3. Silent (empty block)

**Recommendation**: Option 2 (error) - explicit is better than implicit.

### Decision 4: Multiple Input Sources

**Question**: Should we support multiple `-i` flags?

**Options**:
1. Single `-i` only
2. Multiple `-i` flags, concatenate all results

**Recommendation**: Start with Option 1, add Option 2 as future enhancement.

---

## Discussion Questions

1. **Should we add a `--sort` option** for custom file ordering (e.g., by mtime, numeric prefix)?

2. **What separator should be used** between concatenated files? Newline is proposed, but should it be configurable?

3. **Should empty files be included** in concatenation or skipped?

4. **How to handle binary files**? Error? Skip? Include as-is?

5. **Should there be a max file count limit** to prevent accidental system-wide globs?

---

## Reference Materials

- tinyglobby source: [`/home/rektide/archive/SuperchupuDev/tinyglobby`](file:///home/rektide/archive/SuperchupuDev/tinyglobby)
- tinyglobby docs: https://superchupu.dev/tinyglobby/documentation
- Current input handling: [`/src/input.ts`](/src/input.ts)
- IO plugin: [`/src/plugins/io.ts`](/src/plugins/io.ts)

---

## Next Steps

1. Add tinyglobby to dependencies
2. Create `src/glob-input.ts` with glob resolution logic
3. Update `src/plugins/config.ts` with `--full-path` option
4. Update `src/plugins/io.ts` to handle glob patterns
5. Add tests for glob input scenarios
6. Update README with examples
