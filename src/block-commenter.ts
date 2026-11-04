import type { LoggerExtension } from "./plugins/logger.ts";
import { detectConflicts, type Conflict } from "./conflict-detection.ts";
import { addTags, parseTags, stripTagsForMatching, type Tag } from "./tags/tags.ts";
import { escapeRegex } from "./block-remover.ts";

/** Marker tag recording that a block's body is emitted commented out. Presence is the state; values are not used. */
export const STATE_TAG: Tag = { name: "commented", value: "" };

export type CommentState = "commented" | "active";

export function hasStateTag(tags: readonly Tag[]): boolean {
  return tags.some((tag) => tag.name === STATE_TAG.name);
}

/** Rebuild a marker line without its `[commented]` tag, keeping others. */
export function removeStateTag(line: string): string {
  const kept = parseTags(line).filter((tag) => tag.name !== STATE_TAG.name);
  return addTags(stripTagsForMatching(line), kept);
}

/**
 * Prefix one body line with the comment character, after any indentation so
 * indented dialects stay inside their nesting. Blank and whitespace-only
 * lines are untouched. Prefixes stack (`# note` -> `# # note`), one layer
 * per comment-out, so stripping can undo exactly one layer.
 */
export function commentBodyLine(line: string, comment: string): string {
  const prefix = comment.trimEnd();
  if (line.trim() === "") return line;
  const indent = line.slice(0, line.length - line.trimStart().length);
  return `${indent}${prefix} ${line.trimStart()}`;
}

/** Remove exactly one comment prefix (plus at most one space) after the indentation. */
export function stripCommentLayer(line: string, comment: string): string {
  const prefix = comment.trimEnd();
  if (prefix === "") return line;
  const pattern = new RegExp(`^(\\s*)${escapeRegex(prefix)} ?`);
  return pattern.test(line) ? line.replace(pattern, "$1") : line;
}

/** Comment every line of a block input (see {@link commentBodyLine}). */
export function commentBody(input: string, comment: string): string {
  return input
    .split("\n")
    .map((line) => commentBodyLine(line, comment))
    .join("\n");
}

export interface FlippedBlock {
  name: string;
  startLine: number;
  endLine: number;
  target: CommentState;
}

export interface FlipStats {
  /** Blocks transitioned to the requested state */
  flipped: number;
  /** Blocks already in the requested state (left untouched) */
  alreadyInState: number;
  /** Body lines rewritten (marker line excluded) */
  linesChanged: number;
  blocks: FlippedBlock[];
}

/** Split a space-separated block-name list, dropping empties. */
export function splitBlockNames(spec: string): string[] {
  return spec
    .trim()
    .split(/\s+/)
    .filter((name) => name.length > 0);
}

export interface FlipSelection {
  fileContent: string;
  /** Exact block names to flip */
  blockNames: string[];
  /** Regexes tested against captured block names */
  blockNamePatterns?: RegExp[];
  /** Comment prefix shaping markers and body transforms */
  comment: string;
  markerStart: string;
  markerEnd: string;
}

/**
 * Concrete names addressed by a flip selection: the explicit names plus every
 * name discovered in the file whose opener matches one of the patterns.
 */
export function findFlipTargetNames(selection: FlipSelection): string[] {
  const { fileContent, blockNames, blockNamePatterns = [], comment, markerStart } = selection;
  const openerRegex = buildOpenerRegex(comment, markerStart);
  const found = new Set<string>();
  for (const line of fileContent.split("\n")) {
    const match = stripTagsForMatching(line.trim()).match(openerRegex);
    const name = match?.[1];
    if (!name) continue;
    if (blockNames.includes(name) || blockNamePatterns.some((pattern) => pattern.test(name))) {
      found.add(name);
    }
  }
  return [...found];
}

/**
 * Conflict gate for flips: each concrete addressed name gets the same
 * duplicate/nested/unmatched checks the ensure path runs on the named block,
 * so a selection never flips a duplicated or unclosed block silently.
 */
export function detectFlipConflicts(selection: FlipSelection): Conflict[] {
  const prefix = selection.comment.trimEnd();
  const conflicts: Conflict[] = [];
  for (const name of findFlipTargetNames(selection)) {
    const opener = `${prefix} ${name} ${selection.markerStart}`;
    const closer = `${prefix} ${name} ${selection.markerEnd}`;
    conflicts.push(...detectConflicts(selection.fileContent, opener, closer).conflicts);
  }
  return conflicts;
}

