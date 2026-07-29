import type { RevisionId, SourceRevision } from "./revision.ts";

export type OffsetSpan = Readonly<{
  start: number;
  end: number;
}>;

/** A UTF-16 range in exactly one retained source revision. */
export type SourceSpan = OffsetSpan &
  Readonly<{
    revision: RevisionId;
  }>;

export type CheckedSpan = SourceSpan &
  Readonly<{
    expected: string;
  }>;

export function isOffsetSpan(value: OffsetSpan, length: number): boolean {
  return (
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    value.start >= 0 &&
    value.start <= value.end &&
    value.end <= length
  );
}

export function isSourceSpan(value: SourceSpan, revision: SourceRevision): boolean {
  return value.revision === revision.id && isOffsetSpan(value, revision.text.length);
}

export function sourceSpan(revision: SourceRevision, span: OffsetSpan): SourceSpan | undefined {
  if (!isOffsetSpan(span, revision.text.length)) {
    return undefined;
  }
  return { ...span, revision: revision.id };
}

export function checkedSpan(revision: SourceRevision, span: OffsetSpan): CheckedSpan | undefined {
  const source = sourceSpan(revision, span);
  if (!source) {
    return undefined;
  }
  return { ...source, expected: revision.text.slice(source.start, source.end) };
}
