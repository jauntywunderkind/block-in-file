import { describe, expect, it } from "vitest";
import {
  applyPlans,
  createScheduler,
  inspect,
  isSchedulerFailure,
  markdownChangelogPlugin,
} from "../src/toolkit.ts";

function planEntry(text: string) {
  const revision = inspect(text);
  const scheduler = createScheduler([
    markdownChangelogPlugin({ release: "Unreleased", entry: "- Add retained revisions" }),
  ]);
  if (isSchedulerFailure(scheduler)) {
    throw new Error(`Unexpected scheduler failure: ${scheduler.code}`);
  }
  const report = scheduler.run(revision);
  const plan = report.plans.plans.find(
    (candidate) => candidate.descriptor.name === "changelog-entry",
  )!;
  return { revision, report, plan };
}

describe("Markdown changelog plugin", () => {
  it("uses the first blank line after the selected heading as a deferred boundary", () => {
    const { revision, report, plan } = planEntry("# Changelog\n\n## Unreleased\n\n## 1.0\n");

    expect(applyPlans(revision, [plan.id], report.plans)).toMatchObject({
      revision: { text: "# Changelog\n\n## Unreleased\n- Add retained revisions\n\n## 1.0\n" },
      changed: true,
      plans: [{ descriptor: { name: "changelog-entry" } }],
    });
  });

  it("treats whitespace-only lines as deferred boundaries", () => {
    const { revision, report, plan } = planEntry("## Unreleased\n  \n## 1.0\n");

    expect(applyPlans(revision, [plan.id], report.plans)).toMatchObject({
      revision: { text: "## Unreleased\n- Add retained revisions\n  \n## 1.0\n" },
    });
  });

  it("keeps nested headings in the release section and stops at the next same-or-higher heading", () => {
    const { revision, report, plan } = planEntry("## Unreleased\n### Added\n## 1.0\n");

    expect(applyPlans(revision, [plan.id], report.plans)).toMatchObject({
      revision: {
        text: "## Unreleased\n### Added\n- Add retained revisions\n## 1.0\n",
      },
    });
  });

  it("defers to EOF without adding a final newline and is idempotent on the next revision", () => {
    const first = planEntry("## Unreleased");
    const applied = applyPlans(first.revision, [first.plan.id], first.report.plans);
    expect(applied).toMatchObject({
      revision: { text: "## Unreleased\n- Add retained revisions" },
    });
    if ("code" in applied) {
      throw new Error(`Unexpected plan failure: ${applied.code}`);
    }

    const second = planEntry(applied.revision.text);
    expect(applyPlans(second.revision, [second.plan.id], second.report.plans)).toMatchObject({
      changed: false,
      revision: second.revision,
    });
  });
});
