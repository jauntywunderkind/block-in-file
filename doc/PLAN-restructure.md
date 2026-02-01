# Restructure Plan

## Current Issues

1. **Single file complexity** - `block-in-file.ts` contains 215 lines mixing multiple responsibilities
2. **Non-testable code** - No way to unit test individual components
3. **Global mutable state** - `defaults` and `setDefaults()` create coupling issues
4. **Poor separation of concerns** - File I/O, parsing, and logic intermingled
5. **Dead code** - Commented-out blocks that should be removed

## Target Structure

```
src/
├── types.ts           # All type definitions, interfaces
├── input.ts           # Input handling (_input, stream reading)
├── block-parser.ts    # Block finding, parsing, insertion logic
├── output.ts          # Output writing, formatting
├── defaults.ts        # Default configuration (immutable pattern)
├── block-in-file.ts   # Main class orchestrating components
├── cli.ts             # CLI interface (renamed from cliffy.ts)
└── index.ts           # Public API exports
```

## Component Breakdown

### `types.ts`
- `BlockInFileOptions` interface
- `CreateArg` type
- `InputOptions` interface
- All shared types

### `input.ts`
- `get<T>()` utility function
- `createOpt()` function
- `_input()` function
- Stream handling utilities

### `block-parser.ts`
- Block detection logic (finding opener/closer)
- Insertion position calculation (before/after matching)
- Line-by-line processing state machine
- Returns structured result: `{ outputs: string[], matched: number, opened?: number }`

### `output.ts`
- `formatOutputs()` - Join lines with appropriate line endings
- `writeOutput()` - Handle different output modes (file, stdout, none)
- Diff generation (when implemented)

### `defaults.ts`
- Immutable default configuration object
- `getDefaultOptions()` function
- No mutable exports

### `block-in-file.ts`
- Main `BlockInFile` class
- `run()` method that orchestrates components
- Minimal logic, delegates to specialized modules

### `cli.ts`
- All Cliffy/CLI logic
- Argument parsing
- Environment variable handling
- Renamed from `cliffy.ts` for clarity

### `index.ts`
- Public API exports
- Re-exports for convenience

## Migration Steps

1. **Create new files** with empty structure
2. **Extract types** to `types.ts`
3. **Move input functions** to `input.ts`
4. **Extract parsing logic** to `block-parser.ts` (core complexity)
5. **Extract output logic** to `output.ts`
6. **Create defaults module** with immutable pattern
7. **Refactor main class** to use new components
8. **Update CLI imports**
9. **Verify functionality** with existing examples
10. **Add tests** for individual components

## Testing Strategy

After restructuring:
- Unit test `block-parser.ts` with mock inputs
- Unit test `output.ts` with various output modes
- Unit test `input.ts` file opening scenarios
- Integration test full `BlockInFile.run()` flow
- CLI tests for argument parsing

## Benefits

- **Maintainability** - Clear file boundaries make changes easier
- **Testability** - Components can be unit tested independently
- **Reusability** - Individual modules can be used separately
- **Readability** - Smaller files are easier to understand
- **Onboarding** - New contributors can navigate code faster

## Backward Compatibility

- Public API remains unchanged
- CLI interface unchanged
- Existing functionality preserved
- Only internal structure changes
