import type { ModeArg, EnvsubstMode } from "./plugins/config.js";
import type { LoggerExtension } from "./plugins/logger.js";
import type { IOExtension } from "./plugins/io.js";
import type { DiffExtension } from "./plugins/diff.js";
import type { BackupOptions } from "./backup.js";
import { parseAndInsertBlock } from "./block-parser.js";
import { formatOutputs } from "./output.js";
import { detectBlockState, shouldSkipForMode } from "./mode-handler.js";
import { runValidation } from "./validation.ts";
import { detectConflicts } from "./conflict-detection.ts";
import { parseAttributes, applyAttributesSafe } from "./attributes.js";
import { removeBlocks, type RemovalStats } from "./block-remover.js";
import { substitute } from "./envsubst.js";

export interface ProcessContext {
  file: string;
  fileExists: boolean;
  fileContent: string;
  inputBlock: string;
  opener: string;
  closer: string;
  before?: RegExp | boolean;
  after?: RegExp | boolean;
  mode?: ModeArg;
  force?: boolean;
  create?: boolean;
  validateCmd?: string;
  debug: boolean;
  logger: LoggerExtension;
  io: IOExtension;
  diffExt: DiffExtension;
  output: string;
  dos: boolean;
  backupOptions?: BackupOptions;
  tempExt?: string;
  tempExtAtomic?: string;
  tempExtPrevalidate?: string;
  appendNewline?: boolean;
  attributes?: string;
  removeAll?: string;
  removeOrphans?: boolean;
  envsubst?: EnvsubstMode;
}

export interface ProcessResult {
  status: "written" | "skipped" | "validation-failed" | "removed";
  reason?: string;
  outputs?: string[];
  originalContent?: string;
  removalStats?: RemovalStats;
}

