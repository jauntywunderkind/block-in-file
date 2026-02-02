#!/usr/bin/env -S npx tsx
import { cli, define } from "gunshi";
import { pluginId as configId, type ConfigExtension } from "./src/plugins/config.js";
import { pluginId as loggerId, type LoggerExtension } from "./src/plugins/logger.js";
import { pluginId as ioId, type IOExtension } from "./src/plugins/io.js";
import { pluginId as diffId, type DiffExtension } from "./src/plugins/diff.js";
import logger from "./src/plugins/logger.js";
import config from "./src/plugins/config.js";
import io from "./src/plugins/io.js";
import diff from "./src/plugins/diff.js";
import { processFile, type ProcessContext, type ProcessResult } from "./src/file-processor.js";

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

    if (configExt.debug) {
      logger.debug(`Processing ${files.length} file(s)`);
    }

    const opener = `${configExt.comment} ${configExt.name} ${configExt.markerStart}`;
    const closer = `${configExt.comment} ${configExt.name} ${configExt.markerEnd}`;

    const inputBlock = await io.readFile(configExt.input);
    if (configExt.debug) {
      logger.debug(`Input block: ${inputBlock.slice(0, 50)}...`);
    }

    const before = configExt.before ? new RegExp(configExt.before) : undefined;
    const after = configExt.after ? new RegExp(configExt.after) : undefined;

    const results: ProcessResult[] = [];

    for (const file of files) {
      const fileExists = await io.fileExists(file);
      let fileContent = "";

      if (fileExists) {
        try {
          fileContent = await io.readFile(file);
        } catch {
          if (configExt.debug) {
            logger.debug(`File does not exist yet: ${file}`);
          }
        }
      }

      const processContext: ProcessContext = {
        file,
        fileExists,
        fileContent,
        inputBlock,
        opener,
        closer,
        before,
        after,
        mode: configExt.mode,
        force: configExt.force,
        create: configExt.create === true || configExt.create === "file",
        validateCmd: configExt.validate,
        debug: configExt.debug,
        logger,
        io,
        diffExt,
        output: configExt.output,
        dos: configExt.dos,
        backupOptions: configExt.backupOptions,
        tempExt: configExt.tempExt,
        tempExtAtomic: configExt.tempExtAtomic,
        tempExtPrevalidate: configExt.tempExtPrevalidate,
        appendNewline: configExt.appendNewline,
        attributes: configExt.attributes,
        removeAll: configExt.removeAll,
        removeOrphans: configExt.removeOrphans,
        envsubst: configExt.envsubst,
      };

      const result = await processFile(processContext);
      results.push(result);

      if (configExt.diff && result.status === "written" && result.originalContent !== undefined) {
        await diffExt.writeDiff(
          configExt.diff,
          result.originalContent,
          result.outputs?.join("\n") || "",
          file,
        );
      }
    }

    if (configExt.debug || configExt.removeAll) {
      const written = results.filter((r) => r.status === "written").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const removed = results.filter((r) => r.status === "removed").length;
      const totalRemoved = results
        .filter((r) => r.status === "removed")
        .reduce((sum, r) => sum + (r.removalStats?.removed || 0), 0);
      const totalOrphans = results
        .filter((r) => r.status === "removed")
        .reduce((sum, r) => sum + (r.removalStats?.orphans || 0), 0);

      if (configExt.removeAll) {
        logger.log(
          `Done! Removed: ${removed} files, ${totalRemoved} blocks, ${totalOrphans} orphans`,
        );
      } else {
        logger.log(`Done! Written: ${written}, Skipped: ${skipped}`);
      }
    } else {
      logger.log("Done!");
    }
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
