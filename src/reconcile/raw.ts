import type { Document } from "../document/types.ts";
import { checkedSpan, type CheckedSpan } from "../source/spans.ts";
import type { EditPlan } from "./plan.ts";
import { apply, replace } from "./apply.ts";
import type { ApplyFailure, Change } from "./plan.ts";

export type CheckedReplacement = Readonly<{
  span: CheckedSpan;
  replacement: string;
  reason?: string;
}>;

/** Replace a caller-selected UTF-16 span without searching or normalizing source. */
export function replaceChecked(text: string, request: CheckedReplacement): Change | ApplyFailure {
  return apply({
    source: text,
    edits: [replace(request.span, request.replacement, request.reason ?? "checked replacement")],
  });
}

export function planReplace(
  document: Document<unknown>,
  range: CheckedSpan,
  replacement: string,
  reason: string,
): EditPlan {
  return { source: document.text, edits: [replace(range, replacement, reason)] };
}

export function planInsert(
  document: Document<unknown>,
  at: number,
  replacement: string,
  reason: string,
): EditPlan | Readonly<{ code: "span-out-of-bounds"; at: number }> {
  const range = checkedSpan(document.text, { start: at, end: at });
  if (!range) {
    return { code: "span-out-of-bounds", at };
  }
  return { source: document.text, edits: [replace(range, replacement, reason)] };
}