export async function processFile(ctx: ProcessContext): Promise<ProcessResult> {
  const {
    file,
    fileContent,
    opener,
    closer,
    inputBlock,
    before,
    after,
    mode,
    force,
    validateCmd,
    debug,
    logger,
    io,
    diffExt: _diffExt,
    output,
    dos,
    backupOptions,
    create,
    tempExt,
    tempExtAtomic,
    tempExtPrevalidate,
    appendNewline,
    attributes,
    removeAll,
    removeOrphans,
    envsubst,
  } = ctx;

  const processedInputBlock = envsubst ? substitute(inputBlock, { mode: envsubst }) : inputBlock;

  if (debug) {
    logger.debug(`Processing file: ${file}`);
  }

  const conflictResult = detectConflicts(fileContent, opener, closer, logger);
  if (conflictResult.hasConflicts) {
    throw new Error(
      `File conflicts detected:\n${conflictResult.conflicts.map((c) => c.message).join("\n")}`,
    );
  }

  if (removeAll) {
    const blockNames = removeAll
      .trim()
      .split(/\s+/)
      .filter((n) => n.length > 0);

    if (debug) {
      logger.debug(`Removing blocks: ${blockNames.join(", ")}`);
    }

    const commentMatch = opener.match(/^(#\s*|\/\/\s*)/) || opener.match(/^(\/\/\s*)/);
    const comment = commentMatch ? commentMatch[1] : "";
    const openerParts = opener.split(/\s+/);
    const closerParts = closer.split(/\s+/);
    const markerStart = openerParts[openerParts.length - 1] || "start";
    const markerEnd = closerParts[closerParts.length - 1] || "end";

    const { content, stats } = removeBlocks({
      fileContent,
      blockNames,
      comment,
      markerStart,
      markerEnd,
      removeOrphans: removeOrphans || false,
      debug,
      logger,
    });

    let originalContent: string | undefined;
    if (output === "---") {
      originalContent = fileContent;
      if (backupOptions && backupOptions.enabled) {
        const backup = await io.backupFile(file, backupOptions, fileContent);
        if (backup && debug) {
          logger.debug(`Created backup: ${backup}`);
        }
      }
    }

    const outputText = formatOutputs([content], dos);

    if (output === "---" || output === "--") {
      let tempFile: string;

      if (validateCmd && !force) {
        const ext = tempExtPrevalidate || tempExt || ".prevalidate";
        tempFile = `${file}${ext}`;
        await io.writeFile(tempFile, outputText);
        try {
          await runValidation(tempFile, validateCmd);
        } catch (err) {
          await io.deleteFile(tempFile);
          throw err;
        }
      } else {
        const ext = tempExtAtomic || tempExt || ".atomic";
        tempFile = `${file}${ext}`;
        await io.writeFile(tempFile, outputText);
      }

      await io.rename(tempFile, file);

      if (attributes) {
        const changes = parseAttributes(attributes);
        await applyAttributesSafe(file, changes, { debug, logger, io });
      }
    } else if (output === "-") {
      io.writeFile(output, outputText);
    } else {
      await io.writeFile(output, outputText);
    }

    if (debug) {
      logger.debug(`Removed ${stats.removed} block(s) (${stats.orphans} orphans) from ${file}`);
    }

    return { status: "removed", removalStats: stats, originalContent };
  }

  const blockExists = fileContent.includes(opener);
  const wouldChange = blockWouldChange(fileContent, processedInputBlock, opener, closer);
  const state = detectBlockState(ctx.fileExists, blockExists, wouldChange);

  if (mode && mode !== "none") {
    const decision = shouldSkipForMode(state, mode);
    if (decision.skip) {
      if (debug) {
        logger.debug(`mode=${mode}: skipping, ${decision.reason}`);
      }
      return { status: "skipped", reason: decision.reason };
    }
  }

  if (create && !ctx.fileExists) {
    await io.writeFile(file, "");
  } else if (before === true) {
    await io.writeFile(file, "");
  }

  const result = parseAndInsertBlock(fileContent, {
    opener,
    closer,
    inputBlock: processedInputBlock,
    before: before === true ? undefined : before,
    after: after === true ? undefined : after,
    appendNewline,
  });

  const outputText = formatOutputs(result.outputs, dos);
  if (debug) {
    logger.debug(`Output text length: ${outputText.length}`);
  }

  let originalContent: string | undefined;
  if (output === "---") {
    originalContent = fileContent;
    if (backupOptions && backupOptions.enabled) {
      const backup = await io.backupFile(file, backupOptions, fileContent);
      if (backup && debug) {
        logger.debug(`Created backup: ${backup}`);
      }
    }
  }

  if (output === "---" || output === "--") {
    let tempFile: string;

    if (validateCmd && !force) {
      const ext = tempExtPrevalidate || tempExt || ".prevalidate";
      tempFile = `${file}${ext}`;
      await io.writeFile(tempFile, outputText);
      try {
        await runValidation(tempFile, validateCmd);
      } catch (err) {
        await io.deleteFile(tempFile);
        throw err;
      }
    } else {
      const ext = tempExtAtomic || tempExt || ".atomic";
      tempFile = `${file}${ext}`;
      await io.writeFile(tempFile, outputText);
    }

    await io.rename(tempFile, file);

    if (attributes) {
      const changes = parseAttributes(attributes);
      await applyAttributesSafe(file, changes, { debug, logger, io });
    }
  } else if (output === "-") {
    io.writeFile(output, outputText);
  } else {
    await io.writeFile(output, outputText);
  }

  if (debug) {
    logger.debug(`Completed processing: ${file}`);
  }

  return { status: "written", outputs: result.outputs, originalContent };
}

function blockWouldChange(
  fileContent: string,
  inputBlock: string,
  opener: string,
  closer: string,
): boolean {
  const openerIndex = fileContent.indexOf(opener);
  if (openerIndex === -1) {
    return true;
  }

  const closerIndex = fileContent.indexOf(closer, openerIndex);
  if (closerIndex === -1) {
    return true;
  }

  const blockContent = fileContent.slice(openerIndex + opener.length, closerIndex);
  const lines = blockContent.split("\n");
  const content = lines.slice(1).join("\n");

  return content.trim() !== inputBlock.trim();
}
