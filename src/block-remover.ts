import type { LoggerExtension } from "./plugins/logger.js";

export interface RemovedBlock {
  blockName: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface RemovalStats {
  removed: number;
  orphans: number;
  totalLinesRemoved: number;
  blocks: RemovedBlock[];
}

export interface BlockRemoverOptions {
  fileContent: string;
  blockNames: string[];
  comment: string;
  markerStart: string;
  markerEnd: string;
  removeOrphans: boolean;
  debug: boolean;
  logger: LoggerExtension;
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function removeBlocks(opts: BlockRemoverOptions): { content: string; stats: RemovalStats } {
  const { fileContent, blockNames, comment, markerStart, markerEnd, removeOrphans, debug, logger } = opts;

  const lines = fileContent.split("\n");
  const stats: RemovalStats = {
    removed: 0,
    orphans: 0,
    totalLinesRemoved: 0,
    blocks: [],
  };

  let newLines: string[] = [];
  let inBlock = false;
  let blockStartLine = 0;
  let blockContent: string[] = [];
  let currentBlockName: string | null = null;

  const openerRegex = new RegExp(`^${escapeRegex(comment)}\\s+(\\S+)\\s+${escapeRegex(markerStart)}`);
  const closerRegex = new RegExp(`^${escapeRegex(comment)}\\s+(\\S+)\\s+${escapeRegex(markerEnd)}`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inBlock) {
      const expectedCloser = `${comment} ${currentBlockName || ""} ${markerEnd}`;
      const isCloser = line === expectedCloser;

      if (isCloser) {
        const isTargetBlock = currentBlockName && blockNames.includes(currentBlockName);
        const contentStr = blockContent.join("\n");
        const isOrphan = contentStr.trim() === "" || contentStr.trim().length === 0;

        if (isTargetBlock || (isOrphan && removeOrphans)) {
          stats.removed++;
          stats.totalLinesRemoved += i - blockStartLine + 1;
          stats.blocks.push({
            blockName: currentBlockName || "orphan",
            startLine: blockStartLine + 1,
            endLine: i + 1,
            content: contentStr,
          });

          if (isOrphan && removeOrphans) {
            stats.orphans++;
          }

          if (debug) {
            logger.debug(`Removed block at lines ${blockStartLine + 1}-${i + 1}: ${currentBlockName || "orphan"}`);
          }

          inBlock = false;
          currentBlockName = null;
          blockContent = [];
          continue;
        }

        newLines.push(...blockContent);
        newLines.push(line);
        inBlock = false;
        currentBlockName = null;
        blockContent = [];
      } else {
        blockContent.push(line);
      }
    } else {
      const openerMatch = line.match(openerRegex);
      if (openerMatch) {
        inBlock = true;
        blockStartLine = i;
        currentBlockName = openerMatch[1] || "";
        blockContent = [];
      } else {
        newLines.push(line);
      }
    }
  }

  if (inBlock) {
    newLines.push(...blockContent);
    if (debug) {
      logger.warn(`Warning: Unclosed block starting at line ${blockStartLine + 1}`);
    }
  }

  const content = newLines.join("\n");
  return { content, stats };
}
