import { describe, expect, it } from "vitest";
import { applyPlans, beginStage, checkedSpan, inspect, sourceSpan } from "../src/toolkit.ts";

const identity = {
  plugin: { id: "example/reconcile", version: "1.0.0" },
  pass: "rewrite",
} as const;

describe("reconciliation stage runtime", () => {
  it("stamps facts, diagnostics, and named edit plans with one runtime-owned origin", () => {
    const revision = inspect("one\ntwo\n");
    const stage = beginStage(revision, identity);
    const evidence = stage.fact({
      kind: "heading",
      subject: sourceSpan(revision, { start: 0, end: 3 }),
      value: { level: 1 },
      rule: "heading-scan",
    });
    stage.diagnostic({
      code: "example-note",
      message: "demonstrate attributed diagnostics",
      rule: "heading-scan",
    });
    const alternate = stage.declarePlan({
      name: "alternate",
      title: "Alternate rewrite",
      description: "Changes the second line only.",
    });
    stage.edit({
      range: checkedSpan(revision, { start: 0, end: 3 })!,
      replacement: "ONE",
      reason: "capitalize first line",
      evidence: [evidence],
      rule: "capitalize",
    });
    stage.edit({
      plan: "alternate",
      range: checkedSpan(revision, { start: 4, end: 7 })!,
      replacement: "TWO",
      reason: "capitalize second line",
      evidence: [evidence],
      rule: "capitalize",
    });

    const report = stage.report();
    expect(report).toMatchObject({
      revision: revision.id,
      origin: { plugin: identity.plugin, pass: "rewrite" },
      facts: [
        {
          id: evidence,
          revision: revision.id,
          kind: "heading",
          origin: { rule: "heading-scan" },
        },
      ],
      diagnostics: [{ origin: { rule: "heading-scan" } }],
      plans: { plans: [{ descriptor: { name: "default" } }, { id: alternate }] },
    });
    expect(report.facts[0]!.origin.invocation).toBe(report.diagnostics[0]!.origin.invocation);

    expect(applyPlans(revision, [alternate], report.plans)).toMatchObject({
      revision: { text: "one\nTWO\n" },
      changed: true,
      plans: [{ id: alternate }],
    });
  });

  it("retains attributed conflicting intents instead of resolving them by plan order", () => {
    const revision = inspect("source");
    const stage = beginStage(revision, identity);
    stage.declarePlan({ name: "alternate", title: "Alternate rewrite" });
    stage.edit({
      range: checkedSpan(revision, { start: 0, end: 3 })!,
      replacement: "one",
      reason: "first rewrite",
      rule: "first",
    });
    stage.edit({
      plan: "alternate",
      range: checkedSpan(revision, { start: 2, end: 5 })!,
      replacement: "two",
      reason: "second rewrite",
      rule: "second",
    });

    expect(
      applyPlans(
        revision,
        stage.report().plans.plans.map((plan) => plan.id),
        stage.report().plans,
      ),
    ).toMatchObject({
      code: "overlapping-intents",
      edits: [{ origin: { rule: "first" } }, { origin: { rule: "second" } }],
    });
  });

  it("accepts only current incoming evidence and keeps checked failures attributed", () => {
    const revision = inspect("source");
    const producer = beginStage(revision, { ...identity, pass: "scan" });
    const fact = producer.fact({ kind: "target", value: "source" });
    const consumer = beginStage(revision, identity, producer.report().facts);
    consumer.edit({
      range: { ...checkedSpan(revision, { start: 0, end: 6 })!, expected: "stale" },
      replacement: "changed",
      reason: "prove stale text remains checked",
      evidence: [fact],
    });

    expect(
      applyPlans(
        revision,
        consumer.report().plans.plans.map((plan) => plan.id),
        consumer.report().plans,
      ),
    ).toMatchObject({
      code: "checked-plan-failed",
      failure: { code: "stale-span" },
      edits: [{ evidence: [fact], origin: { pass: "rewrite" } }],
    });
    expect(() => beginStage(inspect("source"), identity, producer.report().facts)).toThrow(
      "Incoming facts must belong to the active source revision",
    );
  });

  it("rejects a plan set from an equal but separately inspected revision", () => {
    const first = inspect("same source");
    const second = inspect("same source");
    const stage = beginStage(first, identity);
    const selected = stage.report().plans.plans[0]!.id;

    expect(applyPlans(second, [selected], stage.report().plans)).toEqual({
      code: "plan-set-revision-mismatch",
      expected: second.id,
      actual: first.id,
    });
  });
});
