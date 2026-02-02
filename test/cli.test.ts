import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync, spawn } from "node:child_process";

describe("CLI", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blockinfile-cli-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function runCli(args: string, input?: string): string {
    const cwd = path.resolve(import.meta.dirname!, "../..");
    const cmd = `npx tsx block-in-file.ts ${args}`;
    return execSync(cmd, {
      cwd,
      input,
      encoding: "utf-8",
    });
  }

  async function runCliWithStderr(args: string, input?: string): Promise<string> {
    const cwd = path.resolve(import.meta.dirname!, "../..");
    const [command, ...argsArray] = `npx tsx block-in-file.ts ${args}`.split(" ");
    const child = spawn(command, argsArray, {
      cwd,
      shell: true,
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        stdout.push(data.toString());
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (data) => {
        stderr.push(data.toString());
      });
    }

    if (input) {
      child.stdin?.write(input);
      child.stdin?.end();
    }

    return new Promise((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0) {
          resolve([...stdout, ...stderr].join(""));
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
      child.on("error", reject);
    });
  }

  describe("help and version", () => {
    it("shows help with --help", () => {
      const output = runCli("--help");
      expect(output).toContain("block-in-file");
      expect(output).toContain("Name for block");
    });

    it("shows version with --version", () => {
      const output = runCli("--version");
      expect(output).toContain("1.0.0");
    });
  });

  describe("basic file operations", () => {
    it("inserts block from stdin", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      runCli(`-i - ${targetFile}`, "INSERTED");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("# blockinfile start");
      expect(result).toContain("INSERTED");
    });

    it("replaces existing block", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\n# blockinfile start\nOLD\n# blockinfile end\nline2\n");

      runCli(`-i - ${targetFile}`, "NEW");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).not.toContain("OLD");
      expect(result).toContain("NEW");
    });

    it("creates named block", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const originalContent = "line1\nline2\n";
      await fs.writeFile(targetFile, originalContent);

      const output = runCli(`-n myblock -i - ${targetFile} -o -`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toBe(originalContent);
      expect(output).toContain("# myblock start");
      expect(output).toContain("CONTENT");
    });

    it("outputs to stdout", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const originalContent = "line1\nline2\n";
      await fs.writeFile(targetFile, originalContent);

      const output = runCli(`${targetFile} -o -`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toBe(originalContent);
      expect(output).toContain("# blockinfile start");
      expect(output).toContain("CONTENT");
    });

    it("creates file with create option", async () => {
      const targetFile = path.join(tempDir, "newfile.txt");

      runCli(`--create file -i - ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("# blockinfile start");
      expect(result).toContain("CONTENT");
    });

    it("inserts before matching line", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\nline3\n");

      runCli(`--before '^line2' -i - ${targetFile}`, "INSERTED");

      const result = await fs.readFile(targetFile, "utf-8");
      const lines = result.split("\n");
      expect(lines).toContain("INSERTED");
    });

    it("inserts after matching line", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\nline3\n");

      runCli(`--after '^line2' -i - ${targetFile}`, "INSERTED");

      const result = await fs.readFile(targetFile, "utf-8");
      const lines = result.split("\n");
      expect(lines).toContain("INSERTED");
    });

    it("shows diff with --diff", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      const output = await runCliWithStderr(`${targetFile} --diff -`, "NEW BLOCK");

      expect(output).toContain("---");
      expect(output).toContain("+++");
      expect(output).toContain("+");
    });

    it("uses dos line endings with --dos", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      runCli(`-i - ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).not.toContain("\r\n");
    });

    it("uses dos line endings with --dos", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      runCli(`--dos -i - ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("\r\n");
    });
  });

  describe("custom markers", () => {
    it("uses custom comment string", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      runCli(`-c '//' -i - ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("// blockinfile start");
      expect(result).toContain("CONTENT");
    });

    it("uses custom marker start", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      runCli(`--marker-start BEGIN -i - ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("# blockinfile BEGIN");
      expect(result).toContain("CONTENT");
    });

    it("uses custom marker end", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      runCli(`--marker-end FINISH -i - ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("# blockinfile FINISH");
      expect(result).toContain("CONTENT");
    });
  });

  describe("multiple files", () => {
    it("processes multiple files", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");
      await fs.writeFile(file1, "line1\n");
      await fs.writeFile(file2, "line2\n");

      runCli(`${file1} ${file2} -i -`);

      const result1 = await fs.readFile(file1, "utf-8");
      const result2 = await fs.readFile(file2, "utf-8");
      expect(result1).toContain("# blockinfile start");
      expect(result2).toContain("# blockinfile start");
    });
  });

  describe("debug mode", () => {
    it("outputs debug information with --debug", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "line1\nline2\n");

      const output = runCli(`--debug -i - ${targetFile}`, "CONTENT");

      expect(output).toContain("[DEBUG]");
    });
  });
});
