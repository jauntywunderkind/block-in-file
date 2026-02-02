import { plugin } from "gunshi/plugin";
import * as fs from "node:fs/promises";

export const pluginId = "blockinfile:diff" as const;
export type PluginId = typeof pluginId;

export interface DiffExtension {
  generateDiff: (original: string, modified: string, filePath: string) => string;
  writeDiff: (
    diff: string | boolean,
    original: string,
    newContent: string,
    filePath: string,
  ) => Promise<void>;
}

function generateDiff(original: string, modified: string, filePath: string): string {
  const originalLines = original.split("\n");
  const modifiedLines = modified.split("\n");
  const output: string[] = [];

  output.push(`--- ${filePath}`);
  output.push(`+++ ${filePath}`);

  let i = 0;
  let j = 0;

  while (i < originalLines.length || j < modifiedLines.length) {
    if (
      i < originalLines.length &&
      j < modifiedLines.length &&
      originalLines[i] === modifiedLines[j]
    ) {
      output.push(` ${originalLines[i]}`);
      i++;
      j++;
    } else {
      const origStart = i;
      const modStart = j;

      while (
        i < originalLines.length &&
        (j >= modifiedLines.length || originalLines[i] !== modifiedLines[j])
      ) {
        let found = false;
        for (let k = j; k < Math.min(j + 10, modifiedLines.length); k++) {
          if (originalLines[i] === modifiedLines[k]) {
            found = true;
            break;
          }
        }
        if (found) break;
        i++;
      }

      while (
        j < modifiedLines.length &&
        (i >= originalLines.length || modifiedLines[j] !== originalLines[i])
      ) {
        let found = false;
        for (let k = i; k < Math.min(i + 10, originalLines.length); k++) {
          if (modifiedLines[j] === originalLines[k]) {
            found = true;
            break;
          }
        }
        if (found) break;
        j++;
      }

      for (let k = origStart; k < i; k++) {
        output.push(`-${originalLines[k]}`);
      }
      for (let k = modStart; k < j; k++) {
        output.push(`+${modifiedLines[k]}`);
      }
    }
  }

  return output.join("\n");
}

async function writeDiff(
  diff: string | boolean | undefined,
  originalContent: string,
  newContent: string,
  filePath: string,
): Promise<void> {
  if (!diff) return;

  const diffText = generateDiff(originalContent, newContent, filePath);

  if (diff === true || diff === "-") {
    console.error(diffText);
  } else if (typeof diff === "string") {
    await fs.writeFile(diff, diffText, "utf-8");
  }
}

export default function diff() {
  return plugin<{}, typeof pluginId, [], DiffExtension>({
    id: pluginId,
    name: "Diff Plugin",
    extension: (): DiffExtension => ({
      generateDiff,
      writeDiff,
    }),
  });
}
