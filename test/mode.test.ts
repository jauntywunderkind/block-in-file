import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

describe("Mode functionality", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blockinfile-mode-test-"));
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

  describe("mode=ensure (idempotent)", () => {
    it("should create block when missing", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const input = "new block content";

      const _result = runBlockInFile(`--mode ensure ${targetFile}`, input);
      const content = await fs.readFile(targetFile, "utf-8");

      expect(content).toContain(input);
      expect(content).toContain("# blockinfile start");
      expect(content).toContain("# blockinfile end");
    });

    it("should update block when content differs", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const initialContent = "initial content";
      const updatedContent = "updated content";

      await fs.writeFile(targetFile, `# blockinfile start\n${initialContent}\n# blockinfile end\n`);

      const _result1 = runBlockInFile(`--mode ensure ${targetFile}`, updatedContent);
      const content1 = await fs.readFile(targetFile, "utf-8");
      expect(content1).toContain(updatedContent);
      expect(content1).not.toContain(initialContent);

      const _result2 = runBlockInFile(`--mode ensure ${targetFile}`, updatedContent);
      const content2 = await fs.readFile(targetFile, "utf-8");

      expect(content2).toContain(updatedContent);
    });

    it("should skip when content unchanged (idempotent)", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const input = "test content";

      await fs.writeFile(targetFile, `# blockinfile start\n${input}\n# blockinfile end\n`);

      const _result = runBlockInFile(`--mode ensure --debug ${targetFile}`, input);
      const content = await fs.readFile(targetFile, "utf-8");

      expect(content).toContain(input);
      expect(_result).toContain("no changes needed");
    });
  });

  describe("mode=only (create if missing)", () => {
    it("should create block when missing", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const input = "new block content";

      const _result = runBlockInFile(`--mode only ${targetFile}`, input);
      const content = await fs.readFile(targetFile, "utf-8");

      expect(content).toContain(input);
      expect(content).toContain("# blockinfile start");
      expect(content).toContain("# blockinfile end");
    });

    it("should skip when block already exists", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const initialContent = "initial content";
      const differentContent = "different content";

      await fs.writeFile(targetFile, `# blockinfile start\n${initialContent}\n# blockinfile end\n`);

      const _result = runBlockInFile(`--mode only --debug ${targetFile}`, differentContent);
      const content = await fs.readFile(targetFile, "utf-8");

      expect(content).toContain(initialContent);
      expect(content).not.toContain(differentContent);
      expect(_result).toContain("block already exists");
    });

    it("should skip even if block content differs", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const initialContent = "version 1";
      const newContent = "version 2";

      await fs.writeFile(targetFile, `# blockinfile start\n${initialContent}\n# blockinfile end\n`);

      const _result = runBlockInFile(`--mode only --debug ${targetFile}`, newContent);
      const content = await fs.readFile(targetFile, "utf-8");

      expect(content).toContain(initialContent);
      expect(content).not.toContain(newContent);
      expect(_result).toContain("block already exists");
    });

    it("should create when file exists but block missing", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const input = "block content";

      await fs.writeFile(targetFile, "some existing content\n");

      runBlockInFile(`--mode only ${targetFile}`, input);
      const content = await fs.readFile(targetFile, "utf-8");

      expect(content).toContain(input);
      expect(content).toContain("some existing content");
    });
  });

  describe("mode=none (legacy behavior)", () => {
    it("should always attempt to insert/update block", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const content1 = "first content";
      const content2 = "second content";

      await fs.writeFile(targetFile, `# blockinfile start\n${content1}\n# blockinfile end\n`);

      runBlockInFile(`--mode none ${targetFile}`, content2);
      const fileContent = await fs.readFile(targetFile, "utf-8");

      expect(fileContent).toContain(content2);
    });

    it("should be the default mode", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const input = "default behavior test";

      runBlockInFile(`${targetFile}`, input);
      const content = await fs.readFile(targetFile, "utf-8");

      expect(content).toContain(input);
    });
  });

  describe("mode with multiple files", () => {
    it("should process all files correctly in ensure mode", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");
      const file3 = path.join(tempDir, "file3.txt");
      const input = "shared content";

      await fs.writeFile(file1, `# blockinfile start\n${input}\n# blockinfile end\n`);

      runBlockInFile(`--mode ensure ${file1} ${file2} ${file3}`, input);

      const content1 = await fs.readFile(file1, "utf-8");
      const content2 = await fs.readFile(file2, "utf-8");
      const content3 = await fs.readFile(file3, "utf-8");

      expect(content1).toContain(input);
      expect(content2).toContain(input);
      expect(content3).toContain(input);
    });

    it("should skip existing blocks in only mode across multiple files", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");
      const input1 = "original content";
      const input2 = "new content";

      await fs.writeFile(file1, `# blockinfile start\n${input1}\n# blockinfile end\n`);

      runBlockInFile(`--debug --mode only ${file1} ${file2}`, input2);

      const content1 = await fs.readFile(file1, "utf-8");
      const content2 = await fs.readFile(file2, "utf-8");

      expect(content1).toContain(input1);
      expect(content1).not.toContain(input2);
      expect(content2).toContain(input2);
    });
  });
});
