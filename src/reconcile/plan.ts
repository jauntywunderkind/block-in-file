import type { CheckedSpan, SourceSpan } from "../source/spans.ts";
import type { RevisionId, SourceRevision } from "../source/revision.ts";

export type PlannedEdit = Readonly<{
  range: CheckedSpan;
  replacement: string;
  reason: string;
}>;

export type EditPlan = Readonly<{
  revision: RevisionId;
  edits: readonly PlannedEdit[];
}>;

export type ApplyFailure =
  | Readonly<{ code: "stale-span"; range: SourceSpan; expected: string; actual: string }>
  | Readonly<{ code: "span-out-of-bounds"; range: SourceSpan }>
  | Readonly<{ code: "overlapping-edits"; ranges: readonly SourceSpan[] }>
  | Readonly<{ code: "revision-mismatch"; expected: RevisionId; actual: RevisionId }>;

export type Change = Readonly<{
  revision: SourceRevision;
  changed: boolean;
  edits: readonly SourceSpan[];
}>;
