import { plugin } from "gunshi/plugin";
import { parseBackupOption, type BackupOptions } from "../backup.js";

export const pluginId = "blockinfile:config" as const;
export type PluginId = typeof pluginId;

export type CreateArg = boolean | "file" | "block";
export type StateOnFailMode = "iterate" | "fail" | "overwrite";

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
  backup?: string[];
  backupDir?: string;
  stateOnFail?: StateOnFailMode;
  backupOptions?: BackupOptions;
}

export default function config() {
  return plugin<{}, typeof pluginId, [], ConfigExtension>({
    id: pluginId,
    name: "Config Plugin",
    setup: (ctx) => {
      ctx.addGlobalOption("name", {
        type: "string",
        short: "n",
        description: "Name for block",
        default: "blockinfile",
      });
      ctx.addGlobalOption("comment", {
        type: "string",
        short: "c",
        description: "Comment string for marker",
        default: "#",
      });
      ctx.addGlobalOption("marker-start", {
        type: "string",
        description: "Marker for start",
        default: "start",
      });
      ctx.addGlobalOption("marker-end", {
        type: "string",
        description: "Marker for end",
        default: "end",
      });
      ctx.addGlobalOption("dos", {
        type: "boolean",
        description: "Use dos line endings",
      });
      ctx.addGlobalOption("input", {
        type: "string",
        short: "i",
        description: "Input file to read contents from, or - from stdin",
        default: "-",
      });
      ctx.addGlobalOption("output", {
        type: "string",
        short: "o",
        description:
          "Output file, or - for stdout, or -- for no output, or --- for overwriting existing file",
        default: "---",
      });
      ctx.addGlobalOption("before", {
        type: "string",
        short: "b",
        description: "String or regex to insert before",
      });
      ctx.addGlobalOption("after", {
        type: "string",
        short: "a",
        description: "String or regex to insert after",
      });
      ctx.addGlobalOption("create", {
        type: "string",
        short: "C",
        description: "Create file or block if missing (file, block, true, false)",
      });
      ctx.addGlobalOption("diff", {
        type: "boolean",
        short: "D",
        description: "Print diff (optional output file path)",
      });
      ctx.addGlobalOption("backup", {
        type: "string",
        short: "B",
        description: "Create backup with suffix pattern (e.g., 'foo', 'bak')",
        multiple: true,
      });
      ctx.addGlobalOption("backup-dir", {
        type: "string",
        description: "Directory to store backup files",
      });
      ctx.addGlobalOption("state-on-fail", {
        type: "string",
        description: "Behavior when backup fails: iterate (add .1 .2), fail, overwrite",
      });
    },
    extension: (ctx): ConfigExtension => {
      const createValue = ctx.values.create as string | undefined;
      let create: CreateArg | undefined = undefined;
      if (createValue === "file" || createValue === "block") {
        create = createValue as CreateArg;
      } else if (createValue === "true" || createValue === "1") {
        create = true;
      } else if (createValue === "false" || createValue === "0") {
        create = false;
      }

      const backupValue = ctx.values.backup as string[] | undefined;
      const backupOptions = parseBackupOption(backupValue);

      if (ctx.values["backup-dir"]) {
        backupOptions.backupDir = ctx.values["backup-dir"] as string;
      }

      const stateOnFailValue = ctx.values["state-on-fail"] as string | undefined;
      let stateOnFail: StateOnFailMode | undefined = undefined;
      if (
        stateOnFailValue === "iterate" ||
        stateOnFailValue === "fail" ||
        stateOnFailValue === "overwrite"
      ) {
        stateOnFail = stateOnFailValue as StateOnFailMode;
        backupOptions.stateOnFail = stateOnFail;
      }

      return {
        name: ctx.values.name as string,
        comment: ctx.values.comment as string,
        markerStart: ctx.values["marker-start"] as string,
        markerEnd: ctx.values["marker-end"] as string,
        dos: ctx.values.dos as boolean,
        debug: ctx.values.debug as boolean,
        input: ctx.values.input as string,
        output: ctx.values.output as string,
        create,
        before: ctx.values.before as string | undefined,
        after: ctx.values.after as string | undefined,
        diff: ctx.values.diff as string | undefined,
        backup: backupValue,
        backupDir: ctx.values["backup-dir"] as string | undefined,
        stateOnFail,
        backupOptions,
      };
    },
  });
}
