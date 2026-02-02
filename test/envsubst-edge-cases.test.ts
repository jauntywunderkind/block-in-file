import { describe, it, expect, beforeEach } from "vitest";
import { substitute } from "../src/envsubst.ts";

describe("envsubst edge cases", () => {
  beforeEach(() => {
    delete process.env.TEST_VAR;
    delete process.env.NESTED;
    delete process.env.VAR;
  });

  describe("empty variable names", () => {
    it("should leave ${} unchanged", () => {
      const result = substitute("value: ${}", { mode: "recursive" });
      expect(result).toBe("value: ${}");
    });

    it("should leave $ unchanged (no variable name)", () => {
      const result = substitute("value: $", { mode: "recursive" });
      expect(result).toBe("value: $");
    });

    it("should leave ${} undefined - it doesn't match our pattern", () => {
      process.env.EMPTY = "";
      const result = substitute("value: ${EMPTY}", { mode: "recursive" });
      expect(result).toBe("value: ");
      delete process.env.EMPTY;
    });
  });

  describe("nested braces ${VAR${NESTED}}", () => {
    it("should expand fully in recursive mode", () => {
      process.env.NESTED = "inner";
      process.env.VARinner = "final";
      const result = substitute("${VAR${NESTED}}", { mode: "recursive" });
      // Recursive: expands ${NESTED} to "inner", then ${VARinner} to "final"
      expect(result).toBe("final");
      delete process.env.NESTED;
      delete process.env.VARinner;
    });

    it("should expand fully in recursive mode with undefined outer var", () => {
      delete process.env.NESTED;
      process.env.VAR = "value";
      const result = substitute("${VAR${NESTED}}", { mode: "recursive" });
      // ${NESTED} becomes "", so ${VAR${NESTED}} becomes ${VAR} which becomes "value"
      expect(result).toBe("value");
      delete process.env.VAR;
    });

    it("should expand inner only in non-recursive mode (single pass)", () => {
      process.env.NESTED = "inner";
      process.env.VARinner = "final";
      const result = substitute("${VAR${NESTED}}", { mode: "non-recursive" });
      // Non-recursive: expands ${NESTED} to "inner", but not ${VARinner}
      expect(result).toBe("${VARinner}");
      delete process.env.NESTED;
      delete process.env.VARinner;
    });

    it("should expand inner to empty in non-recursive mode with undefined", () => {
      delete process.env.NESTED;
      const result = substitute("${VAR${NESTED}}", { mode: "non-recursive" });
      // ${NESTED} becomes "", so result is ${VAR}
      expect(result).toBe("${VAR}");
    });
  });

  describe("escaping with backslash", () => {
    it("should not support escaping (matches envsubst behavior)", () => {
      process.env.VAR = "value";
      const result = substitute("\\${VAR}", { mode: "recursive" });
      // envsubst treats backslash as literal, still substitutes
      expect(result).toBe("\\value");
      delete process.env.VAR;
    });

    it("should handle \\$VAR similarly", () => {
      process.env.VAR = "value";
      const result = substitute("\\$VAR", { mode: "recursive" });
      expect(result).toBe("\\value");
      delete process.env.VAR;
    });

    it("should handle multiple backslashes", () => {
      process.env.VAR = "value";
      const result = substitute("\\\\${VAR}", { mode: "recursive" });
      expect(result).toBe("\\\\value");
      delete process.env.VAR;
    });
  });

  describe("special characters", () => {
    it("should not substitute variables with invalid characters", () => {
      process.env["VAR-INVALID"] = "value";
      const result = substitute("${VAR-INVALID}", { mode: "recursive" });
      // Hyphen not in [a-zA-Z0-9_], so won't match
      expect(result).toBe("${VAR-INVALID}");
      delete process.env["VAR-INVALID"];
    });

    it("should not substitute variables starting with numbers", () => {
      process.env["1VAR"] = "value";
      const result = substitute("${1VAR}", { mode: "recursive" });
      // Doesn't start with [a-zA-Z_], so won't match
      expect(result).toBe("${1VAR}");
      delete process.env["1VAR"];
    });

    it("should substitute variables with underscores", () => {
      process.env.MY_LONG_VAR_NAME_123 = "value";
      const result = substitute("${MY_LONG_VAR_NAME_123}", { mode: "recursive" });
      expect(result).toBe("value");
      delete process.env.MY_LONG_VAR_NAME_123;
    });
  });
});