/** Tag-stripped marker matching: `# name start` for any capturable name. */
function buildOpenerRegex(comment: string, markerStart: string): RegExp {
  const prefix = comment.trimEnd();
  return new RegExp(`^${escapeRegex(prefix)}\\s+(\\S+)\\s+${escapeRegex(markerStart)}$`);
}

export interface FlipOptions extends FlipSelection {
  /** Provenance prefix (e.g. `# source:`); matching lines are never transformed */
  sourceLinePrefix?: string;
  /** Requested state after the flip */
  target: CommentState;
  debug?: boolean;
  logger?: LoggerExtension;
}

/**
 * Flip every occurrence of the addressed blocks (exact names or name regexes)
 * between commented and active in place, without reading block input. Mirrors
 * block-reader.ts matching (trim + tag-strip equality) and block-remover.ts
 * terminal semantics: the provenance line and blank lines are structural and
 * untouched, an unclosed block is transformed to end of file with a warning.
 */
export function flipBlocks(opts: FlipOptions): { content: string; stats: FlipStats } {
  const {
    fileContent,
    blockNames,
    blockNamePatterns = [],
    comment,
    markerStart,
    markerEnd,
    sourceLinePrefix,
    target,
    debug,
    logger,
  } = opts;
  const lines = fileContent.split("\n");

  const openerRegex = buildOpenerRegex(comment, markerStart);
  const prefix = comment.trimEnd();
  const isTargetName = (name: string) =>
    blockNames.includes(name) || blockNamePatterns.some((pattern) => pattern.test(name));

  /** Capture the block name when the line is an opener, else null. */
  const captureOpener = (line: string): string | null => {
    const match = stripTagsForMatching(line.trim()).match(openerRegex);
    return match?.[1] ?? null;
  };
  const isCloserOf = (line: string, name: string) =>
    stripTagsForMatching(line.trim()) === `${prefix} ${name} ${markerEnd}`;
  const isSourceLine = (line: string) =>
    sourceLinePrefix ? line.trim().startsWith(sourceLinePrefix) : false;

  const stats: FlipStats = { flipped: 0, alreadyInState: 0, linesChanged: 0, blocks: [] };
  const outputs: string[] = [];

  let openerLine: string | undefined;
  let openerName: string | undefined;
  let openerTags: Tag[] = [];
  let body: string[] = [];
  let bodyStartLine = 0;

  const flush = (closerLine: string | undefined, endLine: number) => {
    if (openerLine === undefined || openerName === undefined) return;
    const commented = hasStateTag(openerTags);
    if (commented === (target === "commented")) {
      stats.alreadyInState++;
      outputs.push(openerLine, ...body);
      if (closerLine !== undefined) outputs.push(closerLine);
      return;
    }

    const newBody = body.map((line) => {
      if (line.trim() === "" || isSourceLine(line)) return line;
      return target === "commented"
        ? commentBodyLine(line, comment)
        : stripCommentLayer(line, comment);
    });
    const newOpener =
      target === "commented" ? addTags(openerLine, [STATE_TAG]) : removeStateTag(openerLine);

    stats.linesChanged += newBody.filter((line, i) => line !== body[i]).length;
    stats.flipped++;
    stats.blocks.push({ name: openerName, startLine: bodyStartLine - 1, endLine, target });

    outputs.push(newOpener, ...newBody);
    if (closerLine !== undefined) outputs.push(closerLine);

    if (debug && logger) {
      logger.debug(
        `Flipped block '${openerName}' to ${target} at lines ${bodyStartLine - 1}-${endLine || "EOF"}`,
      );
    }
  };

  for (const line of lines) {
    if (openerLine === undefined || openerName === undefined) {
      const name = captureOpener(line);
      if (name !== null && isTargetName(name)) {
        openerLine = line;
        openerName = name;
        openerTags = parseTags(line);
        body = [];
        bodyStartLine = outputs.length + 2;
      } else {
        outputs.push(line);
      }
      continue;
    }
    if (isCloserOf(line, openerName)) {
      flush(line, outputs.length + body.length + 2);
      openerLine = undefined;
      openerName = undefined;
      body = [];
      continue;
    }
    body.push(line);
  }

  if (openerLine !== undefined) {
    if (logger) {
      logger.warn(`Warning: Unclosed block starting at line ${bodyStartLine - 1}`);
    }
    flush(undefined, 0);
  }

  return { content: outputs.join("\n"), stats };
}
