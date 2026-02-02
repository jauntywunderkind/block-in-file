import { plugin } from "gunshi/plugin";
import * as fs from "node:fs/promises";
import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { pluginId, type IOExtension } from "./types.js";

const readStdin = async (): Promise<string> => {
  const rl = readline.createInterface({ input, output });
  const lines: string[] = [];

  for await (const line of rl) {
    lines.push(line);
  }

  return lines.join("\n");
};

export default function io() {
  return plugin<{}, typeof pluginId, [], IOExtension>({
    id: pluginId,
    name: "IO Plugin",
    extension: (): IOExtension => ({
      readFile: async (path: string) => {
        if (path === "-") {
          return await readStdin();
        }
        return await fs.readFile(path, "utf-8");
      },
      writeFile: async (path: string, content: string) => {
        if (path === "-") {
          console.log(content);
          return;
        }
        if (path === "--") {
          return;
        }
        await fs.writeFile(path, content, "utf-8");
      },
      readStdin,
      fileExists: async (path: string) => {
        try {
          await fs.access(path);
          return true;
        } catch {
          return false;
        }
      },
    }),
  });
}
