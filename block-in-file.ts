#!/usr/bin/env -S npx tsx
import { cli, define } from "gunshi";
import { pluginId as configId, type ConfigExtension } from "./src/plugins/config/types.js";
import { pluginId as loggerId, type LoggerExtension } from "./src/plugins/logger/types.js";
import { pluginId as ioId, type IOExtension } from "./src/plugins/io/types.js";
import { pluginId as diffId, type DiffExtension } from "./src/plugins/diff/types.js";
import logger from "./src/plugins/logger/index.js";
import config from "./src/plugins/config/index.js";
import io from "./src/plugins/io/index.js";
import diff from "./src/plugins/diff/index.js";
import { parseAndInsertBlock } from "./src/block-parser.js";
import { formatOutputs } from "./src/output.js";

const command = define<{
  extensions: Record<typeof configId, ConfigExtension> &
    Record<typeof loggerId, LoggerExtension> &
    Record<typeof ioId, IOExtension> &
    Record<typeof diffId, DiffExtension>;
}>({
  name: "insert",
  description: "Insert & update blocks of text in file",
  run: async (ctx) => {
    const { extensions, positionals } = ctx;
    const configExt = extensions[configId];
    const logger = extensions[loggerId];
    const io = extensions[ioId];
    const diffExt = extensions[diffId];

    const files = (positionals as string[]) || [];

    if (files.length === 0 && !configExt.diff) {
      if (configExt.output === "---" || !configExt.output) {
        throw new Error("Need file argument or output target");
      }
    }

    if (files.length === 0 && configExt.diff) {
      throw new Error("Need file argument for diff mode");
    }

    logger.debug(`Processing ${files.length} file(s)`);

    const opener = `${configExt.comment} ${configExt.name} ${configExt.markerStart}`;
    const closer = `${configExt.comment} ${configExt.name} ${configExt.markerEnd}`;

    const inputBlock = await io.readFile(configExt.input);
    logger.debug(`Input block: ${inputBlock.slice(0, 50)}...`);

    for (const file of files) {
      logger.debug(`Processing file: ${file}`);

      let originalContent = "";
      if (configExt.diff) {
        try {
          originalContent = await io.readFile(file);
        } catch {
          logger.debug(`File does not exist yet: ${file}`);
        }
      }

      let fileContent: string;
      try {
        fileContent = await io.readFile(file);
      } catch {
        if (!configExt.create && configExt.create !== "file") {
          throw new Error(`File does not exist and create not enabled: ${file}`);
        }
        fileContent = "";
      }

      const before = configExt.before ? new RegExp(configExt.before) : undefined;
      const after = configExt.after ? new RegExp(configExt.after) : undefined;

      if (before && after) {
        throw new Error("Cannot have both 'before' and 'after'");
      }

      const { outputs } = parseAndInsertBlock(fileContent, {
        opener,
        closer,
        inputBlock,
        before,
        after,
      });

      const outputText = formatOutputs(outputs, configExt.dos);
      logger.debug(`Output text length: ${outputText.length}`);

      if (configExt.diff) {
        await diffExt.writeDiff(configExt.diff, originalContent, outputText, file);
      } else if (configExt.output === "---") {
        await io.writeFile(file, outputText);
      } else if (configExt.output === "-") {
        io.writeFile(configExt.output, outputText);
      } else if (configExt.output === "--") {
        await io.writeFile(file, outputText);
      } else {
        await io.writeFile(configExt.output, outputText);
      }

      logger.debug(`Completed processing: ${file}`);
    }

    logger.log("Done!");
  },
});

cli(process.argv.slice(2), command, {
  name: "block-in-file",
  version: "1.0.0",
  plugins: [logger(), config(), io(), diff()],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
