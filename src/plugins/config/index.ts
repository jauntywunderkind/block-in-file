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
      const createValue = ctx.values.create as string | undefined;
      let create: CreateArg | undefined = undefined;
      if (createValue === "file" || createValue === "block") {
        create = createValue as CreateArg;
      } else if (createValue === "true" || createValue === "1") {
        create = true;
      } else if (createValue === "false" || createValue === "0") {
        create = false;
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
      };
    },
  });
}
