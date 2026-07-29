import { inspect } from "../document/inspect.ts";
import type { Document, InspectionAssembly } from "../document/types.ts";
import type { ApplyFailure, Change, EditPlan } from "./plan.ts";
import { apply, isApplyFailure } from "./apply.ts";

export type ReconciliationStep<Report = unknown> = Readonly<{
  plan: EditPlan;
  change: Change;
  report: Report;
}>;

export type ReconciliationPlanner<
  Fact,
  Planned extends Readonly<{ plan: EditPlan }>,
  Failure extends object,
> = (document: Document<Fact>) => Planned | Failure;

export type ReconciliationResult<Report> = Readonly<{
  change: Change;
  report: Report;
}>;

export type ReconciliationSession<Fact = never> = Readonly<{
  document: Document<Fact>;
  steps: readonly ReconciliationStep[];
  apply(plan: EditPlan): Change | ApplyFailure;
  reconcile<Planned extends Readonly<{ plan: EditPlan }>, Failure extends object>(
    planner: ReconciliationPlanner<Fact, Planned, Failure>,
  ): ReconciliationResult<Omit<Planned, "plan">> | ApplyFailure | Failure;
  preview(): Change & Readonly<{ steps: readonly ReconciliationStep[] }>;
}>;

export function beginReconciliation<Fact = never>(
  text: string,
  assembly: InspectionAssembly<Fact> = {},
): ReconciliationSession<Fact> {
  let document = inspect(text, assembly);
  const steps: ReconciliationStep[] = [];

  function applyPlan<Report>(plan: EditPlan, report: Report): Change | ApplyFailure {
    if (plan.source !== document.text) {
      return {
        code: "stale-span",
        range: { start: 0, end: plan.source.length },
        expected: plan.source,
        actual: document.text,
      };
    }
    const change = apply(plan);
    if (isApplyFailure(change)) {
      return change;
    }
    steps.push({ plan, change, report });
    document = inspect(change.text, assembly);
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
        text: document.text,
        changed: steps.some((step) => step.change.changed),
        edits: steps.flatMap((step) => step.change.edits),
        steps,
      };
    },
  };
}
