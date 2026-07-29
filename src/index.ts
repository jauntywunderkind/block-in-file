export { defaultOptions, getDefaultOptions } from "./defaults.ts";
export type { BlockInFileOptions, CreateArg, InputOptions, ParseResult } from "./types.ts";
export { parseAndInsertBlock } from "./block-parser.ts";
export { formatOutputs, generateDiff, writeDiff, writeOutput } from "./output.ts";
export { createOpt, get, openInput, readInput } from "./input.ts";
export * from "./toolkit.ts";
export { planBlock, reconcileBlock } from "./managed/default.ts";
export type {
  BlockRequest,
  ManagedChange,
  ManagedFailure,
  ManagedOutcome,
  ManagedPlan,
} from "./managed/default.ts";
export { inspectManagedBlocks, renderManagedBlock } from "./managed/markers.ts";
export type { ManagedBlock, MarkerDialect, MarkerInspection } from "./managed/markers.ts";
