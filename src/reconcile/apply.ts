import { isSourceSpan, spansOverlap } from "../source/spans.ts";
import { createSourceRevision, type SourceRevision } from "../source/revision.ts";
import type { ApplyFailure, Change, EditPlan, PlannedEdit } from "./plan.ts";

/** Return whether a result is an application failure rather than a changed revision. */
export function isApplyFailure(result: Change | ApplyFailure): result is ApplyFailure {
  return "code" in result;
}

/** Atomically apply one revision-bound edit plan and produce its next source revision. */
export function apply(revision: SourceRevision, plan: EditPlan): Change | ApplyFailure {
  if (revision.id !== plan.revision) {
    return { code: "revision-mismatch", expected: revision.id, actual: plan.revision };
  }
  const sorted = [...plan.edits].sort(
    (left, right) => left.range.start - right.range.start || left.range.end - right.range.end,
  );

  for (const edit of sorted) {
    if (edit.range.revision !== revision.id) {
      return { code: "revision-mismatch", expected: revision.id, actual: edit.range.revision };
    }
    if (!isSourceSpan(edit.range, revision)) {
      return { code: "span-out-of-bounds", range: edit.range };
    }
    const actual = revision.text.slice(edit.range.start, edit.range.end);
    if (actual !== edit.range.expected) {
      return { code: "stale-span", range: edit.range, expected: edit.range.expected, actual };
    }
  }

  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (spansOverlap(previous.range, current.range)) {
      return { code: "overlapping-edits", ranges: [previous.range, current.range] };
    }
  }

  const changedEdits = plan.edits.filter((edit) => edit.range.expected !== edit.replacement);
  if (changedEdits.length === 0) {
    return { revision, changed: false, edits: [] };
  }

  let text = revision.text;
  for (const edit of [...changedEdits].sort(
    (left, right) => right.range.start - left.range.start || right.range.end - left.range.end,
  )) {
    text = text.slice(0, edit.range.start) + edit.replacement + text.slice(edit.range.end);
  }

  return {
    revision: createSourceRevision(text),
    changed: true,
    edits: changedEdits.map(({ range }) => ({
      revision: revision.id,
      start: range.start,
      end: range.end,
    })),
  };
}

/** Describe one checked replacement for a revision-bound edit plan. */
export function replace(
  range: PlannedEdit["range"],
  replacement: string,
  reason: string,
): PlannedEdit {
  return { range, replacement, reason };
}
