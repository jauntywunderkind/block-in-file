import type { BlockInFileOptions } from "./types.ts";
import { defaultOptions } from "./defaults.ts";
import { createOpt, get, openInput, readInput } from "./input.ts";
import { parseAndInsertBlock } from "./block-parser.ts";
import { formatOutputs, writeDiff, writeOutput } from "./output.ts";

export class BlockInFile {
  static defaults = defaultOptions;

  options: Partial<BlockInFileOptions>;
  _input?: string;

  constructor(options: Partial<BlockInFileOptions> = {}) {
    this.options = options;
  }

  async run(filePath: string) {
    // deno-lint-ignore no-explicit-any
    const [input, output, _before, _after, start, end, comment, create, name, dos, diff] = get(
      this.options,
      (this.constructor as any).defaults || BlockInFile.defaults,
      "input",
      "output",
      "before",
      "after",
      "markerStart",
      "markerEnd",
      "comment",
      "create",
      "name",
      "dos",
      "diff",
    );

    if (_before && _after) {
      throw new Error("Cannot have both 'before' and 'after'");
    }

    if (!this._input) {
      this._input = await readInput(input, createOpt(create, "block"));
    }

    const before = typeof _before === "string" ? new RegExp(_before) : _before;
    const after = typeof _after === "string" ? new RegExp(_after) : _after;
    const opener = `${comment} ${name} ${start}`;
    const closer = `${comment} ${name} ${end}`;

    let originalContent = "";
    if (diff) {
      try {
        originalContent = await Deno.readTextFile(filePath);
      } catch {
        // file doesn't exist yet, original is empty
      }
    }

    const inputStream = await openInput(filePath, createOpt(create, "file"));
    const { outputs } = await parseAndInsertBlock(inputStream, {
      opener,
      closer,
      inputBlock: this._input,
      before,
      after,
    });

    const outputText = formatOutputs(outputs, dos);

    if (diff) {
      await writeDiff(diff, originalContent, outputText, filePath);
    } else {
      await writeOutput(outputText, output, filePath);
    }
  }
}
