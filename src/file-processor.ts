import type { ModeArg, EnvsubstMode, AnchorOptions } from "./plugins/config.ts";
import type { LoggerExtension } from "./plugins/logger.ts";
import type { IOExtension } from "./plugins/io.ts";
import type { DiffExtension } from "./plugins/diff.ts";
import type { BackupOptions } from "./backup.ts";
import { blockInputLines, parseAndInsertBlock, type BlankLinesMode } from "./block-parser.ts";
import { formatOutputs } from "./output.ts";
import { detectBlockState, shouldSkipForMode } from "./mode-handler.ts";
import { runValidation } from "./validation.ts";
import { detectConflicts, detectConflictsWithPattern } from "./conflict-detection.ts";
import { parseAttributes, applyAttributesSafe } from "./attributes.ts";
import { removeBlocks, type RemovalStats } from "./block-remover.ts";
import {
  flipBlocks,
  commentBody,
  detectFlipConflicts,
  splitBlockNames,
  STATE_TAG,
  hasStateTag,
  type CommentState,
  type FlipStats,
} from "./block-commenter.ts";
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
  adopt?: RegExp;
  updateOnly?: boolean;
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
  blankLines?: BlankLinesMode;
  attributes?: string;
  removeAll?: string;
  remove?: string[];
  removeMatch?: string[];
  removeOrphans?: boolean;
  comment?: string;
  name?: string;
  commentOut?: boolean;
  uncomment?: boolean;
  commented?: boolean;
  commentOutAll?: string;
  uncommentAll?: string;
  commentOutMatch?: string[];
  uncommentMatch?: string[];
  envsubst?: EnvsubstMode;
  envsubstExclude?: RegExp;
  sourceAttribution?: boolean;
  sourceLine?: string;
  sourceLinePrefix?: string;
  sourceLabelExplicit?: boolean;
  additive?: boolean;
  additiveBefore?: string;
  additiveAfter?: string;
  timestamp?: string;
  tagMode?: string;
  anchor?: AnchorOptions;
}

export interface ProcessResult {
  status: "written" | "skipped" | "validation-failed" | "removed" | "flipped";
  reason?: string;
  outputs?: string[];
  originalContent?: string;
  removalStats?: RemovalStats;
  flipStats?: FlipStats;
}

