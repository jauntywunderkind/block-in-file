export { walk } from "./document/context.ts";
export type { ContextTracker, ContextualLine } from "./document/context.ts";
export { inspect, inspectRevision } from "./document/inspect.ts";
export { one } from "./document/query.ts";
export type { QueryResult } from "./document/query.ts";
export type {
  Document,
  InspectionAssembly,
  InspectionResult,
  Inspector,
  InspectDiagnostic,
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
export { inheritedTerminator } from "./source/lines.ts";
export type { LineTerminator, PhysicalLine } from "./source/lines.ts";
export { createSourceRevision } from "./source/revision.ts";
export type { RevisionId, SourceRevision } from "./source/revision.ts";
export {
  checkedSpan,
  isOffsetSpan,
  isSourceSpan,
  sourceSpan,
  spansOverlap,
} from "./source/spans.ts";
export type { CheckedSpan, OffsetSpan, SourceSpan } from "./source/spans.ts";
export type {
  EditId,
  FactId,
  Origin,
  PassIdentity,
  PlanId,
  PluginIdentity,
} from "./runtime/origin.ts";
export type {
  DiagnosticInput,
  Fact,
  FactBatch,
  FactInput,
  StageDiagnostic,
} from "./runtime/facts.ts";
export { applyPlans } from "./runtime/plans.ts";
export type {
  ApplyPlansFailure,
  CheckedPlanFailure,
  EditInput,
  EditIntent,
  IntentConflict,
  PlanApplication,
  PlanDescriptor,
  PlanReport,
  PlanSet,
} from "./runtime/plans.ts";
export { beginStage } from "./runtime/stage.ts";
export type { StageCollector, StageReport } from "./runtime/stage.ts";
export type {
  FactQuery,
  PassContext,
  PassDescriptor,
  PassEmitter,
  PassReference,
  PluginManifest,
  ReconciliationPass,
  ReconciliationPlugin,
} from "./runtime/plugin.ts";
export { adaptLinePass } from "./runtime/line-pass.ts";
export type { SnapshotLinePass } from "./runtime/line-pass.ts";
export { createScheduler, isSchedulerFailure } from "./runtime/scheduler.ts";
export type {
  DuplicatePassFailure,
  DuplicatePluginFailure,
  PassCycleFailure,
  ReconciliationScheduler,
  ScheduledStageReport,
  SchedulerFailure,
  UnknownPassReferenceFailure,
} from "./runtime/scheduler.ts";
export { markdownChangelogPlugin } from "./plugins/markdown/changelog.ts";
export type { MarkdownChangelogPluginOptions } from "./plugins/markdown/changelog.ts";
export { managedPlugin } from "./plugins/managed/default.ts";
export type { ManagedPluginOptions } from "./plugins/managed/default.ts";
