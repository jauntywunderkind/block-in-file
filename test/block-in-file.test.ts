import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

describe("BlockInFile integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blockinfile-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function runBlockInFile(args: string, input?: string): string {
    const cwd = path.resolve(import.meta.dirname!, "..");
    const cmd = `npx tsx block-in-file.ts ${args}`;
    return execSync(cmd, {
      cwd,
      input,
      encoding: "utf-8",
    });
  }

  describe("basic operations", () => {
    it("inserts block into file", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      runBlockInFile(targetFile, "INSERTED CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("# blockinfile start");
      expect(result).toContain("INSERTED CONTENT");
      expect(result).toContain("# blockinfile end");
    });

    it("replaces existing block", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\n# blockinfile start\nOLD\n# blockinfile end\nline2\n");

      runBlockInFile(targetFile, "NEW");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("NEW");
      expect(result).not.toContain("OLD");
    });
  });

  describe("options", () => {
    it("uses custom comment character", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\n");

      runBlockInFile(`-c "//" ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("// blockinfile start");
      expect(result).toContain("// blockinfile end");
    });

    it("uses custom block name", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\n");

      runBlockInFile(`-n myblock ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("# myblock start");
      expect(result).toContain("# myblock end");
    });

    it("uses custom markers", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\n");

      runBlockInFile(`--marker-start BEGIN --marker-end END ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("# blockinfile BEGIN");
      expect(result).toContain("# blockinfile END");
    });

    it("uses dos line endings", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      runBlockInFile(`--dos ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("\r\n");
    });
  });

  describe("before/after positioning", () => {
    it("inserts before matching pattern", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nMARKER\nline3\n");

      runBlockInFile(`-b MARKER ${targetFile}`, "INSERTED");

      const result = await fs.readFile(targetFile, "utf-8");
      const lines = result.split("\n");
      const markerIndex = lines.indexOf("MARKER");
      const startIndex = lines.indexOf("# blockinfile start");
      expect(startIndex).toBeLessThan(markerIndex);
    });

    it("inserts after matching pattern", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nMARKER\nline3\n");

      runBlockInFile(`-a MARKER ${targetFile}`, "INSERTED");

      const result = await fs.readFile(targetFile, "utf-8");
      const lines = result.split("\n");
      const markerIndex = lines.indexOf("MARKER");
      const startIndex = lines.indexOf("# blockinfile start");
      expect(startIndex).toBeGreaterThan(markerIndex);
    });
  });

  describe("output modes", () => {
    it("writes to different output file", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const outputFile = path.join(tempDir, "output.txt");
      await fs.writeFile(targetFile, "original\n");

      runBlockInFile(`-o ${outputFile} ${targetFile}`, "CONTENT");

      const originalContent = await fs.readFile(targetFile, "utf-8");
      expect(originalContent).toBe("original\n");

      const outputContent = await fs.readFile(outputFile, "utf-8");
      expect(outputContent).toContain("CONTENT");
    });

    it("outputs to stdout with -o -", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "original\n");

      const output = runBlockInFile(`-o - ${targetFile}`, "CONTENT");
      expect(output).toContain("CONTENT");

      const fileContent = await fs.readFile(targetFile, "utf-8");
      expect(fileContent).toBe("original\n");
    });
  });

  describe("input sources", () => {
    it("reads input from file", async () => {
      const inputFile = path.join(tempDir, "input.txt");
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(inputFile, "FROM FILE");
      await fs.writeFile(targetFile, "original\n");

      runBlockInFile(`-i ${inputFile} ${targetFile}`);

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("FROM FILE");
    });
  });
});
