import { describe, it, expect } from "vitest";
import { parseAttributes, supportsChattr } from "../src/attributes.ts";

describe("attributes", () => {
  describe("parseAttributes", () => {
    it.each([
      { input: "+i", expected: [{ mode: "+", attribute: "i" }] },
      { input: "+a", expected: [{ mode: "+", attribute: "a" }] },
      { input: "-i", expected: [{ mode: "-", attribute: "i" }] },
      { input: "=i", expected: [{ mode: "=", attribute: "i" }] },
      { input: "+I", expected: [{ mode: "+", attribute: "I" }] },
    ])("parses $input", ({ input, expected }) => {
      const result = parseAttributes(input);
      expect(result).toEqual(expected);
    });

    it("parses multiple space-separated attributes", () => {
      const result = parseAttributes("+i +a +d");
      expect(result).toEqual([
        { mode: "+", attribute: "i" },
        { mode: "+", attribute: "a" },
        { mode: "+", attribute: "d" },
      ]);
    });

    it("parses mixed add and remove attributes", () => {
      const result = parseAttributes("-i +a");
      expect(result).toEqual([
        { mode: "-", attribute: "i" },
        { mode: "+", attribute: "a" },
      ]);
    });

    it.each([
      { input: "", description: "empty string" },
      { input: "   ", description: "whitespace only" },
    ])("handles $description", ({ input }) => {
      const result = parseAttributes(input);
      expect(result).toEqual([]);
    });

    it("handles extra whitespace between attributes", () => {
      const result = parseAttributes("  +i   +a  ");
      expect(result).toEqual([
        { mode: "+", attribute: "i" },
        { mode: "+", attribute: "a" },
      ]);
    });

    it.each([
      { input: "xi", description: "invalid mode" },
      { input: "+", description: "missing attribute" },
      { input: "+1", description: "invalid attribute characters" },
      { input: "+ i", description: "attribute with space in mode" },
    ])("throws error for $description: $input", ({ input }) => {
      expect(() => parseAttributes(input)).toThrow(/Invalid attribute syntax/);
    });
  });

  describe("supportsChattr", () => {
    it.each([
      "darwin",
      "win32",
    ] as const)("returns false on $platform", async (platform) => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: platform });

      try {
        expect(await supportsChattr()).toBe(false);
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform });
      }
    });

    it("returns boolean on Linux (depends on chattr availability)", async () => {
      if (process.platform === "linux") {
        const result = await supportsChattr();
        expect(typeof result).toBe("boolean");
      } else {
        expect(await supportsChattr()).toBe(false);
      }
    });
  });

  describe("attribute change types", () => {
    it("correctly identifies all mode types", () => {
      const result = parseAttributes("+i -a =d");
      expect(result[0].mode).toBe("+");
      expect(result[1].mode).toBe("-");
      expect(result[2].mode).toBe("=");
    });

    it("correctly identifies attribute values", () => {
      const result = parseAttributes("+immutable -appendonly +nodump");
      expect(result[0].attribute).toBe("immutable");
      expect(result[1].attribute).toBe("appendonly");
      expect(result[2].attribute).toBe("nodump");
    });
  });
});
