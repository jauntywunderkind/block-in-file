import { inspect } from "../document/inspect.ts";
import type { Document, InspectionAssembly } from "../document/types.ts";
import type { ApplyFailure, Change, EditPlan } from "./plan.ts";
import { apply, isApplyFailure } from "./apply.ts";

export type ReconciliationStep = Readonly<{
  plan: EditPlan;
  change: Change;
}>;

export type ReconciliationSession<Fact = never> = Readonly<{
  document: Document<Fact>;
  steps: readonly ReconciliationStep[];
  apply(plan: EditPlan): Change | ApplyFailure;
  preview(): Change & Readonly<{ steps: readonly ReconciliationStep[] }>;
}>;

export function beginReconciliation<Fact = never>(
  text: string,
  assembly: InspectionAssembly<Fact> = {},
): ReconciliationSession<Fact> {
  let document = inspect(text, assembly);
  const steps: ReconciliationStep[] = [];

  return {
    get document() {
      return document;
    },
    get steps() {
      return steps;
    },
    apply(plan) {
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
      steps.push({ plan, change });
      document = inspect(change.text, assembly);
      return change;
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
