import { parseTags } from "./tags/tags.ts";

export type AnchorType = "bof" | "eof";

export interface AnchorInfo {
  type: AnchorType;
  priority: number;
}

export interface BlockInfo {
  startIndex: number;
  endIndex: number;
  anchor?: AnchorInfo;
  openerLine: string;
}

export function parseAnchorFromTags(tags: Array<{ name: string; value: string }>): AnchorInfo | undefined {
  for (const tag of tags) {
    if (tag.name === "anchor-bof") {
      return { type: "bof", priority: parseInt(tag.value, 10) || 100 };
    }
    if (tag.name === "anchor-eof") {
      return { type: "eof", priority: parseInt(tag.value, 10) || 100 };
    }
  }
  return undefined;
}

export function parseAnchorFromLine(line: string): AnchorInfo | undefined {
  const tags = parseTags(line);
  return parseAnchorFromTags(tags);
}

export function findBlocksAndAnchors(
  lines: string[],
  openerBase: string,
  closerBase: string,
): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    const openerMatch = line.startsWith(openerBase) || line.includes(openerBase);
    
    if (openerMatch) {
      const anchor = parseAnchorFromLine(line);
      const startIndex = i;
      let endIndex = i;
      
      for (let j = i + 1; j < lines.length; j++) {
        const closerMatch = lines[j].trim().startsWith(closerBase) || lines[j].trim() === closerBase;
        if (closerMatch) {
          endIndex = j;
          break;
        }
      }
      
      blocks.push({
        startIndex,
        endIndex,
        anchor,
        openerLine: lines[i],
      });
      
      i = endIndex + 1;
    } else {
      i++;
    }
  }
  
  return blocks;
}

export function calculateInsertPosition(
  lines: string[],
  anchor: AnchorInfo | undefined,
  existingBlocks: BlockInfo[],
): number {
  if (!anchor) {
    const lastBofBlock = existingBlocks
      .filter((b) => b.anchor?.type === "bof")
      .sort((a, b) => (b.anchor?.priority || 0) - (a.anchor?.priority || 0))[0];
    
    const firstEofBlock = existingBlocks
      .filter((b) => b.anchor?.type === "eof")
      .sort((a, b) => (a.anchor?.priority || 0) - (b.anchor?.priority || 0))[0];
    
    if (lastBofBlock) {
      return lastBofBlock.endIndex + 1;
    }
    if (firstEofBlock) {
      return firstEofBlock.startIndex;
    }
    
    return lines.length;
  }
  
  if (anchor.type === "bof") {
    const bofBlocks = existingBlocks.filter((b) => b.anchor?.type === "bof");
    
    const higherPriorityBlocks = bofBlocks.filter(
      (b) => (b.anchor?.priority || 0) > anchor.priority,
    );
    
    if (higherPriorityBlocks.length === 0) {
      return 0;
    }
    
    const lastHigher = higherPriorityBlocks.sort(
      (a, b) => (b.anchor?.priority || 0) - (a.anchor?.priority || 0),
    )[0];
    
    return lastHigher.endIndex + 1;
  }
  
  if (anchor.type === "eof") {
    const eofBlocks = existingBlocks.filter((b) => b.anchor?.type === "eof");
    
    const higherOrEqualPriorityBlocks = eofBlocks.filter(
      (b) => (b.anchor?.priority || 0) >= anchor.priority,
    );
    
    if (higherOrEqualPriorityBlocks.length === 0) {
      const allEofBlocks = eofBlocks.sort(
        (a, b) => (b.anchor?.priority || 0) - (a.anchor?.priority || 0),
      );
      
      if (allEofBlocks.length > 0) {
        return allEofBlocks[allEofBlocks.length - 1].endIndex + 1;
      }
      
      return lines.length;
    }
    
    const firstHigher = higherOrEqualPriorityBlocks.sort(
      (a, b) => (a.anchor?.priority || 0) - (b.anchor?.priority || 0),
    )[0];
    
    return firstHigher.startIndex;
  }
  
  return lines.length;
}
