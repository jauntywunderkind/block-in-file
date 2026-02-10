import { describe, it, expect, beforeEach } from "vitest";
import { substitute } from "../src/envsubst.ts";

describe("envsubst", () => {
  beforeEach(() => {
    delete process.env.TEST_VAR;
    delete process.env.NESTED_VAR;
    delete process.env.PREFIX_VAR;
  });

  describe("basic substitution with ${VAR} syntax", () => {
    it.each([
      { input: "content: ${TEST_VAR}", vars: { TEST_VAR: "hello" }, expected: "content: hello" },
      { input: "${VAR1} and ${VAR2}", vars: { VAR1: "foo", VAR2: "bar" }, expected: "foo and bar" },
      { input: "${PREFIX}-middle-${SUFFIX}", vars: { PREFIX: "pre", SUFFIX: "post" }, expected: "pre-middle-post" },
    ])("should substitute: $input", ({ input, vars, expected }) => {
      Object.assign(process.env, vars);
      const result = substitute(input, { mode: "non-recursive" });
      expect(result).toBe(expected);
      Object.keys(vars).forEach(key => delete process.env[key]);
    });
  });

  describe("basic substitution with $VAR syntax", () => {
    it.each([
      { input: "content: $TEST_VAR", vars: { TEST_VAR: "hello" }, expected: "content: hello" },
      { input: "$VAR1 and $VAR2", vars: { VAR1: "foo", VAR2: "bar" }, expected: "foo and bar" },
    ])("should substitute: $input", ({ input, vars, expected }) => {
      Object.assign(process.env, vars);
      const result = substitute(input, { mode: "non-recursive" });
      expect(result).toBe(expected);
      Object.keys(vars).forEach(key => delete process.env[key]);
    });
  });

  describe("priority - ${VAR} over $VAR", () => {
    it("should prefer ${VAR} syntax when both are present", () => {
      process.env.VAR = "value";
      const result = substitute("${VAR} and $VAR", { mode: "non-recursive" });
      expect(result).toBe("value and value");
    });

    it("should not substitute $VAR if it's part of ${VAR}", () => {
      process.env.VAR = "value";
      process.env.VAR_BRACE = "other";
      const result = substitute("${VAR}", { mode: "non-recursive" });
      expect(result).toBe("value");
    });
  });

  describe("recursive mode", () => {
    it("should substitute nested variables", () => {
      process.env.VAR1 = "value1";
      process.env.VAR2 = "prefix ${VAR1}";
      const result = substitute("result: ${VAR2}", { mode: "recursive" });
      expect(result).toBe("result: prefix value1");
      delete process.env.VAR1;
      delete process.env.VAR2;
    });

    it("should handle multiple levels of nesting", () => {
      process.env.VAR1 = "final";
      process.env.VAR2 = "level2 ${VAR1}";
      process.env.VAR3 = "level1 ${VAR2}";
      const result = substitute("start ${VAR3}", { mode: "recursive" });
      expect(result).toBe("start level1 level2 final");
      delete process.env.VAR1;
      delete process.env.VAR2;
      delete process.env.VAR3;
    });

    it("should stop when substitution is stable", () => {
      process.env.VAR1 = "value";
      process.env.VAR2 = "${VAR1}";
      const result = substitute("${VAR2}", { mode: "recursive" });
      expect(result).toBe("value");
      delete process.env.VAR1;
      delete process.env.VAR2;
    });
  });

  describe("non-recursive mode", () => {
    it("should do single pass substitution (like envsubst)", () => {
      process.env.VAR1 = "value1";
      process.env.VAR2 = "prefix ${VAR1}";
      const result = substitute("result: ${VAR2}", { mode: "non-recursive" });
      // Only ${VAR2} is replaced with its value, not ${VAR1}
      expect(result).toBe("result: prefix ${VAR1}");
      delete process.env.VAR1;
      delete process.env.VAR2;
    });

    it("should handle nested variables in one pass only", () => {
      process.env.VAR1 = "final";
      process.env.VAR2 = "${VAR1}";
      process.env.VAR3 = "${VAR2}";
      const result = substitute("${VAR3}", { mode: "non-recursive" });
      // Only ${VAR3} is replaced, result stays as ${VAR2}
      expect(result).toBe("${VAR2}");
      delete process.env.VAR1;
      delete process.env.VAR2;
      delete process.env.VAR3;
    });
  });

  describe("undefined variables", () => {
    it.each([
      { input: "content: ${UNDEFINED_VAR}", expected: "content: " },
      { input: "content: $UNDEFINED_VAR", expected: "content: " },
    ])("should replace undefined variables with empty string: $input", ({ input, expected }) => {
      const result = substitute(input, { mode: "non-recursive" });
      expect(result).toBe(expected);
    });

    it("should handle mix of defined and undefined variables", () => {
      process.env.DEFINED_VAR = "value";
      const result = substitute("${DEFINED_VAR} and ${UNDEFINED_VAR}", { mode: "non-recursive" });
      expect(result).toBe("value and ");
      delete process.env.DEFINED_VAR;
    });

    it("should handle variables with empty values", () => {
      process.env.EMPTY_VAR = "";
      const result = substitute("prefix${EMPTY_VAR}suffix", { mode: "non-recursive" });
      expect(result).toBe("prefixsuffix");
      delete process.env.EMPTY_VAR;
    });
  });

  describe("edge cases", () => {
    it.each([
      { input: "", expected: "" },
      { input: "just plain text", expected: "just plain text" },
    ])("should handle: $input", ({ input, expected }) => {
      const result = substitute(input, { mode: "non-recursive" });
      expect(result).toBe(expected);
    });

    it.each([
      { input: "${MY_LONG_VAR_NAME}", varName: "MY_LONG_VAR_NAME", value: "value", expected: "value" },
      { input: "${VAR123}", varName: "VAR123", value: "value", expected: "value" },
    ])("should handle variable names with special characters: $input", ({ input, varName, value, expected }) => {
      process.env[varName] = value;
      const result = substitute(input, { mode: "non-recursive" });
      expect(result).toBe(expected);
      delete process.env[varName];
    });

    it("should handle variables with empty values", () => {
      process.env.EMPTY_VAR = "";
      const result = substitute("prefix${EMPTY_VAR}suffix", { mode: "non-recursive" });
      expect(result).toBe("prefixsuffix");
      delete process.env.EMPTY_VAR;
    });
  });

  describe("mode: false", () => {
    it("should not substitute when mode is false", () => {
      process.env.TEST_VAR = "value";
      const result = substitute("content: ${TEST_VAR}", { mode: false });
      expect(result).toBe("content: ${TEST_VAR}");
    });
  });

  describe("malformed syntax", () => {
    it("should handle malformed ${ at end", () => {
      process.env.TEST_VAR = "value";
      const result = substitute("content: ${", { mode: "non-recursive" });
      expect(result).toBe("content: ${");
    });

    it("should handle malformed ${VAR without closing brace", () => {
      process.env.TEST_VAR = "value";
      const result = substitute("content: ${TEST_VAR", { mode: "non-recursive" });
      expect(result).toBe("content: ${TEST_VAR");
    });

    it("should handle $ at end", () => {
      process.env.TEST_VAR = "value";
      const result = substitute("content: $", { mode: "non-recursive" });
      expect(result).toBe("content: $");
    });
  });
});
