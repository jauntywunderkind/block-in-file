export const pluginId = "blockinfile:logger" as const;
export type PluginId = typeof pluginId;

export interface LoggerExtension {
  log: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
  debug: (message: string) => void;
  enabled: boolean;
}
