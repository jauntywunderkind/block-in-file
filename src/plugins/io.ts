import { plugin } from "gunshi/plugin";
import * as fs from "node:fs/promises";
import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { performBackup, type BackupOptions } from "../backup.js";

export const pluginId = "blockinfile:io" as const;
export type PluginId = typeof pluginId;

export interface IOExtension {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  readStdin: () => Promise<string>;
  fileExists: (path: string) => Promise<boolean>;
  backupFile: (path: string, options: BackupOptions, content?: string) => Promise<string | null>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
}

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
      backupFile: async (path: string, options: BackupOptions, content?: string) => {
        return await performBackup(path, options, content);
      },
      rename: async (oldPath: string, newPath: string) => {
        await fs.rename(oldPath, newPath);
      },
      deleteFile: async (path: string) => {
        await fs.unlink(path);
      },
    }),
  });
}
