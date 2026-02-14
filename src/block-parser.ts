import type { ParseResult } from "./types.ts";
import { stripTagsForMatching } from "./tags/tags.ts";
import type { AnchorInfo } from "./anchor.ts";
import {
  findBlocksAndAnchors,
  calculateInsertPosition,
} from "./anchor.ts";

export interface ParseOptions {
  opener: string;
  closer: string;
  inputBlock: string;
  before?: RegExp | boolean;
  after?: RegExp | boolean;
  appendNewline?: boolean;
  additive?: boolean;
  additiveBefore?: RegExp | "EOB" | "EOF" | "BOF";
  additiveAfter?: RegExp | "EOB" | "EOF" | "BOF";
  actualOpener?: string;
  actualCloser?: string;
  anchor?: AnchorInfo;
}

export function parseAndInsertBlock(fileContent: string, opts: ParseOptions): ParseResult {
  const {
    opener,
    closer,
    inputBlock,
    before,
    after,
    appendNewline,
    additive,
    additiveBefore,
    additiveAfter,
    actualOpener,
    actualCloser,
    anchor,
  } = opts;
  const match = before || after;
  const outputs: string[] = [];
  const lines = fileContent.split("\n");

  let done = false;
  let opened: number | undefined;
  let matched = -1;
  let i = -1;
  let blockContentLines: string[] = [];
  let blockStartIndex = -1;
  let blockEndIndex = -1;

  const inputLines = inputBlock.split("\n");
  const outputOpener = actualOpener || opener;
  const outputCloser = actualCloser || closer;

  const isOpener = (line: string) => {
    return stripTagsForMatching(line.trim()) === opener;
  };

  const isCloser = (line: string) => {
    return stripTagsForMatching(line.trim()) === closer;
  };

  if (before === true) {
    outputs.push(outputOpener, ...inputLines, outputCloser);
    if (appendNewline) {
      outputs.push("");
    }
    done = true;
  }

  for (const line of lines) {
    const isOpen = opened !== undefined;
    i++;

    if (!isOpen && isOpener(line)) {
      opened = outputs.length;
      blockStartIndex = outputs.length;
    } else if (isOpen) {
      if (!isCloser(line)) {
        if (additive) {
          blockContentLines.push(line);
        }
        continue;
      }

      opened = undefined;
      blockEndIndex = outputs.length;

      if (done) {
        continue;
      }

      if (additive) {
        const missingLines = inputLines.filter((line) => !blockContentLines.includes(line));

        if (missingLines.length > 0 || blockContentLines.length === 0) {
          let newContentLines: string[];

          if (blockContentLines.length === 0) {
            newContentLines = inputLines;
          } else if (
            additiveAfter === "EOB" ||
            additiveAfter === "EOF" ||
            (!additiveBefore && !additiveAfter)
          ) {
            newContentLines = [...blockContentLines, ...missingLines];
          } else if (additiveBefore === "BOF") {
            newContentLines = [...missingLines, ...blockContentLines];
          } else if (
            additiveAfter &&
            typeof additiveAfter === "object" &&
            "test" in additiveAfter
          ) {
            let insertIndex = blockContentLines.findIndex((l) => additiveAfter.test(l));
            if (insertIndex === -1) insertIndex = blockContentLines.length;
            newContentLines = [
              ...blockContentLines.slice(0, insertIndex + 1),
              ...missingLines,
              ...blockContentLines.slice(insertIndex + 1),
            ];
          } else if (
            additiveBefore &&
            typeof additiveBefore === "object" &&
            "test" in additiveBefore
          ) {
            let insertIndex = blockContentLines.findIndex((l) => additiveBefore.test(l));
            if (insertIndex === -1) insertIndex = 0;
            newContentLines = [
              ...blockContentLines.slice(0, insertIndex),
              ...missingLines,
              ...blockContentLines.slice(insertIndex),
            ];
          } else {
            newContentLines = [...blockContentLines, ...missingLines];
          }

          outputs.push(outputOpener, ...newContentLines, outputCloser);
        } else {
          outputs.push(outputOpener, ...blockContentLines, outputCloser);
        }
      } else {
        outputs.push(outputOpener, ...inputLines, outputCloser);
      }

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
    outputs.push(outputOpener, ...inputLines, outputCloser);
    if (appendNewline) {
      outputs.push("");
    }
    done = true;
  }

  if (!done) {
    if (anchor && matched === -1 && !before && !after) {
      const existingBlocks = findBlocksAndAnchors(lines, opener, closer);
      const insertPos = calculateInsertPosition(lines, anchor, existingBlocks);
      outputs.splice(insertPos, 0, outputOpener, ...inputLines, outputCloser);
      if (appendNewline) {
        outputs.splice(insertPos + inputLines.length + 2, 0, "");
      }
      matched = insertPos;
    } else {
      if (matched === -1) {
        matched = i;
      }
      outputs.splice(matched + (after ? 1 : 0), 0, outputOpener, ...inputLines, outputCloser);
      if (appendNewline) {
        outputs.splice(matched + (after ? 1 : 0) + inputLines.length + 2, 0, "");
      }
    }
  }

  return { outputs, matched, opened };
}
