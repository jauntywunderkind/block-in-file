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
    it("inserts block at end of empty file", () => {
      const result = parseLines([], defaultOpts);
      expect(result.outputs).toEqual(["# blockinfile start", "NEW CONTENT", "# blockinfile end"]);
    });

    it("inserts block at end when no markers exist", () => {
      const result = parseLines(["line1", "line2", "line3"], defaultOpts);
      expect(result.outputs).toContain("# blockinfile start");
      expect(result.outputs).toContain("NEW CONTENT");
      expect(result.outputs).toContain("# blockinfile end");
      expect(result.outputs).toContain("line1");
      expect(result.outputs).toContain("line2");
      expect(result.outputs).toContain("line3");
    });
  });

  describe("replacing existing blocks", () => {
    it("replaces content of existing block", () => {
      const lines = ["line1", "# blockinfile start", "OLD CONTENT", "# blockinfile end", "line2"];
      const result = parseLines(lines, defaultOpts);
      expect(result.outputs).toEqual([
        "line1",
        "# blockinfile start",
        "NEW CONTENT",
        "# blockinfile end",
        "line2",
      ]);
    });

    it("inserts at end when after=true (EOF)", () => {
      const result = parseLines(["line1", "line2"], {
        ...defaultOpts,
        after: true,
      });
      expect(result.outputs).toEqual([
        "line1",
        "line2",
        "# blockinfile start",
        "NEW CONTENT",
        "# blockinfile end",
      ]);
    });

    it("inserts at beginning when before=true (BOF)", () => {
      const result = parseLines(["line1", "line2"], {
        ...defaultOpts,
        before: true,
      });
      expect(result.outputs).toEqual([
        "# blockinfile start",
        "NEW CONTENT",
        "# blockinfile end",
        "line1",
        "line2",
      ]);
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
    it("inserts at beginning when before=true", () => {
      const result = parseLines(["line1", "line2"], {
        ...defaultOpts,
        before: true,
      });
      expect(result.outputs).toEqual([
        "# blockinfile start",
        "NEW CONTENT",
        "# blockinfile end",
        "line1",
        "line2",
      ]);
    });

    it("inserts before matching line", () => {
      const result = parseLines(["line1", "TARGET", "line3"], {
        ...defaultOpts,
        before: /TARGET/,
      });
      expect(result.outputs).toEqual([
        "line1",
        "# blockinfile start",
        "NEW CONTENT",
        "# blockinfile end",
        "TARGET",
        "line3",
      ]);
    });

    it("inserts after matching line", () => {
      const result = parseLines(["line1", "TARGET", "line3"], {
        ...defaultOpts,
        after: /TARGET/,
      });
      expect(result.outputs).toEqual([
        "line1",
        "TARGET",
        "# blockinfile start",
        "NEW CONTENT",
        "# blockinfile end",
        "line3",
      ]);
    });

    it("matches first occurrence only", () => {
      const result = parseLines(["TARGET", "middle", "TARGET"], {
        ...defaultOpts,
        after: /TARGET/,
      });
      expect(result.outputs[0]).toBe("TARGET");
      expect(result.outputs[1]).toBe("# blockinfile start");
    });

    it("falls back to end when no match", () => {
      const result = parseLines(["line1", "line2"], {
        ...defaultOpts,
        after: /NOMATCH/,
      });
      expect(result.outputs).toEqual([
        "line1",
        "line2",
        "# blockinfile start",
        "NEW CONTENT",
        "# blockinfile end",
      ]);
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
