import { plugin } from "gunshi/plugin";
import { parseBackupOption, type BackupOptions } from "../backup.js";

export const pluginId = "blockinfile:config" as const;
export type PluginId = typeof pluginId;

export type CreateArg = boolean | "file" | "block";
export type ModeArg = "ensure" | "only" | "none";
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
  validate?: string;
  mode?: ModeArg;
  force?: boolean;
  tempExt?: string;
  tempExtAtomic?: string;
  tempExtPrevalidate?: string;
  appendNewline?: boolean;
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
        description: "Insert block before matching line (regex or BOF for beginning of file)",
      });
      ctx.addGlobalOption("after", {
        type: "string",
        short: "a",
        description: "Insert block after matching line (regex or EOF for end of file)",
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
      ctx.addGlobalOption("validate", {
        type: "string",
        short: "v",
        description: "Validate with external command (use %s for file path)",
      });
      ctx.addGlobalOption("mode", {
        type: "string",
        description:
          "Operation mode: ensure (idempotent - skip if unchanged), only (create if missing - skip if exists), none (legacy - always update)",
      });
      ctx.addGlobalOption("force", {
        type: "boolean",
        short: "f",
        description: "Force mode - skip validation failures",
      });
      ctx.addGlobalOption("temp-ext", {
        type: "string",
        description: "Generic temp file extension (fallback for atomic/prevalidate)",
      });
      ctx.addGlobalOption("temp-ext-atomic", {
        type: "string",
        description: "Extension for atomic write temp files (default: .atomic)",
      });
      ctx.addGlobalOption("temp-ext-prevalidate", {
        type: "string",
        description: "Extension for validation temp files (default: .prevalidate)",
      });
      ctx.addGlobalOption("append-newline", {
        type: "boolean",
        description: "Append blank line after block",
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

      const modeValue = ctx.values.mode as string | undefined;
      let mode: ModeArg = "none";
      if (modeValue === "ensure" || modeValue === "only" || modeValue === "none") {
        mode = modeValue as ModeArg;
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
        validate: ctx.values.validate as string | undefined,
        mode,
        force: ctx.values.force as boolean | undefined,
        tempExt: ctx.values["temp-ext"] as string | undefined,
        tempExtAtomic: ctx.values["temp-ext-atomic"] as string | undefined,
        tempExtPrevalidate: ctx.values["temp-ext-prevalidate"] as string | undefined,
        appendNewline: ctx.values["append-newline"] as boolean | undefined,
      };
    },
  });
}
