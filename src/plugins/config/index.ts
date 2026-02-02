import { plugin } from "gunshi/plugin";
import { pluginId, type ConfigExtension } from "./types.js";

export type CreateArg = boolean | "file" | "block";

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
    },
    extension: (ctx): ConfigExtension => {
      const createValue = ctx.values.create;
      let create: CreateArg | undefined = undefined;
      if (createValue === "file" || createValue === "block") {
        create = createValue;
      } else if (createValue === "true" || createValue === "1") {
        create = true;
      } else if (createValue === "false" || createValue === "0") {
        create = false;
      }

      return {
        name: ctx.values.name,
        comment: ctx.values.comment,
        markerStart: ctx.values["marker-start"],
        markerEnd: ctx.values["marker-end"],
        dos: ctx.values.dos,
        debug: ctx.values.debug,
        input: ctx.values.input,
        output: ctx.values.output,
        create,
        before: ctx.values.before,
        after: ctx.values.after,
        diff: ctx.values.diff,
      };
    },
  });
}
