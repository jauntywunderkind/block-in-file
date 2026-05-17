import { describe, it, expect, beforeEach } from "vitest";
import { substitute } from "../src/envsubst.ts";

describe("envsubst exclude", () => {
  beforeEach(() => {
    delete process.env.HOME;
    delete process.env.PATH;
    delete process.env.ZIM_CONFIG_FILE;
    delete process.env.ZIM_HOME;
    delete process.env.VAR;
    delete process.env.OTHER;
  });

  describe("exact name exclude", () => {
    it("should skip excluded variable in ${VAR} syntax", () => {
      process.env.VAR = "value";
      process.env.OTHER = "other";
      const result = substitute("${VAR} ${OTHER}", {
        mode: "non-recursive",
        exclude: /^VAR$/,
      });
      expect(result).toBe("${VAR} other");
    });

    it("should skip excluded variable in $VAR syntax", () => {
      process.env.VAR = "value";
      process.env.OTHER = "other";
      const result = substitute("$VAR $OTHER", {
        mode: "non-recursive",
        exclude: /^VAR$/,
      });
      expect(result).toBe("$VAR other");
    });

    it("should skip excluded undefined variable instead of blanking", () => {
      const result = substitute("${ZIM_CONFIG_FILE}", {
        mode: "non-recursive",
        exclude: /^ZIM_CONFIG_FILE$/,
      });
      expect(result).toBe("${ZIM_CONFIG_FILE}");
    });
  });

  describe("regex pattern exclude", () => {
    it("should exclude all vars matching a prefix pattern", () => {
      process.env.ZIM_HOME = "/opt/zim";
      process.env.ZIM_CONFIG_FILE = "/etc/zim.conf";
      process.env.HOME = "/home/user";
      const result = substitute("${ZIM_HOME} ${ZIM_CONFIG_FILE} ${HOME}", {
        mode: "non-recursive",
        exclude: /^ZIM_/,
      });
      expect(result).toBe("${ZIM_HOME} ${ZIM_CONFIG_FILE} /home/user");
    });

    it("should exclude with alternation pattern", () => {
      process.env.VAR = "value";
      process.env.OTHER = "other";
      process.env.THIRD = "third";
      const result = substitute("${VAR} ${OTHER} ${THIRD}", {
        mode: "non-recursive",
        exclude: /^(VAR|OTHER)$/,
      });
      expect(result).toBe("${VAR} ${OTHER} third");
    });
  });

  describe("no exclude", () => {
    it("should substitute normally when exclude is undefined", () => {
      process.env.VAR = "value";
      const result = substitute("${VAR}", { mode: "non-recursive" });
      expect(result).toBe("value");
    });
  });

  describe("recursive mode with exclude", () => {
    it("should preserve excluded vars through recursive passes", () => {
      process.env.VAR = "value";
      process.env.NESTED = "prefix ${VAR}";
      const result = substitute("${NESTED} ${VAR}", {
        mode: "recursive",
        exclude: /^VAR$/,
      });
      expect(result).toBe("prefix ${VAR} ${VAR}");
    });
  });

  describe("edge cases", () => {
    it("should handle exclude matching nothing", () => {
      process.env.VAR = "value";
      const result = substitute("${VAR}", {
        mode: "non-recursive",
        exclude: /^NO_MATCH$/,
      });
      expect(result).toBe("value");
    });

    it("should handle exclude matching everything", () => {
      process.env.VAR = "value";
      process.env.OTHER = "other";
      const result = substitute("${VAR} ${OTHER}", {
        mode: "non-recursive",
        exclude: /.*/,
      });
      expect(result).toBe("${VAR} ${OTHER}");
    });
  });
});
