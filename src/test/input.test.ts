import { describe, it, expect } from "vitest"

function get<T>(source: Partial<T>, defaults: Partial<T>, ...keys: (keyof T)[]) {
	if (keys.length === 1) {
		const key = keys[0]
		const o = source[key]
		return (o !== undefined ? o : defaults?.[key]) as unknown
	}
	const o = new Array(keys.length)
	for (const i in keys) {
		o[i] = get(source, defaults, keys[i])
	}
	return o
}

function createOpt(
	value: boolean | 0 | 1 | "file" | "block",
	target: "file" | "block",
): { create: boolean } | undefined {
	return value === 1 || value === true || value === target ? { create: true } : undefined
}

describe("input utilities", () => {
	describe("get", () => {
		const source = { a: 1, b: 2 }
		const defaults = { a: 10, b: 20, c: 30 }

		it("returns source value when present", () => {
			expect(get(source, defaults, "a")).toBe(1)
			expect(get(source, defaults, "b")).toBe(2)
		})

		it("falls back to defaults when source value missing", () => {
			expect(get(source, defaults, "c")).toBe(30)
		})

		it("returns undefined when neither has value", () => {
			expect(get(source, defaults, "d" as keyof typeof source)).toBeUndefined()
		})

		it("handles multiple keys, returning array", () => {
			const result = get(source, defaults, "a", "b", "c")
			expect(result).toEqual([1, 2, 30])
		})

		it("handles empty source", () => {
			expect(get({}, defaults, "a")).toBe(10)
		})

		it("handles empty defaults", () => {
			expect(get(source, {}, "a")).toBe(1)
		})

		it("prefers explicit undefined in source over default", () => {
			const sourceWithUndefined = { a: undefined }
			expect(get(sourceWithUndefined, defaults, "a")).toBe(10)
		})
	})

	describe("createOpt", () => {
		it("returns create:true for value=true", () => {
			expect(createOpt(true, "file")).toEqual({ create: true })
			expect(createOpt(true, "block")).toEqual({ create: true })
		})

		it("returns create:true for value=1", () => {
			expect(createOpt(1, "file")).toEqual({ create: true })
			expect(createOpt(1, "block")).toEqual({ create: true })
		})

		it("returns create:true when value matches target", () => {
			expect(createOpt("file", "file")).toEqual({ create: true })
			expect(createOpt("block", "block")).toEqual({ create: true })
		})

		it("returns undefined when value does not match", () => {
			expect(createOpt("file", "block")).toBeUndefined()
			expect(createOpt("block", "file")).toBeUndefined()
			expect(createOpt(false, "file")).toBeUndefined()
			expect(createOpt(0, "file")).toBeUndefined()
		})
	})
})
