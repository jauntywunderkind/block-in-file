import { inspect, inspectRevision } from "../document/inspect.ts";
import type { Document, InspectionAssembly } from "../document/types.ts";
import type { ApplyFailure, Change, EditPlan } from "./plan.ts";
import { apply, isApplyFailure } from "./apply.ts";

/** One successful plan application and its planner-specific report. */
export type ReconciliationStep<Report = unknown> = Readonly<{
  plan: EditPlan;
  change: Change;
  report: Report;
}>;

/** A pure planner that either returns a revision-bound plan or a domain failure. */
export type ReconciliationPlanner<
  Fact,
  Planned extends Readonly<{ plan: EditPlan }>,
  Failure extends object,
> = (document: Document<Fact>) => Planned | Failure;

/** The successful result of running a planner through a reconciliation session. */
export type ReconciliationResult<Report> = Readonly<{
  change: Change;
  report: Report;
}>;

/** A coordinator that applies plans, then explicitly inspects the next revision. */
export type ReconciliationSession<Fact = never> = Readonly<{
  document: Document<Fact>;
  steps: readonly ReconciliationStep[];
  apply(plan: EditPlan): Change | ApplyFailure;
  reconcile<Planned extends Readonly<{ plan: EditPlan }>, Failure extends object>(
    planner: ReconciliationPlanner<Fact, Planned, Failure>,
  ): ReconciliationResult<Omit<Planned, "plan">> | ApplyFailure | Failure;
  preview(): Change & Readonly<{ steps: readonly ReconciliationStep[] }>;
}>;

/** Start a pure, sequential reconciliation coordinator from source text. */
export function beginReconciliation<Fact = never>(
  text: string,
  assembly: InspectionAssembly<Fact> = {},
): ReconciliationSession<Fact> {
  let document = inspect(text, assembly);
  const steps: ReconciliationStep[] = [];

  function applyPlan<Report>(plan: EditPlan, report: Report): Change | ApplyFailure {
    const change = apply(document, plan);
    if (isApplyFailure(change)) {
      return change;
    }
    steps.push({ plan, change, report });
    if (change.changed) {
      document = inspectRevision(change.revision, assembly);
    }
    return change;
  }

  return {
    get document() {
      return document;
    },
    get steps() {
      return steps;
    },
    apply(plan) {
      return applyPlan(plan, undefined);
    },
    reconcile(planner) {
      const planned = planner(document);
      if (!("plan" in planned)) {
        return planned;
      }
      const { plan, ...report } = planned;
      const change = applyPlan(plan, report);
      if (isApplyFailure(change)) {
        return change;
      }
      return { change, report };
    },
    preview() {
      return {
        revision: document,
        changed: steps.some((step) => step.change.changed),
        edits: steps.flatMap((step) => step.change.edits),
        steps,
      };
    },
  };
}