export async function processFile(ctx: ProcessContext): Promise<ProcessResult> {
  const {
    file,
    fileContent,
    opener,
    closer,
    name,
    inputBlock,
    before,
    after,
    adopt,
    updateOnly,
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
    blankLines = "keep",
    attributes,
    removeAll,
    remove = [],
    removeMatch = [],
    removeOrphans,
    commentOut,
    uncomment,
    commented,
    commentOutAll,
    uncommentAll,
    commentOutMatch = [],
    uncommentMatch = [],
    envsubst,
    envsubstExclude,
    sourceLine,
    sourceLinePrefix,
    sourceLabelExplicit,
    additive,
    additiveBefore,
    additiveAfter,
    timestamp,
    tagMode,
    anchor,
  } = ctx;

  const processedInputBlock = envsubst
    ? substitute(inputBlock, { mode: envsubst, exclude: envsubstExclude })
    : inputBlock;

  if (debug) {
    logger.debug(`Processing file: ${file}`);
  }

  if (additiveBefore && additiveAfter) {
    throw new Error("Cannot specify both --additive-before and --additive-after");
  }

  const commentOutFlags = [
    ...(commentOut ? ["--comment-out"] : []),
    ...(commentOutAll !== undefined ? ["--comment-out-all"] : []),
    ...(commentOutMatch.length > 0 ? ["--comment-out-match"] : []),
  ];
  const uncommentFlags = [
    ...(uncomment ? ["--uncomment"] : []),
    ...(uncommentAll !== undefined ? ["--uncomment-all"] : []),
    ...(uncommentMatch.length > 0 ? ["--uncomment-match"] : []),
  ];
  if (commentOutFlags.length > 0 && uncommentFlags.length > 0) {
    throw new Error(`Cannot combine ${commentOutFlags[0]} and ${uncommentFlags[0]}`);
  }

  const flipping = commentOutFlags.length > 0 || uncommentFlags.length > 0;
  if (flipping && commented) {
    throw new Error("Cannot combine --comment-out/--uncomment with --commented");
  }

  if (flipping && (removeAll || remove.length > 0 || removeMatch.length > 0 || removeOrphans)) {
    throw new Error("Cannot combine --comment-out/--uncomment with removal flags");
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

  const recordedCommented = hasStateTag(existingTags);
  // The [commented] tag is structural: the tool owns the `commented` tag
  // name outright — presence is the state — re-recording it (or dropping
  // it) on every emission, never merged or replaced by --tag-mode.
  const structuralTags = existingTags.filter((tag) => tag.name !== STATE_TAG.name);
  const emitCommented = Boolean(commented) || recordedCommented;

  const finalTags = [...applyTagMode(structuralTags, newTags, parsedTagMode)];
  if (emitCommented) finalTags.push(STATE_TAG);

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

  const commitOutput = async (text: string): Promise<string | undefined> => {
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

    const outputText = formatOutputs(text.split("\n"), dos);

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

    return originalContent;
  };

  if (flipping) {
    const flagNames = [...commentOutFlags, ...uncommentFlags];
    const target: CommentState = commentOutFlags.length > 0 ? "commented" : "active";
    const flipNames = [
      // The base flips address --name; the family flags bring their own names.
      ...(commentOut || uncomment ? [name ?? "blockinfile"] : []),
      ...splitBlockNames(commentOutAll ?? ""),
      ...splitBlockNames(uncommentAll ?? ""),
    ];
    const flipPatterns = [...commentOutMatch, ...uncommentMatch].map(
      (pattern) => new RegExp(pattern),
    );

    if (flipNames.length === 0 && flipPatterns.length === 0) {
      throw new Error(`${flagNames.join(", ")}: no block names or patterns given`);
    }

    if (debug) {
      logger.debug(`Flipping blocks: ${flipNames.join(", ") || "(patterns only)"}`);
      const patternSrcs = flipPatterns.map((pattern) => pattern.source).join(", ");
      if (patternSrcs) logger.debug(`Flipping blocks matching: ${patternSrcs}`);
    }

    // Marker parts come off the prebuilt opener/closer, as the removal branch
    // does; the conflict gate then checks every concrete addressed name like
    // the ensure path checks the named block.
    const comment = ctx.comment ?? "#";
    const openerParts = opener.split(/\s+/);
    const closerParts = closer.split(/\s+/);
    const markerStart = openerParts[openerParts.length - 1] || "start";
    const markerEnd = closerParts[closerParts.length - 1] || "end";
    const selection = {
      fileContent,
      blockNames: flipNames,
      blockNamePatterns: flipPatterns,
      comment,
      markerStart,
      markerEnd,
    };

    const conflicts = detectFlipConflicts(selection);
    if (conflicts.length > 0) {
      throw new Error(`File conflicts detected:\n${conflicts.map((c) => c.message).join("\n")}`);
    }

    const { content, stats } = flipBlocks({
      ...selection,
      sourceLinePrefix,
      target,
      debug,
      logger,
    });

    if (stats.flipped === 0 && stats.alreadyInState === 0) {
      const prefix = comment.trimEnd();
      const names = flipNames
        .map((blockName) => `'${prefix} ${blockName} ${markerStart}'`)
        .join(", ");
      const patterns = flipPatterns.map((pattern) => `/${pattern.source}/`).join(", ");
      const address = [names, patterns].filter(Boolean).join(", ");
      throw new Error(`${flagNames.join(", ")}: no block ${address} found in ${file}`);
    }

    if (debug) {
      logger.debug(
        `${flagNames.join(", ")}: flipped ${stats.flipped} block(s), ${stats.alreadyInState} already in state, ${stats.linesChanged} line(s) changed`,
      );
    }

    const originalContent = await commitOutput(content);
    return { status: "flipped", outputs: content.split("\n"), originalContent, flipStats: stats };
  }

  if (removeAll || remove.length > 0 || removeMatch.length > 0 || removeOrphans) {
    const blockNames = [
      ...(removeAll
        ? removeAll
            .trim()
            .split(/\s+/)
            .filter((name) => name.length > 0)
        : []),
      ...remove,
    ];
    const blockNamePatterns = removeMatch.map((pattern) => new RegExp(pattern));

    if (debug) {
      logger.debug(`Removing blocks: ${blockNames.join(", ")}`);
      logger.debug(`Removing blocks matching: ${removeMatch.join(", ")}`);
    }

    // Prefer the configured comment prefix; the opener sniff only knows #
    // and //, so custom prefixes (e.g. Lisp ";;") silently matched nothing
    // and removal no-opped.
    const commentMatch = opener.match(/^(#\s*|\/\/\s*)/) || opener.match(/^(\/\/\s*)/);
    const comment = ctx.comment ?? (commentMatch ? commentMatch[1] : "");
    const openerParts = opener.split(/\s+/);
    const closerParts = closer.split(/\s+/);
    const markerStart = openerParts[openerParts.length - 1] || "start";
    const markerEnd = closerParts[closerParts.length - 1] || "end";

    const { content, stats } = removeBlocks({
      fileContent,
      blockNames,
      blockNamePatterns,
      comment,
      markerStart,
      markerEnd,
      removeOrphans: removeOrphans || false,
      debug,
      logger,
    });

    const originalContent = await commitOutput(content);

    if (debug) {
      logger.debug(`Removed ${stats.removed} block(s) (${stats.orphans} orphans) from ${file}`);
    }

    return { status: "removed", removalStats: stats, originalContent };
  }

  if (updateOnly && !ctx.fileExists) {
    throw new Error(`--create false: target file does not exist: ${file}`);
  }

  if (updateOnly && !lines.some((line) => stripTagsForMatching(line.trim()) === opener)) {
    throw new Error(`--create false: managed block ${JSON.stringify(opener)} not found in ${file}`);
  }

  if (additive && emitCommented) {
    throw new Error(
      "--additive cannot be combined with commented emission (--commented or a [commented] block)",
    );
  }

  // Commented blocks keep their commented emission across updates: the
  // recorded state decides, so a running recipe does not silently re-enable
  // a disabled block. --commented forces commented emission regardless.
  const emissionBlock = emitCommented
    ? commentBody(processedInputBlock, ctx.comment ?? "#")
    : processedInputBlock;

  const blockExists = fileContent.includes(opener);
  const wouldChange = blockWouldChange(
    fileContent,
    emissionBlock,
    opener,
    closer,
    sourceLinePrefix,
    sourceLine,
    blankLines,
    sourceLabelExplicit,
  );
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
    inputBlock: emissionBlock,
    before: before === true ? undefined : before,
    after: after === true ? undefined : after,
    adopt,
    appendNewline,
    blankLines,
    additive,
    additiveBefore: parsedAdditiveBefore,
    additiveAfter: parsedAdditiveAfter,
    actualOpener: finalTags.length > 0 ? actualOpener : undefined,
    anchor,
    sourceLine,
    sourceLinePrefix,
  });

  const outputText = formatOutputs(result.outputs, dos);
  if (debug) {
    logger.debug(`Output text length: ${outputText.length}`);
  }

  const originalContent = await commitOutput(result.outputs.join("\n"));

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
  sourceLinePrefix?: string,
  sourceLine?: string,
  blankLines: BlankLinesMode = "keep",
  sourceLabelExplicit = false,
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
  const bodyLines = lines.slice(1, -1);
  const content = lines
    .slice(1)
    .filter((line) => !sourceLinePrefix || !line.startsWith(sourceLinePrefix))
    .join("\n");

  const existingSources = lines
    .slice(1)
    .filter((line) => sourceLinePrefix && line.startsWith(sourceLinePrefix));
  return (
    (blankLines === "keep"
      ? content.trim() !== inputBlock.trim()
      : content
          .split("\n")
          .filter((line) => line.trim() !== "")
          .join("\n") !== blockInputLines(inputBlock, blankLines).join("\n") ||
        bodyLines.some((line) => line.trim() === "")) ||
    (sourceLine === undefined
      ? existingSources.length !== 0
      : existingSources.length === 0 && !sourceLabelExplicit
        ? false
        : existingSources.length !== 1 || existingSources[0] !== sourceLine)
  );
}
