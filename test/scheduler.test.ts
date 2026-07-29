import { describe, expect, it } from "vitest";
import {
  applyPlans,
  checkedSpan,
  createScheduler,
  inspect,
  isSchedulerFailure,
} from "../src/toolkit.ts";

function schedulerOrThrow(...plugins: Parameters<typeof createScheduler>) {
  const scheduler = createScheduler(...plugins);
  if (isSchedulerFailure(scheduler)) {
    throw new Error(`Unexpected scheduler failure: ${scheduler.code}`);
  }
  return scheduler;
}

describe("reconciliation plugin scheduler", () => {
  it("orders passes by dependency while exposing only direct dependency facts", () => {
    const trace: string[] = [];
    const scheduler = schedulerOrThrow([
      {
        manifest: { id: "example/three", version: "1", title: "Three" },
        passes: [
          {
            descriptor: {
              id: "consume-two",
              title: "Consume two",
              after: [{ plugin: "example/two", pass: "consume-one" }],
            },
            run(context) {
              trace.push("three");
              expect(context.facts.kind("one")).toEqual([]);
              expect(context.facts.kind("two")).toHaveLength(1);
            },
          },
        ],
      },
      {
        manifest: { id: "example/two", version: "1", title: "Two" },
        passes: [
          {
            descriptor: {
              id: "consume-one",
              title: "Consume one",
              after: [{ plugin: "example/one", pass: "scan" }],
            },
            run(context) {
              trace.push("two");
              expect(context.facts.kind("one")).toHaveLength(1);
              context.emit.fact({ kind: "two", value: true });
            },
          },
        ],
      },
      {
        manifest: { id: "example/one", version: "1", title: "One" },
        passes: [
          {
            descriptor: { id: "scan", title: "Scan" },
            run(context) {
              trace.push("one");
              context.emit.fact({ kind: "one", value: true });
            },
          },
        ],
      },
    ]);

    const report = scheduler.run(inspect("source"));
    expect(trace).toEqual(["one", "two", "three"]);
    expect(report.facts.map((fact) => fact.kind)).toEqual(["one", "two"]);
    expect(report.passes.map((pass) => pass.origin.pass)).toEqual([
      "scan",
      "consume-one",
      "consume-two",
    ]);
  });

  it("merges pass plans without applying them during the stage", () => {
    const revision = inspect("ab");
    const scheduler = schedulerOrThrow([
      {
        manifest: { id: "example/left", version: "1", title: "Left" },
        passes: [
          {
            descriptor: { id: "replace", title: "Replace left" },
            run(context) {
              context.emit.edit({
                range: checkedSpan(context.revision, { start: 0, end: 1 })!,
                replacement: "A",
                reason: "replace left",
              });
            },
          },
        ],
      },
      {
        manifest: { id: "example/right", version: "1", title: "Right" },
        passes: [
          {
            descriptor: { id: "replace", title: "Replace right" },
            run(context) {
              context.emit.edit({
                range: checkedSpan(context.revision, { start: 1, end: 2 })!,
                replacement: "B",
                reason: "replace right",
              });
            },
          },
        ],
      },
    ]);

    const report = scheduler.run(revision);
    expect(report.revision).toBe(revision);
    expect(report.plans.plans).toHaveLength(2);
    expect(
      applyPlans(
        revision,
        report.plans.plans.map((plan) => plan.id),
        report.plans,
      ),
    ).toMatchObject({
      revision: { text: "AB" },
      changed: true,
      plans: [{ origin: { pass: "replace" } }, { origin: { pass: "replace" } }],
    });
  });

  it("reports duplicate, unknown, and cyclic registry definitions", () => {
    const duplicate = createScheduler([
      { manifest: { id: "example/one", version: "1", title: "One" }, passes: [] },
      { manifest: { id: "example/one", version: "2", title: "Duplicate" }, passes: [] },
    ]);
    expect(duplicate).toMatchObject({ code: "duplicate-plugin", plugin: "example/one" });

    const unknown = createScheduler([
      {
        manifest: { id: "example/one", version: "1", title: "One" },
        passes: [
          {
            descriptor: {
              id: "wait",
              title: "Wait",
              after: [{ plugin: "missing", pass: "pass" }],
            },
            run() {},
          },
        ],
      },
    ]);
    expect(unknown).toMatchObject({ code: "unknown-pass-reference" });

    const cycle = createScheduler([
      {
        manifest: { id: "example/one", version: "1", title: "One" },
        passes: [
          {
            descriptor: {
              id: "first",
              title: "First",
              after: [{ plugin: "example/two", pass: "second" }],
            },
            run() {},
          },
        ],
      },
      {
        manifest: { id: "example/two", version: "1", title: "Two" },
        passes: [
          {
            descriptor: {
              id: "second",
              title: "Second",
              after: [{ plugin: "example/one", pass: "first" }],
            },
            run() {},
          },
        ],
      },
    ]);
    expect(cycle).toMatchObject({ code: "pass-cycle" });
  });
});
