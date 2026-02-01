import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { execSync } from "node:child_process"

describe("CLI", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blockinfile-cli-test-"))
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	function runCli(args: string, input?: string): string {
		const cwd = path.resolve(import.meta.dirname!, "../..")
		const cmd = `deno run --allow-read --allow-write src/cli.ts ${args}`
		return execSync(cmd, {
			cwd,
			input,
			encoding: "utf-8",
		})
	}

	describe("help and version", () => {
		it("shows help with --help", () => {
			const output = runCli("--help")
			expect(output).toContain("blockinfile")
			expect(output).toContain("Insert & update blocks")
		})

		it("shows version with --version", () => {
			const output = runCli("--version")
			expect(output).toContain("0.1.0")
		})
	})

	describe("basic file operations", () => {
		it("inserts block from stdin", async () => {
			const targetFile = path.join(tempDir, "target.txt")
			await fs.writeFile(targetFile, "line1\nline2\n")

			runCli(`-i - ${targetFile}`, "INSERTED")

			const result = await fs.readFile(targetFile, "utf-8")
			expect(result).toContain("# blockinfile start")
			expect(result).toContain("INSERTED")
			expect(result).toContain("# blockinfile end")
		})

		it("reads input from file", async () => {
			const inputFile = path.join(tempDir, "input.txt")
			const targetFile = path.join(tempDir, "target.txt")
			await fs.writeFile(inputFile, "FROM FILE")
			await fs.writeFile(targetFile, "original\n")

			runCli(`-i ${inputFile} ${targetFile}`)

			const result = await fs.readFile(targetFile, "utf-8")
			expect(result).toContain("FROM FILE")
		})
	})

	describe("options", () => {
		it("uses custom name with -n", async () => {
			const targetFile = path.join(tempDir, "target.txt")
			await fs.writeFile(targetFile, "content\n")

			runCli(`-n myname ${targetFile}`, "BLOCK")

			const result = await fs.readFile(targetFile, "utf-8")
			expect(result).toContain("# myname start")
		})

		it("uses custom comment with -c", async () => {
			const targetFile = path.join(tempDir, "target.txt")
			await fs.writeFile(targetFile, "content\n")

			runCli(`-c "//" ${targetFile}`, "BLOCK")

			const result = await fs.readFile(targetFile, "utf-8")
			expect(result).toContain("// blockinfile start")
		})

		it("outputs to stdout with -o -", async () => {
			const targetFile = path.join(tempDir, "target.txt")
			await fs.writeFile(targetFile, "content\n")

			const output = runCli(`-o - ${targetFile}`, "BLOCK")

			expect(output).toContain("# blockinfile start")
			expect(output).toContain("BLOCK")
		})
	})
})
