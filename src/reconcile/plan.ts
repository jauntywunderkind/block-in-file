import type { CheckedSpan, SourceSpan } from "../source/spans.ts";

export type PlannedEdit = Readonly<{
  range: CheckedSpan;
  replacement: string;
  reason: string;
}>;

export type EditPlan = Readonly<{
  source: string;
  edits: readonly PlannedEdit[];
}>;

export type ApplyFailure =
  | Readonly<{ code: "stale-span"; range: SourceSpan; expected: string; actual: string }>
  | Readonly<{ code: "span-out-of-bounds"; range: SourceSpan }>
  | Readonly<{ code: "overlapping-edits"; ranges: readonly SourceSpan[] }>;

export type Change = Readonly<{
  text: string;
  changed: boolean;
  edits: readonly SourceSpan[];
}>;
