export const pluginId = "blockinfile:io" as const;
export type PluginId = typeof pluginId;

export interface IOExtension {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  readStdin: () => Promise<string>;
  fileExists: (path: string) => Promise<boolean>;
}
