import { isSourceSpan, type SourceSpan } from "../source/spans.ts";
import type { ApplyFailure, Change, EditPlan, PlannedEdit } from "./plan.ts";

function overlaps(left: SourceSpan, right: SourceSpan): boolean {
  const leftIsPoint = left.start === left.end;
  const rightIsPoint = right.start === right.end;

  if (leftIsPoint && rightIsPoint) {
    return left.start === right.start;
  }
  if (leftIsPoint) {
    return left.start >= right.start && left.start <= right.end;
  }
  if (rightIsPoint) {
    return right.start >= left.start && right.start <= left.end;
  }
  return left.start < right.end && right.start < left.end;
}

export function isApplyFailure(result: Change | ApplyFailure): result is ApplyFailure {
  return "code" in result;
}

export function apply(plan: EditPlan): Change | ApplyFailure {
  const sorted = [...plan.edits].sort(
    (left, right) => left.range.start - right.range.start || left.range.end - right.range.end,
  );

  for (const edit of sorted) {
    if (!isSourceSpan(edit.range, plan.source.length)) {
      return { code: "span-out-of-bounds", range: edit.range };
    }
    const actual = plan.source.slice(edit.range.start, edit.range.end);
    if (actual !== edit.range.expected) {
      return { code: "stale-span", range: edit.range, expected: edit.range.expected, actual };
    }
  }

  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (overlaps(previous.range, current.range)) {
      return { code: "overlapping-edits", ranges: [previous.range, current.range] };
    }
  }

  const changedEdits = plan.edits.filter((edit) => edit.range.expected !== edit.replacement);
  if (changedEdits.length === 0) {
    return { text: plan.source, changed: false, edits: [] };
  }

  let text = plan.source;
  for (const edit of [...changedEdits].sort(
    (left, right) => right.range.start - left.range.start || right.range.end - left.range.end,
  )) {
    text = text.slice(0, edit.range.start) + edit.replacement + text.slice(edit.range.end);
  }

  return {
    text,
    changed: true,
    edits: changedEdits.map(({ range }) => ({ start: range.start, end: range.end })),
  };
}

export function replace(
  range: PlannedEdit["range"],
  replacement: string,
  reason: string,
): PlannedEdit {
  return { range, replacement, reason };
}
