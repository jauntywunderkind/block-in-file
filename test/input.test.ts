import { describe, it, expect } from "vitest";

function get<T>(source: Partial<T>, defaults: Partial<T>, ...keys: (keyof T)[]) {
  if (keys.length === 1) {
    const key = keys[0];
    const o = source[key];
    return (o !== undefined ? o : defaults?.[key]) as unknown;
  }
  const o = Array.from({ length: keys.length });
  for (const i in keys) {
    o[i] = get(source, defaults, keys[i]);
  }
  return o;
}

function createOpt(
  value: boolean | 0 | 1 | "file" | "block",
  target: "file" | "block",
): { create: boolean } | undefined {
  return value === 1 || value === true || value === target ? { create: true } : undefined;
}

describe("input utilities", () => {
  describe("get", () => {
    const source: Partial<{ a: number; b: number; c: number }> = { a: 1, b: 2 };
    const defaults: Partial<{ a: number; b: number; c: number }> = { a: 10, b: 20, c: 30 };

    it.each([
      { key: "a" as const, expected: 1 },
      { key: "b" as const, expected: 2 },
    ])("returns source value for key $key", ({ key, expected }) => {
      expect(get(source, defaults, key)).toBe(expected);
    });

    it("falls back to defaults when source value missing", () => {
      expect(get(source, defaults, "c")).toBe(30);
    });

    it("returns undefined when neither has value", () => {
      expect(get(source, defaults, "d" as keyof typeof source)).toBeUndefined();
    });

    it("handles multiple keys, returning array", () => {
      const result = get(source, defaults, "a", "b", "c");
      expect(result).toEqual([1, 2, 30]);
    });

    it.each([
      { source: {}, expected: 10 },
      { source: source, expected: 1 },
    ])("handles source value for key 'a'", ({ source: testSource, expected }) => {
      expect(get(testSource, defaults, "a")).toBe(expected);
    });

    it("handles empty defaults", () => {
      expect(get(source, {}, "a")).toBe(1);
    });

    it("prefers explicit undefined in source over default", () => {
      const sourceWithUndefined: Partial<{ a: number; b: number; c: number }> = { a: undefined };
      expect(get(sourceWithUndefined, defaults, "a")).toBe(10);
    });
  });

  describe("createOpt", () => {
    it.each([
      { value: true as const, target: "file" as const, expected: { create: true } },
      { value: true as const, target: "block" as const, expected: { create: true } },
      { value: 1 as const, target: "file" as const, expected: { create: true } },
      { value: 1 as const, target: "block" as const, expected: { create: true } },
      { value: "file" as const, target: "file" as const, expected: { create: true } },
      { value: "block" as const, target: "block" as const, expected: { create: true } },
    ])("returns create:true when value=$value, target=$target", ({ value, target, expected }) => {
      expect(createOpt(value, target)).toEqual(expected);
    });

    it.each([
      { value: "file" as const, target: "block" as const },
      { value: "block" as const, target: "file" as const },
      { value: false as const, target: "file" as const },
      { value: 0 as const, target: "file" as const },
    ])("returns undefined when value=$value, target=$target", ({ value, target }) => {
      expect(createOpt(value, target)).toBeUndefined();
    });
  });
});
