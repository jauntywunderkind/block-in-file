import { describe, expect, it } from "vitest";
import {
  apply,
  beginReconciliation,
  checkedSpan,
  indexPhysicalLines,
  inspect,
  one,
  planInsert,
  planReplace,
  replace,
  replaceChecked,
  resolvePlacement,
  walk,
} from "../src/toolkit.ts";
import {
  inspectManagedBlocks,
  planBlock as reconcileManagedBlockPlan,
  reconcileBlock as reconcileManagedBlock,
} from "../src/index.ts";

describe("lossless source toolkit", () => {
  it("indexes every physical terminator without reconstructing source", () => {
    const text = "one\r\ntwo\rthree\nfour";
    expect(indexPhysicalLines(text)).toEqual([
      { number: 1, text: "one", span: { start: 0, end: 5 }, terminator: "\r\n" },
      { number: 2, text: "two", span: { start: 5, end: 9 }, terminator: "\r" },
      { number: 3, text: "three", span: { start: 9, end: 15 }, terminator: "\n" },
      { number: 4, text: "four", span: { start: 15, end: 19 }, terminator: "" },
    ]);
  });

  it("preserves every untouched UTF-16 code unit", () => {
    const text = "before\r\n\u{1F984} target\rafter";
    const range = checkedSpan(text, { start: 11, end: 17 });
    expect(range).toBeDefined();
    const result = apply({
      source: text,
      edits: [replace(range!, "changed", "replace selected field")],
    });
    expect(result).toEqual({
      text: "before\r\n\u{1F984} changed\rafter",
      changed: true,
      edits: [{ start: 11, end: 17 }],
    });
  });

  it("rejects stale, invalid, and overlapping edits without changing source", () => {
    const stale = apply({
      source: "source",
      edits: [{ range: { start: 0, end: 2, expected: "other" }, replacement: "x", reason: "test" }],
    });
    expect(stale).toMatchObject({ code: "stale-span", actual: "so" });

    const invalid = apply({
      source: "source",
      edits: [
        { range: { start: 0, end: 9, expected: "source" }, replacement: "x", reason: "test" },
      ],
    });
    expect(invalid).toMatchObject({ code: "span-out-of-bounds" });

    const overlap = apply({
      source: "source",
      edits: [
        { range: { start: 0, end: 3, expected: "sou" }, replacement: "x", reason: "test" },
        { range: { start: 2, end: 4, expected: "ur" }, replacement: "x", reason: "test" },
      ],
    });
    expect(overlap).toMatchObject({ code: "overlapping-edits" });
  });

  it("makes a no-op return the retained source", () => {
    const source = "unchanged\r\n";
    const range = checkedSpan(source, { start: 0, end: 9 });
    expect(apply({ source, edits: [replace(range!, "unchanged", "no-op")] })).toEqual({
      text: source,
      changed: false,
      edits: [],
    });
  });

  it("re-inspects after each session revision", () => {
    const session = beginReconciliation("alpha\nbeta");
    const first = checkedSpan(session.document.text, { start: 0, end: 5 });
    expect(
      session.apply({
        source: session.document.text,
        edits: [replace(first!, "first", "first step")],
      }),
    ).toMatchObject({ changed: true });

    const second = checkedSpan(session.document.text, { start: 6, end: 10 });
    expect(
      session.apply({
        source: session.document.text,
        edits: [replace(second!, "second", "second step")],
      }),
    ).toMatchObject({ changed: true });
    expect(session.preview().text).toBe("first\nsecond");
    expect(session.steps).toHaveLength(2);
  });

  it("composes managed and raw planners against fresh immutable revisions", () => {
    const session = beginReconciliation("[Service]\nExecStart=/bin/old\n");
    const managed = session.reconcile((document) =>
      reconcileManagedBlockPlan(document, {
        block: {
          dialect: { opener: "# app start", closer: "# app end" },
          content: "Environment=MODE=prod",
        },
        whenPresent: { kind: "update" },
        whenMissing: {
          kind: "take-over",
          span: checkedSpan(document.text, { start: 10, end: 29 })!,
          mode: "replace",
        },
      }),
    );
    expect(managed).toMatchObject({ report: { outcome: "replaced" } });

    const raw = session.reconcile((document) => ({
      plan: planReplace(
        document,
        checkedSpan(document.text, { start: 0, end: 9 })!,
        "[ServiceX]",
        "rename section",
      ),
      kind: "renamed-section",
    }));
    expect(raw).toMatchObject({ report: { kind: "renamed-section" } });
    expect(session.preview()).toMatchObject({
      text: "[ServiceX]\n# app start\nEnvironment=MODE=prod\n# app end\n",
      steps: [{ report: { outcome: "replaced" } }, { report: { kind: "renamed-section" } }],
    });
  });

  it("allows inspectors and context tracking to share exact line coordinates", () => {
    const document = inspect("[Unit]\nDescription=Example\n", {
      inspectors: [({ lines }) => ({ facts: lines.filter((line) => line.text.startsWith("[")) })],
    });
    expect(one(document.facts)).toMatchObject({ kind: "one", value: { text: "[Unit]" } });

    const states = walk(document, {
      initial: () => "outside",
      advance: (_state, line) => (line.text === "[Unit]" ? "unit" : "outside"),
    });
    expect(states[1]).toMatchObject({ before: "unit", line: { text: "Description=Example" } });
  });

  it("plans raw insertion against an explicit, unambiguous placement", () => {
    const document = inspect("[Service]\r\nExecStart=/bin/old\r\n");
    const placement = resolvePlacement(document, {
      kind: "line-match",
      pattern: /^ExecStart=/,
      relation: "after",
      cardinality: "unique-or-error",
    });
    expect(placement).toBe(31);
    const plan = planInsert(
      document,
      placement as number,
      "Environment=MODE=prod\r\n",
      "add setting",
    );
    expect("code" in plan ? plan : apply(plan)).toMatchObject({
      text: "[Service]\r\nExecStart=/bin/old\r\nEnvironment=MODE=prod\r\n",
    });
  });

  it("offers systemd adapters one checked replacement boundary", () => {
    expect(
      replaceChecked("ExecStart=/bin/old\n", {
        span: { start: 0, end: 18, expected: "ExecStart=/bin/old" },
        replacement: "ExecStart=/bin/new",
      }),
    ).toMatchObject({ text: "ExecStart=/bin/new\n", changed: true });
  });

  it("keeps managed ownership separate from raw replacements", () => {
    const document = inspect("[Service]\r\nExecStart=/bin/old\r\n");
    const request = {
      block: {
        dialect: { opener: "# app start", closer: "# app end" },
        content: "Environment=MODE=prod",
      },
      whenPresent: { kind: "update" as const },
      whenMissing: {
        kind: "take-over" as const,
        span: checkedSpan(document.text, { start: 11, end: 31 })!,
        mode: "replace" as const,
      },
    };
    expect(reconcileManagedBlock(document, request)).toMatchObject({
      outcome: "replaced",
      text: "[Service]\r\n# app start\r\nEnvironment=MODE=prod\r\n# app end\r\n",
    });
    expect(
      inspectManagedBlocks(inspect("# app start\n# app end\n"), request.block.dialect).blocks,
    ).toHaveLength(1);
  });

  it("adopts a line-terminated target without changing its payload", () => {
    const document = inspect("ExecStart=/bin/old\r\n");
    expect(
      reconcileManagedBlock(document, {
        block: { dialect: { opener: "# app start", closer: "# app end" }, content: "ignored" },
        whenPresent: { kind: "update" },
        whenMissing: {
          kind: "take-over",
          span: checkedSpan(document.text, { start: 0, end: 20 })!,
          mode: "adopt",
        },
      }),
    ).toMatchObject({
      outcome: "adopted",
      text: "# app start\r\nExecStart=/bin/old\r\n# app end\r\n",
    });
  });
});
