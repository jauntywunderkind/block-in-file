import { describe, it, expect } from "vitest";

interface ParseOptions {
  opener: string;
  closer: string;
  inputBlock: string;
  before?: RegExp | boolean;
  after?: RegExp | boolean;
}

interface ParseResult {
  outputs: string[];
  matched: number;
  opened?: number;
}

function parseLines(lines: string[], opts: ParseOptions): ParseResult {
  const { opener, closer, inputBlock, before, after } = opts;
  const match = before || after;
  const outputs: string[] = [];

  let done = false;
  let opened: number | undefined;
  let matched = -1;
  let i = -1;

  if (before === true) {
    outputs.push(opener, inputBlock, closer);
    done = true;
  }

  for (const line of lines) {
    const isOpen = opened !== undefined;
    i++;

    if (!isOpen && line === opener) {
      opened = outputs.length;
    } else if (isOpen) {
      if (line !== closer) {
        continue;
      }

      opened = undefined;

      if (done) {
        continue;
      }

      outputs.push(opener, inputBlock, closer);
      done = true;
    } else {
      outputs.push(line);

      if (!done && matched === -1 && typeof match === "object" && match?.test?.(line)) {
        matched = i;
      }
    }
  }

  if (opened !== undefined) {
    outputs.push(opener, inputBlock, closer);
    done = true;
  }

  if (!done) {
    if (matched === -1) {
      matched = i;
    }
    outputs.splice(matched + (after ? 1 : 0), 0, opener, inputBlock, closer);
  }

  return { outputs, matched, opened };
}

describe("block-parser", () => {
  const defaultOpts: ParseOptions = {
    opener: "# blockinfile start",
    closer: "# blockinfile end",
    inputBlock: "NEW CONTENT",
  };

  describe("insertion into empty or simple files", () => {
    it.each([
      { lines: [], expected: ["# blockinfile start", "NEW CONTENT", "# blockinfile end"] },
      { lines: ["line1", "line2", "line3"], expectedContains: ["# blockinfile start", "NEW CONTENT", "# blockinfile end", "line1", "line2", "line3"] },
    ])("inserts block: lines=$lines", ({ lines, expected, expectedContains }) => {
      const result = parseLines(lines, defaultOpts);
      if (expected) {
        expect(result.outputs).toEqual(expected);
      }
      if (expectedContains) {
        expectedContains.forEach(str => expect(result.outputs).toContain(str));
      }
    });
  });

  describe("replacing existing blocks", () => {
    it.each([
      {
        lines: ["line1", "# blockinfile start", "OLD CONTENT", "# blockinfile end", "line2"],
        opts: undefined as any,
        expected: ["line1", "# blockinfile start", "NEW CONTENT", "# blockinfile end", "line2"],
      },
      {
        lines: ["line1", "line2"],
        opts: { ...defaultOpts, after: true },
        expected: ["line1", "line2", "# blockinfile start", "NEW CONTENT", "# blockinfile end"],
      },
      {
        lines: ["line1", "line2"],
        opts: { ...defaultOpts, before: true },
        expected: ["# blockinfile start", "NEW CONTENT", "# blockinfile end", "line1", "line2"],
      },
    ])("handles block replacement", ({ lines, opts, expected }) => {
      const result = parseLines(lines, opts ?? defaultOpts);
      expect(result.outputs).toEqual(expected);
    });

    it("replaces multi-line existing block", () => {
      const lines = [
        "header",
        "# blockinfile start",
        "old line 1",
        "old line 2",
        "old line 3",
        "# blockinfile end",
        "footer",
      ];
      const result = parseLines(lines, defaultOpts);
      expect(result.outputs).toEqual([
        "header",
        "# blockinfile start",
        "NEW CONTENT",
        "# blockinfile end",
        "footer",
      ]);
    });

    it("removes duplicate blocks", () => {
      const lines = [
        "# blockinfile start",
        "first block",
        "# blockinfile end",
        "middle",
        "# blockinfile start",
        "second block",
        "# blockinfile end",
      ];
      const result = parseLines(lines, defaultOpts);
      expect(result.outputs).toEqual([
        "# blockinfile start",
        "NEW CONTENT",
        "# blockinfile end",
        "middle",
      ]);
    });
  });

  describe("before/after matching", () => {
    it.each([
      {
        description: "at beginning when before=true",
        lines: ["line1", "line2"],
        opts: { ...defaultOpts, before: true },
        expected: ["# blockinfile start", "NEW CONTENT", "# blockinfile end", "line1", "line2"],
      },
      {
        description: "before matching line",
        lines: ["line1", "TARGET", "line3"],
        opts: { ...defaultOpts, before: /TARGET/ },
        expected: ["line1", "# blockinfile start", "NEW CONTENT", "# blockinfile end", "TARGET", "line3"],
      },
      {
        description: "after matching line",
        lines: ["line1", "TARGET", "line3"],
        opts: { ...defaultOpts, after: /TARGET/ },
        expected: ["line1", "TARGET", "# blockinfile start", "NEW CONTENT", "# blockinfile end", "line3"],
      },
      {
        description: "falls back to end when no match",
        lines: ["line1", "line2"],
        opts: { ...defaultOpts, after: /NOMATCH/ },
        expected: ["line1", "line2", "# blockinfile start", "NEW CONTENT", "# blockinfile end"],
      },
    ])("inserts $description", ({ lines, opts, expected }) => {
      const result = parseLines(lines, opts);
      expect(result.outputs).toEqual(expected);
    });

    it("matches first occurrence only", () => {
      const result = parseLines(["TARGET", "middle", "TARGET"], {
        ...defaultOpts,
        after: /TARGET/,
      });
      expect(result.outputs[0]).toBe("TARGET");
      expect(result.outputs[1]).toBe("# blockinfile start");
    });
  });

  describe("unclosed blocks", () => {
    it("handles unclosed block by closing it", () => {
      const lines = ["line1", "# blockinfile start", "unclosed content"];
      const result = parseLines(lines, defaultOpts);
      expect(result.outputs).toContain("# blockinfile start");
      expect(result.outputs).toContain("NEW CONTENT");
      expect(result.outputs).toContain("# blockinfile end");
    });
  });

  describe("custom markers", () => {
    it("uses custom opener and closer", () => {
      const lines = ["line1", "// BEGIN", "old", "// END", "line2"];
      const result = parseLines(lines, {
        opener: "// BEGIN",
        closer: "// END",
        inputBlock: "REPLACED",
      });
      expect(result.outputs).toEqual(["line1", "// BEGIN", "REPLACED", "// END", "line2"]);
    });
  });
});
