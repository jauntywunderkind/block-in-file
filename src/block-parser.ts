import type { ParseResult } from "./types.ts";

export interface ParseOptions {
  opener: string;
  closer: string;
  inputBlock: string;
  before?: RegExp | boolean;
  after?: RegExp | boolean;
  appendNewline?: boolean;
}

export function parseAndInsertBlock(fileContent: string, opts: ParseOptions): ParseResult {
  const { opener, closer, inputBlock, before, after, appendNewline } = opts;
  const match = before || after;
  const outputs: string[] = [];
  const lines = fileContent.split("\n");

  let done = false;
  let opened: number | undefined;
  let matched = -1;
  let i = -1;

  if (before === true) {
    outputs.push(opener, inputBlock, closer);
    if (appendNewline) {
      outputs.push("");
    }
    done = true;
  }

  for (const line of lines) {
    const isOpen = opened !== undefined;
    i++;

    if (!isOpen && line === opener) {
      opened = outputs.length;
    } else if (isOpen) {
      if (line !== closer) {
        continue;
      }

      opened = undefined;

      if (done) {
        continue;
      }

      outputs.push(opener, inputBlock, closer);
      if (appendNewline) {
        outputs.push("");
      }
      done = true;
    } else {
      outputs.push(line);

      if (!done && matched === -1 && typeof match === "object" && match?.test?.(line)) {
        matched = i;
      }
    }
  }

  if (opened !== undefined) {
    outputs.push(opener, inputBlock, closer);
    if (appendNewline) {
      outputs.push("");
    }
    done = true;
  }

  if (!done) {
    if (matched === -1) {
      matched = i;
    }
    outputs.splice(matched + (after ? 1 : 0), 0, opener, inputBlock, closer);
    if (appendNewline) {
      outputs.splice(matched + (after ? 1 : 0) + 3, 0, "");
    }
  }

  return { outputs, matched, opened };
}
