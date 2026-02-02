import { describe, it, expect } from "vitest";
import { defaultOptions, getDefaultOptions } from "../src/defaults.ts";

describe("defaults", () => {
  describe("defaultOptions", () => {
    it("has expected default values", () => {
      expect(defaultOptions.comment).toBe("#");
      expect(defaultOptions.markerStart).toBe("start");
      expect(defaultOptions.markerEnd).toBe("end");
      expect(defaultOptions.name).toBe("blockinfile");
      expect(defaultOptions.create).toBe(false);
      expect(defaultOptions.dos).toBe(false);
    });

    it("is frozen and immutable", () => {
      expect(Object.isFrozen(defaultOptions)).toBe(true);
      expect(() => {
        // @ts-expect-error testing immutability
        defaultOptions.comment = "//";
      }).toThrow();
    });
  });

  describe("getDefaultOptions", () => {
    it("returns a copy of default options", () => {
      const opts = getDefaultOptions();
      expect(opts).toEqual(defaultOptions);
      expect(opts).not.toBe(defaultOptions);
    });

    it("returns independent copies", () => {
      const opts1 = getDefaultOptions();
      const opts2 = getDefaultOptions();
      opts1.comment = "//";
      expect(opts2.comment).toBe("#");
    });
  });
});
