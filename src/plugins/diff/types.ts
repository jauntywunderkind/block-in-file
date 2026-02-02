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
