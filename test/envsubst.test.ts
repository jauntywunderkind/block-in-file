import { describe, it, expect, beforeEach } from "vitest";
import { substitute } from "../src/envsubst.ts";

describe("envsubst", () => {
  beforeEach(() => {
    delete process.env.TEST_VAR;
    delete process.env.NESTED_VAR;
    delete process.env.PREFIX_VAR;
  });

  describe("basic substitution with ${VAR} syntax", () => {
    it("should substitute a single environment variable", () => {
      process.env.TEST_VAR = "hello";
      const result = substitute("content: ${TEST_VAR}", { mode: "non-recursive" });
      expect(result).toBe("content: hello");
    });

    it("should substitute multiple variables", () => {
      process.env.VAR1 = "foo";
      process.env.VAR2 = "bar";
      const result = substitute("${VAR1} and ${VAR2}", { mode: "non-recursive" });
      expect(result).toBe("foo and bar");
    });

    it("should substitute in different positions", () => {
      process.env.PREFIX = "pre";
      process.env.SUFFIX = "post";
      const result = substitute("${PREFIX}-middle-${SUFFIX}", { mode: "non-recursive" });
      expect(result).toBe("pre-middle-post");
    });
  });

  describe("basic substitution with $VAR syntax", () => {
    it("should substitute a single environment variable", () => {
      process.env.TEST_VAR = "hello";
      const result = substitute("content: $TEST_VAR", { mode: "non-recursive" });
      expect(result).toBe("content: hello");
    });

    it("should substitute multiple variables", () => {
      process.env.VAR1 = "foo";
      process.env.VAR2 = "bar";
      const result = substitute("$VAR1 and $VAR2", { mode: "non-recursive" });
      expect(result).toBe("foo and bar");
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
    });

    it("should handle multiple levels of nesting", () => {
      process.env.VAR1 = "final";
      process.env.VAR2 = "level2 ${VAR1}";
      process.env.VAR3 = "level1 ${VAR2}";
      const result = substitute("start ${VAR3}", { mode: "recursive" });
      expect(result).toBe("start level1 level2 final");
    });

    it("should stop when substitution is stable", () => {
      process.env.VAR1 = "value";
      process.env.VAR2 = "${VAR1}";
      const result = substitute("${VAR2}", { mode: "recursive" });
      expect(result).toBe("value");
    });
  });

  describe("non-recursive mode", () => {
    it("should substitute until stable", () => {
      process.env.VAR1 = "value1";
      process.env.VAR2 = "prefix ${VAR1}";
      const result = substitute("result: ${VAR2}", { mode: "non-recursive" });
      expect(result).toBe("result: prefix value1");
    });

    it("should handle multiple levels of nesting", () => {
      process.env.VAR1 = "final";
      process.env.VAR2 = "${VAR1}";
      process.env.VAR3 = "${VAR2}";
      const result = substitute("${VAR3}", { mode: "non-recursive" });
      expect(result).toBe("final");
    });

    it("should stop when substitution is stable", () => {
      process.env.VAR1 = "value";
      process.env.VAR2 = "${VAR1}";
      const result = substitute("${VAR2}", { mode: "non-recursive" });
      expect(result).toBe("value");
    });
  });

  describe("undefined variables", () => {
    it("should leave undefined variables unchanged with ${VAR}", () => {
      const result = substitute("content: ${UNDEFINED_VAR}", { mode: "non-recursive" });
      expect(result).toBe("content: ${UNDEFINED_VAR}");
    });

    it("should leave undefined variables unchanged with $VAR", () => {
      const result = substitute("content: $UNDEFINED_VAR", { mode: "non-recursive" });
      expect(result).toBe("content: $UNDEFINED_VAR");
    });

    it("should handle mix of defined and undefined variables", () => {
      process.env.DEFINED_VAR = "value";
      const result = substitute("${DEFINED_VAR} and ${UNDEFINED_VAR}", { mode: "non-recursive" });
      expect(result).toBe("value and ${UNDEFINED_VAR}");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const result = substitute("", { mode: "non-recursive" });
      expect(result).toBe("");
    });

    it("should handle string with no variables", () => {
      const result = substitute("just plain text", { mode: "non-recursive" });
      expect(result).toBe("just plain text");
    });

    it("should handle variable names with underscores", () => {
      process.env.MY_LONG_VAR_NAME = "value";
      const result = substitute("${MY_LONG_VAR_NAME}", { mode: "non-recursive" });
      expect(result).toBe("value");
    });

    it("should handle variable names with numbers", () => {
      process.env.VAR123 = "value";
      const result = substitute("${VAR123}", { mode: "non-recursive" });
      expect(result).toBe("value");
    });

    it("should handle variables with empty values", () => {
      process.env.EMPTY_VAR = "";
      const result = substitute("prefix${EMPTY_VAR}suffix", { mode: "non-recursive" });
      expect(result).toBe("prefixsuffix");
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
