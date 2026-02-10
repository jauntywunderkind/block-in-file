import { describe, it, expect } from "vitest";
import { formatOutputs, generateDiff } from "../src/output.ts";

describe("output utilities", () => {
  describe("formatOutputs", () => {
    it.each([
      { outputs: ["line1", "line2", "line3"], dos: false, expected: "line1\nline2\nline3\n" },
      { outputs: ["line1", "line2", "line3"], dos: true, expected: "line1\r\nline2\r\nline3\r\n" },
      { outputs: ["line1", "line2"], dos: false, expected: "line1\nline2\n" },
      { outputs: ["line1", "line2", ""], dos: false, expected: "line1\nline2\n" },
      { outputs: [], dos: false, expected: "" },
      { outputs: ["only line"], dos: false, expected: "only line\n" },
      { outputs: ["line1", "", "line3"], dos: false, expected: "line1\n\nline3\n" },
    ])("handles outputs: $outputs", ({ outputs, dos, expected }) => {
      const result = formatOutputs(outputs, dos);
      expect(result).toBe(expected);
    });
  });

  describe("generateDiff", () => {
    it("shows no changes for identical content", () => {
      const content = "line1\nline2\n";
      const diff = generateDiff(content, content, "test.txt");
      expect(diff).toContain("--- test.txt");
      expect(diff).toContain("+++ test.txt");
      expect(diff).not.toContain("-line");
      expect(diff).not.toContain("+line");
    });

    it.each([
      { original: "line1\nline2\n", modified: "line1\nNEW\nline2\n", expected: "+NEW" },
      { original: "line1\nOLD\nline2\n", modified: "line1\nline2\n", expected: "-OLD" },
      { original: "line1\nOLD\nline2\n", modified: "line1\nNEW\nline2\n", expectedContains: ["-OLD", "+NEW"] },
    ])("handles diff: $modified", ({ original, modified, expected, expectedContains }) => {
      const diff = generateDiff(original, modified, "test.txt");
      if (expected) {
        expect(diff).toContain(expected);
      }
      if (expectedContains) {
        expectedContains.forEach(str => expect(diff).toContain(str));
      }
    });
  });
});
