export { defaultOptions, getDefaultOptions } from "./defaults.ts";
export type { BlockInFileOptions, CreateArg, InputOptions, ParseResult } from "./types.ts";
export { parseAndInsertBlock } from "./block-parser.ts";
export { formatOutputs, generateDiff, writeDiff, writeOutput } from "./output.ts";
export { createOpt, get, openInput, readInput } from "./input.ts";
