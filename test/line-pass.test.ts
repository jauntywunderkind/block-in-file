import { describe, expect, it } from "vitest";
import {
  adaptLinePass,
  applyPlans,
  checkedSpan,
  createScheduler,
  inspect,
  isSchedulerFailure,
} from "../src/toolkit.ts";

function schedulerFor(pass: ReturnType<typeof adaptLinePass>) {
  const scheduler = createScheduler([
    {
      manifest: { id: "example/line-pass", version: "1", title: "Line pass" },
      passes: [pass],
    },
  ]);
  if (isSchedulerFailure(scheduler)) {
    throw new Error(`Unexpected scheduler failure: ${scheduler.code}`);
  }
  return scheduler;
}

describe("snapshot line passes", () => {
  it("keeps later callbacks on the input snapshot after an emitted edit", () => {
    const revision = inspect("trigger\nlater\n");
    const seen: string[] = [];
    const scheduler = schedulerFor(
      adaptLinePass({
        descriptor: { id: "rewrite", title: "Rewrite trigger" },
        initial() {
          return undefined;
        },
        line(state, line, context) {
          seen.push(line.text);
          if (line.text === "trigger") {
            context.emit.edit({
              range: checkedSpan(context.revision, { start: 0, end: 7 })!,
              replacement: "changed",
              reason: "rewrite trigger",
            });
          }
          if (line.text === "later") {
            expect(context.revision.text).toBe("trigger\nlater\n");
          }
          return state;
        },
        finish() {},
      }),
    );

    const report = scheduler.run(revision);
    expect(seen).toEqual(["trigger", "later"]);
    expect(
      applyPlans(
        revision,
        report.plans.plans.map((plan) => plan.id),
        report.plans,
      ),
    ).toMatchObject({
      revision: { text: "changed\nlater\n" },
    });
  });

  it("always calls finish, including for an empty revision", () => {
    const revision = inspect("");
    const scheduler = schedulerFor(
      adaptLinePass({
        descriptor: { id: "eof", title: "Insert at EOF" },
        initial() {
          return "pending";
        },
        line(state) {
          return state;
        },
        finish(state, context) {
          if (state === "pending") {
            context.emit.edit({
              range: checkedSpan(context.revision, { start: 0, end: 0 })!,
              replacement: "created",
              reason: "empty source fallback",
            });
          }
        },
      }),
    );

    const report = scheduler.run(revision);
    expect(
      applyPlans(
        revision,
        report.plans.plans.map((plan) => plan.id),
        report.plans,
      ),
    ).toMatchObject({
      revision: { text: "created" },
    });
  });
});
