import type { LoggerExtension } from "./plugins/logger.ts";

export interface Conflict {
  type: "duplicate" | "nested" | "mismatched";
  line: number;
  message: string;
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: Conflict[];
}

export function detectConflicts(
  fileContent: string,
  opener: string,
  closer: string,
  logger?: LoggerExtension,
): ConflictDetectionResult {
  const lines = fileContent.split("\n");
  const conflicts: Conflict[] = [];
  const openerPositions: number[] = [];
  const closerPositions: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === opener) {
      openerPositions.push(i);
    } else if (line === closer) {
      closerPositions.push(i);
    }
  }

  if (openerPositions.length > 1) {
    for (const pos of openerPositions) {
      conflicts.push({
        type: "duplicate",
        line: pos + 1,
        message: `Duplicate block opener found at line ${pos + 1}`,
      });
    }
  }

  if (closerPositions.length > 1) {
    for (const pos of closerPositions) {
      conflicts.push({
        type: "duplicate",
        line: pos + 1,
        message: `Duplicate block closer found at line ${pos + 1}`,
      });
    }
  }

  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === opener) {
      depth++;
      if (depth > 1) {
        conflicts.push({
          type: "nested",
          line: i + 1,
          message: `Nested block detected at line ${i + 1}`,
        });
      }
    } else if (line === closer) {
      depth--;
    }
  }

  if (depth !== 0) {
    const lastOpener = openerPositions[openerPositions.length - 1];
    if (lastOpener !== undefined) {
      conflicts.push({
        type: "mismatched",
        line: lastOpener + 1,
        message: `Unmatched block opener at line ${lastOpener + 1} (missing closer)`,
      });
    }
  }

  const result: ConflictDetectionResult = {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };

  if (result.hasConflicts && logger) {
    for (const conflict of conflicts) {
      logger.log(`Conflict: ${conflict.message}`);
    }
  }

  return result;
}
