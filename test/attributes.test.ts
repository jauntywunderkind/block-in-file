import { describe, it, expect } from "vitest";
import { parseAttributes, supportsChattr } from "../src/attributes.ts";

describe("attributes", () => {
  describe("parseAttributes", () => {
    it("parses single immutable attribute", () => {
      const result = parseAttributes("+i");
      expect(result).toEqual([{ mode: "+", attribute: "i" }]);
    });

    it("parses single append-only attribute", () => {
      const result = parseAttributes("+a");
      expect(result).toEqual([{ mode: "+", attribute: "a" }]);
    });

    it("parses remove immutable attribute", () => {
      const result = parseAttributes("-i");
      expect(result).toEqual([{ mode: "-", attribute: "i" }]);
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

    it("parses exact set attribute", () => {
      const result = parseAttributes("=i");
      expect(result).toEqual([{ mode: "=", attribute: "i" }]);
    });

    it("parses uppercase attributes", () => {
      const result = parseAttributes("+I");
      expect(result).toEqual([{ mode: "+", attribute: "I" }]);
    });

    it("handles empty string", () => {
      const result = parseAttributes("");
      expect(result).toEqual([]);
    });

    it("handles whitespace only", () => {
      const result = parseAttributes("   ");
      expect(result).toEqual([]);
    });

    it("handles extra whitespace between attributes", () => {
      const result = parseAttributes("  +i   +a  ");
      expect(result).toEqual([
        { mode: "+", attribute: "i" },
        { mode: "+", attribute: "a" },
      ]);
    });

    it("throws error for invalid mode", () => {
      expect(() => parseAttributes("xi")).toThrow("Invalid attribute syntax: xi");
    });

    it("throws error for missing attribute", () => {
      expect(() => parseAttributes("+")).toThrow("Invalid attribute syntax: +");
    });

    it("throws error for invalid attribute characters", () => {
      expect(() => parseAttributes("+1")).toThrow("Invalid attribute syntax: +1");
    });

    it("throws error for attribute with space in mode", () => {
      expect(() => parseAttributes("+ i")).toThrow(/Invalid attribute syntax/);
    });
  });

  describe("supportsChattr", () => {
    it("returns false on non-Linux platforms", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin" });

      try {
        expect(await supportsChattr()).toBe(false);
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform });
      }
    });

    it("returns false on Windows", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });

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
