import { apply, isApplyFailure } from "../reconcile/apply.ts";
import type { ApplyFailure, Change, PlannedEdit } from "../reconcile/plan.ts";
import type { RevisionId, SourceRevision } from "../source/revision.ts";
import { spansOverlap, type CheckedSpan } from "../source/spans.ts";
import type { EditId, FactId, Origin, PlanId } from "./origin.ts";

/** A named, selectable group of edits emitted by one pass invocation. */
export type PlanDescriptor = Readonly<{
  name: string;
  title: string;
  description?: string;
}>;

/** An origin-attributed, checked replacement against one source revision. */
export type EditIntent = Readonly<{
  id: EditId;
  revision: RevisionId;
  range: CheckedSpan;
  replacement: string;
  reason: string;
  evidence: readonly FactId[];
  origin: Origin;
}>;

/** Input accepted by a stage collector before it assigns edit identity and provenance. */
export type EditInput = Readonly<{
  plan?: string;
  range: CheckedSpan;
  replacement: string;
  reason: string;
  evidence?: readonly FactId[];
  rule?: string;
}>;

/** One named plan and the attributed edits it contains. */
export type PlanReport = Readonly<{
  id: PlanId;
  descriptor: PlanDescriptor;
  origin: Origin;
  revision: RevisionId;
  edits: readonly EditIntent[];
}>;

/** All plans available for one immutable source revision. */
export type PlanSet = Readonly<{
  revision: RevisionId;
  plans: readonly PlanReport[];
}>;

/** Successful atomic application of selected plans. */
export type PlanApplication = Change &
  Readonly<{
    plans: readonly PlanReport[];
  }>;

/** A plan selection named an ID absent from this plan set. */
export type UnknownPlanFailure = Readonly<{
  code: "unknown-plan";
  plan: PlanId;
}>;

/** A plan set belonged to a different immutable source revision. */
export type PlanSetRevisionMismatch = Readonly<{
  code: "plan-set-revision-mismatch";
  expected: RevisionId;
  actual: RevisionId;
}>;

/** Two selected intent ranges conflict, retaining both origins for reporting. */
export type IntentConflict = Readonly<{
  code: "overlapping-intents";
  edits: readonly [EditIntent, EditIntent];
}>;

/** Checked application failed after selection, retaining every selected edit intent. */
export type CheckedPlanFailure = Readonly<{
  code: "checked-plan-failed";
  failure: ApplyFailure;
  edits: readonly EditIntent[];
}>;

/** All failures possible while selecting and atomically applying a plan set. */
export type ApplyPlansFailure =
  | UnknownPlanFailure
  | PlanSetRevisionMismatch
  | IntentConflict
  | CheckedPlanFailure;

function conflictingIntents(
  edits: readonly EditIntent[],
): readonly [EditIntent, EditIntent] | undefined {
  const sorted = [...edits].sort(
    (left, right) => left.range.start - right.range.start || left.range.end - right.range.end,
  );
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (spansOverlap(previous.range, current.range)) {
      return [previous, current];
    }
  }
  return undefined;
}

function plannedEdit(intent: EditIntent): PlannedEdit {
  return { range: intent.range, replacement: intent.replacement, reason: intent.reason };
}

/**
 * Select named plans and atomically apply their intents to their retained revision.
 *
 * The returned failure preserves attributed intents so hosts can explain conflicts
 * and stale checked spans without reconstructing provenance.
 */
export function applyPlans(
  revision: SourceRevision,
  selected: readonly PlanId[],
  plans: PlanSet,
): PlanApplication | ApplyPlansFailure {
  if (revision.id !== plans.revision) {
    return { code: "plan-set-revision-mismatch", expected: revision.id, actual: plans.revision };
  }

  const selectedPlans: PlanReport[] = [];
  const available = new Map(plans.plans.map((plan) => [plan.id, plan]));
  for (const id of new Set(selected)) {
    const plan = available.get(id);
    if (!plan) {
      return { code: "unknown-plan", plan: id };
    }
    selectedPlans.push(plan);
  }

  const intents = selectedPlans.flatMap((plan) => plan.edits);
  const conflict = conflictingIntents(intents);
  if (conflict) {
    return { code: "overlapping-intents", edits: conflict };
  }

  const result = apply(revision, {
    revision: plans.revision,
    edits: intents.map(plannedEdit),
  });
  if (isApplyFailure(result)) {
    return { code: "checked-plan-failed", failure: result, edits: intents };
  }
  return { ...result, plans: Object.freeze(selectedPlans) };
}
