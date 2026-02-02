import type { ModeArg } from "./plugins/config.js";

export type BlockState = "absent" | "created" | "exists" | "updated" | "unchanged";

export interface ProcessDecision {
  skip: boolean;
  reason?: string;
}

export function shouldSkipForMode(state: BlockState, mode: ModeArg): ProcessDecision {
  if (mode === "only") {
    if (state === "exists" || state === "updated") {
      return { skip: true, reason: "block already exists" };
    }
  } else if (mode === "ensure") {
    if (state === "unchanged") {
      return { skip: true, reason: "no changes needed" };
    }
  }

  return { skip: false };
}

export function detectBlockState(
  fileExists: boolean,
  hasBlock: boolean,
  wouldChange: boolean,
): BlockState {
  if (!fileExists) {
    return "absent";
  }
  if (!hasBlock) {
    return "absent";
  }
  if (wouldChange) {
    return "updated";
  }
  return "unchanged";
}
