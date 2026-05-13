import type { ModeArg, EnvsubstMode, AnchorOptions } from "./plugins/config.ts";
import type { LoggerExtension } from "./plugins/logger.ts";
import type { IOExtension } from "./plugins/io.ts";
import type { DiffExtension } from "./plugins/diff.ts";
import type { BackupOptions } from "./backup.ts";
import { parseAndInsertBlock } from "./block-parser.ts";
import { formatOutputs } from "./output.ts";
import { detectBlockState, shouldSkipForMode } from "./mode-handler.ts";
import { runValidation } from "./validation.ts";
import { detectConflicts, detectConflictsWithPattern } from "./conflict-detection.ts";
import { parseAttributes, applyAttributesSafe } from "./attributes.ts";
import { removeBlocks, type RemovalStats } from "./block-remover.ts";
import { substitute } from "./envsubst.ts";
import { generateTimestampTag, parseTimestampFormat } from "./timestamp.ts";
import { stripTagsForMatching, addTags, parseTags, type Tag } from "./tags/tags.ts";
import { applyTagMode } from "./tags/tag-merger.ts";
import type { TagMode } from "./tags/tag-mode.ts";

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
  additive?: boolean;
  additiveBefore?: string;
  additiveAfter?: string;
  timestamp?: string;
  tagMode?: string;
  anchor?: AnchorOptions;
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
    additive,
    additiveBefore,
    additiveAfter,
    timestamp,
    tagMode,
    anchor,
  } = ctx;

  const processedInputBlock = envsubst ? substitute(inputBlock, { mode: envsubst }) : inputBlock;

  if (debug) {
    logger.debug(`Processing file: ${file}`);
  }

  if (additiveBefore && additiveAfter) {
    throw new Error("Cannot specify both --additive-before and --additive-after");
  }

  let parsedAdditiveBefore: RegExp | "EOB" | "EOF" | "BOF" | undefined;
  let parsedAdditiveAfter: RegExp | "EOB" | "EOF" | "BOF" | undefined;

  if (additiveBefore) {
    if (additiveBefore === "EOB" || additiveBefore === "EOF" || additiveBefore === "BOF") {
      parsedAdditiveBefore = additiveBefore;
    } else {
      parsedAdditiveBefore = new RegExp(additiveBefore);
    }
  }

  if (additiveAfter) {
    if (additiveAfter === "EOF" || additiveAfter === "EOB" || additiveAfter === "BOF") {
      parsedAdditiveAfter = additiveAfter;
    } else {
      parsedAdditiveAfter = new RegExp(additiveAfter);
    }
  }

  const timestampFormat = parseTimestampFormat(timestamp);

  let parsedTagMode: TagMode = "merge";
  if (tagMode) {
    if (tagMode === "merge" || tagMode === "replace") {
      parsedTagMode = tagMode;
    }
  }

  let newTags: Tag[] = [];

  if (timestampFormat) {
    newTags.push({
      name: "timestamp",
      value: generateTimestampTag(timestampFormat)
        .replace(/^\[timestamp:/, "")
        .replace(/\]$/, ""),
    });
  }

  if (anchor) {
    newTags.push({
      name: `anchor-${anchor.type}`,
      value: String(anchor.priority),
    });
  }

  let existingTags: Tag[] = [];
  const lines = fileContent.split("\n");

  for (const line of lines) {
    const strippedLine = stripTagsForMatching(line.trim());
    if (strippedLine === opener) {
      existingTags = parseTags(line);
      break;
    }
  }

  const finalTags = applyTagMode(existingTags, newTags, parsedTagMode);

  let actualOpener = opener;
  let openerPattern: RegExp | undefined;
  let closerPattern: RegExp | undefined;

  if (finalTags.length > 0) {
    actualOpener = addTags(opener, finalTags);

    const openerBase = opener.replace(/\s+/g, "\\s+");
    const closerBase = closer.replace(/\s+/g, "\\s+");
    openerPattern = new RegExp(
      `^\\s*${openerBase}(\\s+\\[[a-zA-Z0-9_-]+(?::[^\\[\\]]+)?\\])*\\s*$`,
    );
    closerPattern = new RegExp(`^\\s*${closerBase}\\s*$`);
  }

  const conflictResult =
    finalTags.length > 0
      ? detectConflictsWithPattern(
          fileContent,
          opener,
          closer,
          openerPattern!,
          closerPattern!,
          logger,
        )
      : detectConflicts(fileContent, opener, closer, logger);
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
    const comment = commentMatch ? commentMatch[1].trimEnd() : "";
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
    opener: opener,
    closer: closer,
    inputBlock: processedInputBlock,
    before: before === true ? undefined : before,
    after: after === true ? undefined : after,
    appendNewline,
    additive,
    additiveBefore: parsedAdditiveBefore,
    additiveAfter: parsedAdditiveAfter,
    actualOpener: finalTags.length > 0 ? actualOpener : undefined,
    anchor,
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
