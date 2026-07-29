import { describe, expect, it } from "vitest";
import {
  applyPlans,
  checkedSpan,
  createScheduler,
  inspect,
  isSchedulerFailure,
  managedPlugin,
} from "../src/toolkit.ts";
import type { ScheduledStageReport } from "../src/toolkit.ts";

function run(text: string, options: Parameters<typeof managedPlugin>[0]) {
  const revision = inspect(text);
  const scheduler = createScheduler([managedPlugin(options)]);
  if (isSchedulerFailure(scheduler)) {
    throw new Error(`Unexpected scheduler failure: ${scheduler.code}`);
  }
  return { revision, report: scheduler.run(revision) };
}

function ownershipPlan(report: ScheduledStageReport) {
  return report.plans.plans.find((plan) => plan.origin.pass === "ownership-plan")!;
}

const block = {
  dialect: { opener: "# app start", closer: "# app end" },
  content: "enabled=true",
} as const;

describe("managed reconciliation plugin", () => {
  it("updates one scanned envelope without changing Unicode or CRLF source around it", () => {
    const { revision, report } = run(
      "before \u{1F984}\r\n# app start\r\nenabled=false\r\n# app end\r\nafter",
      {
        block,
        whenPresent: { kind: "update" },
        whenMissing: { kind: "error" },
      },
    );
    const plan = ownershipPlan(report);

    expect(plan.edits).toMatchObject([
      {
        reason: "update managed block",
        origin: { plugin: { id: "block-in-file/managed" }, pass: "ownership-plan" },
        evidence: [report.facts.find((fact) => fact.kind === "managed.block")!.id],
      },
    ]);
    expect(applyPlans(revision, [plan.id], report.plans)).toMatchObject({
      revision: { text: "before \u{1F984}\r\n# app start\r\nenabled=true\r\n# app end\r\nafter" },
      changed: true,
    });
  });

  it("records a kept outcome without an edit when the rendered envelope is already current", () => {
    const { revision, report } = run("# app start\nenabled=true\n# app end\n", {
      block,
      whenPresent: { kind: "update" },
      whenMissing: { kind: "error" },
    });
    const plan = ownershipPlan(report);

    expect(plan.edits).toEqual([]);
    expect(report.facts).toContainEqual(
      expect.objectContaining({ kind: "managed.outcome", value: { outcome: "kept" } }),
    );
    expect(applyPlans(revision, [plan.id], report.plans)).toMatchObject({
      changed: false,
      revision,
    });
  });

  it("reports malformed ownership and emits no mutation intent", () => {
    const { report } = run("# app start\n# app end\n# app start\n# app end\n", {
      block,
      whenPresent: { kind: "remove" },
      whenMissing: { kind: "error" },
    });

    expect(report.diagnostics).toMatchObject([{ code: "duplicate-block" }]);
    expect(report.facts).toContainEqual(
      expect.objectContaining({
        kind: "managed.integrity",
        value: { valid: false, blockCount: 2 },
      }),
    );
    expect(report.facts).toContainEqual(
      expect.objectContaining({ kind: "managed.outcome", value: { outcome: "skipped" } }),
    );
    expect(ownershipPlan(report).edits).toEqual([]);
  });

  it("inserts and adopts at explicit revision-bound placements", () => {
    const inserted = run("setting=true", {
      block,
      whenPresent: { kind: "update" },
      whenMissing: { kind: "insert", placement: { kind: "edge", edge: "BOF" } },
    });
    expect(
      applyPlans(inserted.revision, [ownershipPlan(inserted.report).id], inserted.report.plans),
    ).toMatchObject({ revision: { text: "# app start\nenabled=true\n# app end\nsetting=true" } });

    const revision = inspect("ExecStart=/bin/old\r\n");
    const scheduler = createScheduler([
      managedPlugin({
        block,
        whenPresent: { kind: "update" },
        whenMissing: {
          kind: "take-over",
          span: checkedSpan(revision, { start: 0, end: 20 })!,
          mode: "adopt",
        },
      }),
    ]);
    if (isSchedulerFailure(scheduler)) {
      throw new Error(`Unexpected scheduler failure: ${scheduler.code}`);
    }
    const report = scheduler.run(revision);
    expect(applyPlans(revision, [ownershipPlan(report).id], report.plans)).toMatchObject({
      revision: { text: "# app start\r\nExecStart=/bin/old\r\n# app end\r\n" },
    });
  });
});
