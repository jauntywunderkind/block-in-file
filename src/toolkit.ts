export { walk } from "./document/context.ts";
export type { ContextTracker, ContextualLine } from "./document/context.ts";
export { inspect } from "./document/inspect.ts";
export { one } from "./document/query.ts";
export type { QueryResult } from "./document/query.ts";
export type {
  Document,
  InspectionAssembly,
  InspectionResult,
  Inspector,
  InspectDiagnostic,
  SourceDocument,
} from "./document/types.ts";
export { apply, isApplyFailure, replace } from "./reconcile/apply.ts";
export type { ApplyFailure, Change, EditPlan, PlannedEdit } from "./reconcile/plan.ts";
export { resolvePlacement } from "./reconcile/placement.ts";
export type { Placement, PlacementFailure } from "./reconcile/placement.ts";
export { planInsert, planReplace, replaceChecked } from "./reconcile/raw.ts";
export type { CheckedReplacement } from "./reconcile/raw.ts";
export { beginReconciliation } from "./reconcile/session.ts";
export type {
  ReconciliationPlanner,
  ReconciliationResult,
  ReconciliationSession,
  ReconciliationStep,
} from "./reconcile/session.ts";
export { indexPhysicalLines, inheritedTerminator } from "./source/lines.ts";
export type { LineTerminator, PhysicalLine } from "./source/lines.ts";
export { checkedSpan, isSourceSpan } from "./source/spans.ts";
export type { CheckedSpan, SourceSpan } from "./source/spans.ts";
