import type { RevisionId, SourceRevision } from "./revision.ts";

/** An unbound pair of UTF-16 offsets, suitable for binding to a source revision. */
export type OffsetSpan = Readonly<{
  start: number;
  end: number;
}>;

/** A UTF-16 range in exactly one retained source revision. */
export type SourceSpan = OffsetSpan &
  Readonly<{
    revision: RevisionId;
  }>;

/** A revision-bound span with the exact source text required for application. */
export type CheckedSpan = SourceSpan &
  Readonly<{
    expected: string;
  }>;

/** Return whether offsets are integral and lie within a source of the given length. */
export function isOffsetSpan(value: OffsetSpan, length: number): boolean {
  return (
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    value.start >= 0 &&
    value.start <= value.end &&
    value.end <= length
  );
}

/** Return whether a span belongs to and is in bounds for one revision. */
export function isSourceSpan(value: SourceSpan, revision: SourceRevision): boolean {
  return value.revision === revision.id && isOffsetSpan(value, revision.text.length);
}

/** Bind validated UTF-16 offsets to one retained source revision. */
export function sourceSpan(revision: SourceRevision, span: OffsetSpan): SourceSpan | undefined {
  if (!isOffsetSpan(span, revision.text.length)) {
    return undefined;
  }
  return { ...span, revision: revision.id };
}

/** Bind offsets and capture their exact expected source text for checked application. */
export function checkedSpan(revision: SourceRevision, span: OffsetSpan): CheckedSpan | undefined {
  const source = sourceSpan(revision, span);
  if (!source) {
    return undefined;
  }
  return { ...source, expected: revision.text.slice(source.start, source.end) };
}

/** Return whether two spans in the same revision intersect, including coincident insertions. */
export function spansOverlap(left: SourceSpan, right: SourceSpan): boolean {
  if (left.revision !== right.revision) {
    return false;
  }
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
