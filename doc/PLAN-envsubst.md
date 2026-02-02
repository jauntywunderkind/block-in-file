# Envsubst Feature Plan

## Overview

Add environment variable interpolation to block content with support for recursive and non-recursive substitution modes.

## Requirements

1. **Envsubst Option**: Add a new `--envsubst` flag that enables environment variable substitution in the input block
2. **Recursive Mode**: Substitution continues until the result stabilizes (a substitution yields the same value)
3. **Non-recursive Mode**: Perform a single pass of substitution
4. **Variable Syntax**: Support `${VAR}` and `$VAR` syntax for environment variables

## Implementation Plan

### Phase 1: Core Envsubst Module

Create `src/envsubst.ts` with:

- `substitute(text: string, recursive: boolean): string` - Main substitution function
- Support for `${VAR}` syntax (priority)
- Support for `$VAR` syntax (fallback)
- Recursive mode: loop until stable or max iterations reached
- Non-recursive mode: single pass substitution

### Phase 2: Configuration Updates

Update `src/plugins/config.ts`:

- Add `envsubst` option to ConfigExtension interface
- Add CLI option `--envsubst` with values: `true`, `false`, `recursive`, `non-recursive`
- Default: `false` (disabled)
- Map values: `true` → `recursive`, `non-recursive` → single pass

Update `src/types.ts`:

- Add `envsubst` field to `BlockInFileOptions` interface
- Add `envsubst` field to default options

### Phase 3: Integration

Update `src/file-processor.ts`:

- Import envsubst module
- Apply envsubst to `inputBlock` before processing
- Pass envsubst option through ProcessContext

Update `block-in-file.ts`:

- Pass envsubst from config to processFile context

### Phase 4: Testing

Create test file `test/envsubst.test.ts`:

- Test basic `${VAR}` substitution
- Test `$VAR` substitution
- Test recursive substitution (nested variables)
- Test non-recursive mode
- Test undefined variables (keep as-is or error?)
- Test special cases (escaped variables, malformed syntax)

## Design Decisions

### Variable Syntax Priority

1. `${VAR}` - Preferred, explicit syntax
2. `$VAR` - Supported for compatibility with shell syntax

### Undefined Variables

- **Decision**: Leave undefined variables as-is (no substitution)
- This allows optional variables without errors
- Consistent with standard envsubst behavior

### Recursive Mode Safety

- Maximum iterations: 100 (prevent infinite loops)
- Stop when: `previous === current` or max iterations reached

### Non-recursive Mode

- Single pass only
- Substitute variables once with current environment values
- No re-evaluation of substituted values

## API Changes

### CLI Options

```bash
--envsubst           # Enable recursive substitution
--envsubst=recursive # Explicit recursive mode
--envsubst=non-recursive # Single pass substitution
--envsubst=false     # Disable (default)
```

### Programmatic API

```typescript
const options: BlockInFileOptions = {
  // ... other options
  envsubst: true, // recursive
  envsubst: "recursive", // explicit
  envsubst: "non-recursive", // single pass
  envsubst: false, // disabled
};
```

## Example Usage

### Basic Substitution

```bash
export MY_VAR="hello world"
echo "content: \${MY_VAR}" | block-in-file -i - -o output.txt --envsubst
# Results in: content: hello world
```

### Recursive Substitution

```bash
export VAR1="value1"
export VAR2="prefix \${VAR1}"
echo "result: \${VAR2}" | block-in-file -i - -o output.txt --envsubst
# Results in: result: prefix value1
```

### Non-recursive

```bash
export VAR1="value1"
export VAR2="prefix \${VAR1}"
echo "result: \${VAR2}" | block-in-file -i - -o output.txt --envsubst=non-recursive
# Results in: result: prefix ${VAR1}
```

## Testing Strategy

1. **Unit Tests** (envsubst.ts):
   - Basic substitution with `${VAR}`
   - Basic substitution with `$VAR`
   - Multiple variables in one string
   - Recursive substitution with nesting
   - Non-recursive single pass
   - Undefined variable handling
   - Malformed syntax handling
   - Edge cases (empty string, no variables)

2. **Integration Tests**:
   - End-to-end with block-in-file command
   - Combination with other options (mode, validate, etc.)
   - File input and stdin input

## Edge Cases to Handle

1. **Escaped variables**: `\${VAR}` should become `${VAR}` (not substituted)
2. **Malformed syntax**: `${` or `$` at end of string
3. **Nested braces**: `${VAR${NESTED}}` - how to handle?
4. **Empty variable names**: `${}` - ignore or error?
5. **Whitespace in variable names**: `${VAR NAME}` - ignore or error?

## Open Questions

1. Should escaped variables be supported? (e.g., `\${VAR}` → `${VAR}`)
2. Should we throw errors for undefined variables or silently skip?
3. Should we support default values? (e.g., `${VAR:-default}`)
4. Maximum recursion limit - is 100 iterations sufficient?

## Implementation Order

1. Create envsubst module with basic substitution
2. Add configuration options
3. Integrate into file processor
4. Add tests
5. Documentation updates
