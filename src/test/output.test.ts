import { describe, it, expect } from "vitest"
import { formatOutputs, generateDiff } from "../output.ts"

describe("output utilities", () => {
	describe("formatOutputs", () => {
		it("joins lines with unix line endings", () => {
			const outputs = ["line1", "line2", "line3"]
			const result = formatOutputs(outputs, false)
			expect(result).toBe("line1\nline2\nline3\n")
		})

		it("joins lines with dos line endings", () => {
			const outputs = ["line1", "line2", "line3"]
			const result = formatOutputs(outputs, true)
			expect(result).toBe("line1\r\nline2\r\nline3\r\n")
		})

		it("adds trailing newline if missing", () => {
			const outputs = ["line1", "line2"]
			const result = formatOutputs(outputs, false)
			expect(result.endsWith("\n")).toBe(true)
		})

		it("does not double trailing newline", () => {
			const outputs = ["line1", "line2", ""]
			const result = formatOutputs(outputs, false)
			expect(result).toBe("line1\nline2\n")
			expect(result.endsWith("\n\n")).toBe(false)
		})

		it("handles empty array", () => {
			const outputs: string[] = []
			const result = formatOutputs(outputs, false)
			expect(result).toBe("")
		})

		it("handles single line", () => {
			const outputs = ["only line"]
			const result = formatOutputs(outputs, false)
			expect(result).toBe("only line\n")
		})

		it("preserves empty lines in middle", () => {
			const outputs = ["line1", "", "line3"]
			const result = formatOutputs(outputs, false)
			expect(result).toBe("line1\n\nline3\n")
		})
	})

	describe("generateDiff", () => {
		it("shows no changes for identical content", () => {
			const content = "line1\nline2\n"
			const diff = generateDiff(content, content, "test.txt")
			expect(diff).toContain("--- test.txt")
			expect(diff).toContain("+++ test.txt")
			expect(diff).not.toContain("-line")
			expect(diff).not.toContain("+line")
		})

		it("shows added lines", () => {
			const original = "line1\nline2\n"
			const modified = "line1\nNEW\nline2\n"
			const diff = generateDiff(original, modified, "test.txt")
			expect(diff).toContain("+NEW")
		})

		it("shows removed lines", () => {
			const original = "line1\nOLD\nline2\n"
			const modified = "line1\nline2\n"
			const diff = generateDiff(original, modified, "test.txt")
			expect(diff).toContain("-OLD")
		})

		it("shows changed lines", () => {
			const original = "line1\nOLD\nline2\n"
			const modified = "line1\nNEW\nline2\n"
			const diff = generateDiff(original, modified, "test.txt")
			expect(diff).toContain("-OLD")
			expect(diff).toContain("+NEW")
		})
	})
})
