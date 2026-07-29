import type { CheckedSpan, SourceSpan } from "../source/spans.ts";
import type { RevisionId, SourceRevision } from "../source/revision.ts";

/** A checked replacement before it is attributed to a runtime plan. */
export type PlannedEdit = Readonly<{
  range: CheckedSpan;
  replacement: string;
  reason: string;
}>;

/** A low-level checked edit collection for exactly one source revision. */
export type EditPlan = Readonly<{
  revision: RevisionId;
  edits: readonly PlannedEdit[];
}>;

/** Failures raised while validating a low-level checked edit plan. */
export type ApplyFailure =
  | Readonly<{ code: "stale-span"; range: SourceSpan; expected: string; actual: string }>
  | Readonly<{ code: "span-out-of-bounds"; range: SourceSpan }>
  | Readonly<{ code: "overlapping-edits"; ranges: readonly SourceSpan[] }>
  | Readonly<{ code: "revision-mismatch"; expected: RevisionId; actual: RevisionId }>;

/** The result of applying a low-level plan, including the resulting source revision. */
export type Change = Readonly<{
  revision: SourceRevision;
  changed: boolean;
  edits: readonly SourceSpan[];
}>;
