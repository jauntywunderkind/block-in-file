export const pluginId = "blockinfile:config" as const;
export type PluginId = typeof pluginId;

export type CreateArg = boolean | "file" | "block";

export interface ConfigExtension {
  name: string;
  comment: string;
  markerStart: string;
  markerEnd: string;
  dos: boolean;
  debug: boolean;
  input: string;
  output: string;
  create?: CreateArg;
  before?: string;
  after?: string;
  diff?: string;
}
