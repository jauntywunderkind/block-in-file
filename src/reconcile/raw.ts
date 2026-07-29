import type { Document } from "../document/types.ts";
import { checkedSpan, type CheckedSpan } from "../source/spans.ts";
import type { EditPlan } from "./plan.ts";
import { apply, replace } from "./apply.ts";
import type { ApplyFailure, Change } from "./plan.ts";

/** A raw replacement selected by an externally supplied checked source span. */
export type CheckedReplacement = Readonly<{
  span: CheckedSpan;
  replacement: string;
  reason?: string;
}>;

/** Replace a caller-selected UTF-16 span without searching or normalizing source. */
export function replaceChecked(
  revision: Document<unknown>,
  request: CheckedReplacement,
): Change | ApplyFailure {
  return apply(revision, {
    revision: revision.id,
    edits: [replace(request.span, request.replacement, request.reason ?? "checked replacement")],
  });
}

/** Plan one raw replacement against the supplied immutable document revision. */
export function planReplace(
  document: Document<unknown>,
  range: CheckedSpan,
  replacement: string,
  reason: string,
): EditPlan {
  return { revision: document.id, edits: [replace(range, replacement, reason)] };
}

/** Plan a raw insertion at one validated UTF-16 offset in the supplied revision. */
export function planInsert(
  document: Document<unknown>,
  at: number,
  replacement: string,
  reason: string,
): EditPlan | Readonly<{ code: "span-out-of-bounds"; at: number }> {
  const range = checkedSpan(document, { start: at, end: at });
  if (!range) {
    return { code: "span-out-of-bounds", at };
  }
  return { revision: document.id, edits: [replace(range, replacement, reason)] };
}
