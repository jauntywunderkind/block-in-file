# Envsubst Feature Plan

## Overview

Add environment variable interpolation to block content with support for recursive and non-recursive substitution modes.

## Requirements

1. **Envsubst Option**: Add a new `--envsubst` flag that enables environment variable substitution in the input block
2. **Recursive Mode**: Substitution continues until the result stabilizes (handles nested variables like `${VAR1}` where VAR1 contains `${VAR2}`)
3. **Non-recursive Mode**: Single pass substitution only (matches standard envsubst behavior)
4. **Variable Syntax**: Support `${VAR}` and `$VAR` syntax for environment variables

## Implementation Plan

### Phase 1: Core Envsubst Module

Create `src/envsubst.ts` with:

- `substitute(text: string, options: EnvsubstOptions): string` - Main substitution function
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

Create test files:

- `test/envsubst.test.ts` - Unit tests for substitution logic
- `test/envsubst-integration.test.ts` - End-to-end CLI tests
- `test/envsubst-edge-cases.test.ts` - Edge case tests

## Design Decisions

### Variable Syntax Priority

1. `${VAR}` - Preferred, explicit syntax
2. `$VAR` - Supported for compatibility with shell syntax

### Undefined Variables

- **Decision**: Replace with empty string (not "undefined" or leave as-is)
- Matches standard envsubst behavior
- Allows optional variables without errors

### Recursive Mode Safety

- Maximum iterations: 100 (prevent infinite loops)
- Stop when: `previous === current` or max iterations reached
- Handles nested variables: `${VAR1}` where VAR1="${VAR2}" expands fully

### Non-recursive Mode

- Single pass only (matches standard envsubst)
- Substitute variables once with current environment values
- No re-evaluation of substituted values
- Nested braces like `${VAR${NESTED}}` will expand inner but not result

### Escaping Behavior

- **Decision**: Backslash escaping NOT supported (matches envsubst quirky behavior)
- `\${VAR}` becomes `\value` (backslash is literal, substitution still happens)
- This is consistent with standard envsubst, not traditional escaping

## Edge Cases Handled

1. **Empty variable names**: `${}` - NOT matched by regex pattern (requires at least one character after `$` and before `{`), remains as-is
2. **Lone dollar sign**: `$` - NOT matched by regex pattern (requires variable name), remains as-is
3. **Nested braces**: `${VAR${NESTED}}`
   - Recursive mode: expands fully (NESTED → inner, then VARinner → final)
   - Non-recursive mode: expands inner only (NESTED → inner, result is `${VARinner}`)
4. **Invalid variable names**: `${VAR-INVALID}`, `${1VAR}` - NOT matched (regex requires `[a-zA-Z_][a-zA-Z0-9_]*`), remain as-is
5. **Variables with underscores**: `${MY_LONG_VAR_NAME_123}` - Matched and substituted correctly
6. **Malformed syntax**: `${` or `$` at end of string - NOT matched by patterns, remain as-is

## API Changes

### CLI Options

```bash
--envsubst           # Enable recursive substitution
--envsubst=recursive # Explicit recursive mode
--envsubst=non-recursive # Single pass substitution (like envsubst)
--envsubst=false     # Disable (default)
```

### Programmatic API

```typescript
const options: BlockInFileOptions = {
  // ... other options
  envsubst: true, // recursive (expand until stable)
  envsubst: 'recursive', // explicit recursive mode
  envsubst: 'non-recursive', // single pass (like envsubst)
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

### Recursive Substitution (handles nested variables)

```bash
export VAR1="value1"
export VAR2="prefix \${VAR1}"
echo "result: \${VAR2}" | block-in-file -i - -o output.txt --envsubst
# Results in: result: prefix value1
```

### Non-recursive (single pass, like envsubst)

```bash
export VAR1="value1"
export VAR2="prefix \${VAR1}"
echo "result: \${VAR2}" | block-in-file -i - -o output.txt --envsubst=non-recursive
# Results in: result: prefix ${VAR1} (VAR1 not expanded in single pass)
```

### Undefined Variables

```bash
export DEFINED_VAR="value"
echo "\${DEFINED_VAR} and \${UNDEFINED_VAR}" | block-in-file -i - -o output.txt --envsubst
# Results in: value and  (undefined becomes empty string)
```

### Empty Variable Names

```bash
echo "value: \${}" | block-in-file -i - -o output.txt --envsubst
# Results in: value: ${} (pattern doesn't match, stays as-is)
```

## Testing Strategy

1. **Unit Tests** (envsubst.ts):
   - Basic substitution with `${VAR}`
   - Basic substitution with `$VAR`
   - Multiple variables in one string
   - Recursive substitution with nesting
   - Non-recursive single pass
   - Undefined variable handling (becomes empty string)
   - Malformed syntax handling
   - Edge cases (empty string, no variables, invalid names)

2. **Integration Tests**:
   - End-to-end with block-in-file command
   - Combination with other options (mode, validate, etc.)
   - File input and stdin input

3. **Edge Case Tests**:
   - Empty variable names `${}`
   - Lone dollar sign `$`
   - Nested braces in both modes
   - Invalid variable names
   - Variables with underscores and numbers
   - Backslash escaping behavior

## Implementation Order

1. ✅ Create envsubst module with substitution logic
2. ✅ Add configuration options
3. ✅ Integrate into file processor
4. ✅ Add tests (unit, integration, edge cases)
5. ✅ Update documentation (PLAN-envsubst.md)
