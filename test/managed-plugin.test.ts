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

  it("recognizes tagged markers and merges requested tags only onto the opener", () => {
    const { revision, report } = run(
      "# app start [anchor-bof:100]\r\nold\r\n# app end [legacy]\r\n",
      {
        block,
        tags: [{ name: "timestamp", value: "next" }],
        sourceLine: "# source: generated",
        whenPresent: { kind: "update" },
        whenMissing: { kind: "error" },
      },
    );

    expect(applyPlans(revision, [ownershipPlan(report).id], report.plans)).toMatchObject({
      revision: {
        text: "# app start [anchor-bof:100] [timestamp:next]\r\n# source: generated\r\nenabled=true\r\n# app end\r\n",
      },
    });
  });

  it("replaces tags and source attribution as managed metadata", () => {
    const source =
      "# app start [anchor-bof:100] [old:value]\n# source: old\nenabled=true\n# app end\n";
    const replacement = run(source, {
      block,
      tags: [{ name: "timestamp", value: "new" }],
      tagMode: "replace",
      sourceLine: "# source: new",
      whenPresent: { kind: "update" },
      whenMissing: { kind: "error" },
    });
    expect(
      applyPlans(
        replacement.revision,
        [ownershipPlan(replacement.report).id],
        replacement.report.plans,
      ),
    ).toMatchObject({
      revision: { text: "# app start [timestamp:new]\n# source: new\nenabled=true\n# app end\n" },
    });

    const disabled = run(source, {
      block,
      whenPresent: { kind: "update" },
      whenMissing: { kind: "error" },
    });
    expect(
      applyPlans(disabled.revision, [ownershipPlan(disabled.report).id], disabled.report.plans),
    ).toMatchObject({
      revision: { text: "# app start [anchor-bof:100] [old:value]\nenabled=true\n# app end\n" },
    });
  });

  it("adds only missing payload lines while refreshing metadata", () => {
    const { revision, report } = run(
      "# app start [timestamp:old]\r\n# source: old\r\nline2\r\n# app end\r\n",
      {
        block: { ...block, content: "line1\nline2\nline3" },
        sourceLine: "# source: new",
        sourceLinePrefix: "# source:",
        additive: { after: /^line2$/ },
        whenPresent: { kind: "update" },
        whenMissing: { kind: "error" },
      },
    );

    expect(applyPlans(revision, [ownershipPlan(report).id], report.plans)).toMatchObject({
      revision: {
        text: "# app start [timestamp:old]\r\n# source: new\r\nline2\r\nline1\r\nline3\r\n# app end\r\n",
      },
    });
  });

  it("adds missing lines before the existing payload when configured", () => {
    const { revision, report } = run("# app start\nline2\n# app end\n", {
      block: { ...block, content: "line1\nline2\nline3" },
      additive: { before: "BOF" },
      whenPresent: { kind: "update" },
      whenMissing: { kind: "error" },
    });

    expect(applyPlans(revision, [ownershipPlan(report).id], report.plans)).toMatchObject({
      revision: { text: "# app start\nline1\nline3\nline2\n# app end\n" },
    });
  });

  it("rejects ambiguous additive placement policies", () => {
    expect(() =>
      managedPlugin({
        block,
        additive: { before: "BOF", after: "EOB" },
        whenPresent: { kind: "update" },
        whenMissing: { kind: "error" },
      }),
    ).toThrow("Managed additive policy cannot specify both before and after placement");
  });

  it("orders BOF anchors by priority across managed block names", () => {
    const { revision, report } = run(
      "# high start [anchor-bof:100]\nhigh\n# high end\n# low start [anchor-bof:50]\nlow\n# low end\nbody\n",
      {
        block,
        anchor: { type: "bof", priority: 75 },
        whenPresent: { kind: "update" },
        whenMissing: { kind: "insert", placement: { kind: "edge", edge: "EOF" } },
      },
    );

    expect(applyPlans(revision, [ownershipPlan(report).id], report.plans)).toMatchObject({
      revision: {
        text: "# high start [anchor-bof:100]\nhigh\n# high end\n# app start [anchor-bof:75]\nenabled=true\n# app end\n# low start [anchor-bof:50]\nlow\n# low end\nbody\n",
      },
    });
  });

  it("orders EOF anchors by priority across managed block names", () => {
    const { revision, report } = run(
      "body\n# low start [anchor-eof:50]\nlow\n# low end\n# high start [anchor-eof:100]\nhigh\n# high end\n",
      {
        block,
        anchor: { type: "eof", priority: 75 },
        whenPresent: { kind: "update" },
        whenMissing: { kind: "insert", placement: { kind: "edge", edge: "BOF" } },
      },
    );

    expect(applyPlans(revision, [ownershipPlan(report).id], report.plans)).toMatchObject({
      revision: {
        text: "body\n# low start [anchor-eof:50]\nlow\n# low end\n# app start [anchor-eof:75]\nenabled=true\n# app end\n# high start [anchor-eof:100]\nhigh\n# high end\n",
      },
    });
  });

  it("prefers an explicit line placement over anchor ordering", () => {
    const { revision, report } = run(
      "# high start [anchor-bof:100]\nhigh\n# high end\nbody\n# low start [anchor-bof:50]\nlow\n# low end\n",
      {
        block,
        anchor: { type: "bof", priority: 75 },
        whenPresent: { kind: "update" },
        whenMissing: {
          kind: "insert",
          placement: {
            kind: "line-match",
            pattern: /^body$/,
            relation: "after",
            cardinality: "unique-or-error",
          },
        },
      },
    );

    expect(applyPlans(revision, [ownershipPlan(report).id], report.plans)).toMatchObject({
      revision: {
        text: "# high start [anchor-bof:100]\nhigh\n# high end\nbody\n# app start [anchor-bof:75]\nenabled=true\n# app end\n# low start [anchor-bof:50]\nlow\n# low end\n",
      },
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
