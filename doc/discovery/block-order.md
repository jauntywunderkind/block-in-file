# Block Ordering and Code Modularization Planning

## Problem Statement

The anchor feature implementation highlighted a challenge: block ordering logic is entangled with block parsing logic in [`block-parser.ts`](/src/block-parser.ts). This document explores how to restructure the codebase to better separate concerns, making features like block ordering easier to implement without complicating other parts of the system.

## Current Architecture

### Core Processing Flow

```
block-in-file.ts (CLI entry)
    └── file-processor.ts (orchestration)
        ├── block-parser.ts (parsing + insertion + positioning)
        ├── conflict-detection.ts
        ├── mode-handler.ts
        ├── validation.ts
        └── backup.ts
```

### Current Issues

1. **`block-parser.ts` does too much**:
   - Parses file content into lines
   - Identifies existing blocks
   - Handles additive mode logic
   - Handles before/after regex positioning
   - Now also handles anchor positioning
   - All these concerns are mixed in a single 175-line function

2. **No clear model for "file structure"**:
   - We don't have a structured representation of a file with its blocks
   - Each operation re-parses and re-analyzes
   - Block metadata (anchors, tags) is parsed on-the-fly

3. **Position calculation is scattered**:
   - `before`/`after` regex matching in block-parser
   - Anchor positioning in anchor.ts but called from block-parser
   - No unified "where should this block go?" abstraction

## Proposed Architecture

### Core Abstraction: FileModel

A structured representation of a file with its blocks:

```typescript
// src/file-model.ts
interface BlockModel {
  name: string;
  startIndex: number;
  endIndex: number;
  content: string[];
  tags: Tag[];
  anchor?: AnchorInfo;
}

interface FileModel {
  lines: string[];
  blocks: BlockModel[];
  contentRanges: Array<{ start: number; end: number }>; // non-block content
  
  // Query methods
  findBlock(name: string): BlockModel | undefined;
  getBlockOrdering(block: BlockModel): number;
  
  // Modification methods (return new immutable FileModel)
  withUpdatedBlock(name: string, content: string[]): FileModel;
  withNewBlock(block: BlockModel, position: InsertPosition): FileModel;
  
  // Serialize
  toString(): string;
}
```

### Core Abstraction: InsertPosition

A unified way to express "where should this block go":

```typescript
// src/positioning.ts
type InsertPosition = 
  | { type: 'replace'; blockName: string }
  | { type: 'before'; pattern: RegExp | 'BOF' }
  | { type: 'after'; pattern: RegExp | 'EOF' }
  | { type: 'anchor'; anchor: AnchorInfo }
  | { type: 'end' }
  | { type: 'default' };

interface PositionCalculator {
  calculate(
    file: FileModel,
    position: InsertPosition,
    newBlock: Partial<BlockModel>
  ): number; // returns line index
}
```

### Proposed Module Structure

```
src/
├── models/
│   ├── file-model.ts       # FileModel, BlockModel
│   └── block-builder.ts    # Builder pattern for creating blocks
│
├── positioning/
│   ├── types.ts            # InsertPosition types
│   ├── calculator.ts       # PositionCalculator
│   ├── anchor-positioner.ts # Anchor-specific logic
│   └── regex-positioner.ts  # Before/after regex logic
│
├── parsing/
│   ├── file-parser.ts      # Parse file into FileModel
│   └── block-parser.ts     # Parse individual blocks
│
├── operations/
│   ├── insert.ts           # Insert operation
│   ├── update.ts           # Update operation
│   └── remove.ts           # Remove operation
│
├── plugins/
│   └── config.ts           # CLI config (unchanged)
│
└── file-processor.ts       # Orchestration (simplified)
```

### Processing Flow (Revised)

```
block-in-file.ts (CLI entry)
    └── file-processor.ts (orchestration)
        ├── parsing/file-parser.ts → FileModel
        ├── positioning/calculator.ts → InsertPosition
        ├── operations/*.ts → apply changes to FileModel
        └── output.ts → serialize FileModel
```

## Benefits of This Approach

### 1. Single Responsibility Principle

Each module has one job:
- `file-parser.ts`: Parse file content into structured model
- `calculator.ts`: Determine where to place a block
- `operations/insert.ts`: Insert a block at a position
- `file-model.ts`: Provide immutable data structure

### 2. Easier Testing

Each piece can be tested in isolation:
```typescript
// Test positioning without file I/O
const model = FileModel.fromLines(["line1", "line2", "line3"]);
const position = calculator.calculate(model, { type: 'anchor', anchor: { type: 'bof', priority: 100 } });
expect(position).toBe(0);
```

### 3. Extensibility

Adding new positioning strategies:
```typescript
// Add a new positioner for "after-section" positioning
interface AfterSectionPositioner {
  calculate(file: FileModel, sectionName: string): number;
}
```

### 4. Clear Data Flow

```
File Content → FileParser → FileModel → PositionCalculator → Operations → FileModel → Output
```

## Migration Strategy

### Phase 1: Extract Models (Low Risk)

1. Create `src/models/file-model.ts` with `FileModel` and `BlockModel`
2. Create `src/parsing/file-parser.ts` that produces `FileModel`
3. Update `block-parser.ts` to use `FileModel` internally
4. No external API changes

### Phase 2: Extract Positioning (Medium Risk)

1. Create `src/positioning/types.ts` with `InsertPosition`
2. Create `src/positioning/calculator.ts`
3. Move anchor logic to `src/positioning/anchor-positioner.ts`
4. Move before/after logic to `src/positioning/regex-positioner.ts`
5. Update `block-parser.ts` to use position calculator

### Phase 3: Extract Operations (Medium Risk)

1. Create `src/operations/insert.ts`
2. Create `src/operations/update.ts`
3. Create `src/operations/remove.ts`
4. Simplify `file-processor.ts` to orchestrate operations

### Phase 4: Simplify block-parser.ts (Low Risk)

1. The old `parseAndInsertBlock` becomes a thin wrapper
2. Eventually can be deprecated in favor of the new model

## Alternative Approaches Considered

### Option A: Keep Current Structure, Add Helper Functions

Add more helper functions like `anchor.ts` to handle specific features.

**Pros**: Minimal changes
**Cons**: Doesn't solve the fundamental coupling issue

### Option B: Full Rewrite with Pipeline Pattern

Create a pipeline where each stage transforms the file:

```
Parse → Analyze → Plan → Execute → Output
```

**Pros**: Very clean, highly testable
**Cons**: Large refactoring effort

### Option C: Hybrid (Recommended)

Extract models and positioning logic while keeping the existing structure for compatibility. Gradually migrate to the new architecture.

**Pros**: Incremental, low risk, backward compatible
**Cons**: Temporary code duplication during migration

## Open Questions

1. **Should FileModel be immutable or mutable?**
   - Immutable is safer for testing and reasoning
   - Mutable is more efficient for large files

2. **Should we support streaming for large files?**
   - Current approach loads entire file into memory
   - Streaming would complicate the model but enable large file support

3. **How to handle block nesting?**
   - Current code detects conflicts but doesn't model nesting
   - Should FileModel support nested blocks?

## Next Steps

1. Create `src/models/file-model.ts` with basic types
2. Create `src/parsing/file-parser.ts` 
3. Add integration tests for FileModel
4. Begin Phase 1 migration

## References

- Original anchor feature ticket: `bif-1sr`
- Current block-parser: [`/src/block-parser.ts`](/src/block-parser.ts)
- Anchor implementation: [`/src/anchor.ts`](/src/anchor.ts)
