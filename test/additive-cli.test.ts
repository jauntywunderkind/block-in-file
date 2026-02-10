import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

describe("CLI additive mode", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blockinfile-cli-additive-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function runCli(args: string, input?: string): string {
    const cwd = path.resolve(import.meta.dirname!, "..");
    const cmd = `npx tsx block-in-file.ts ${args}`;
    return execSync(cmd, {
      cwd,
      input,
      encoding: "utf-8",
    });
  }

  it("adds missing lines with --additive", async () => {
    const targetFile = path.join(tempDir, "target.txt");
    await fs.writeFile(targetFile, "header\n# blockinfile start\nline1\n# blockinfile end\nfooter");

    runCli(`--additive -i - ${targetFile}`, "line1\nline2\nline3");

    const result = await fs.readFile(targetFile, "utf-8");
    expect(result).toContain("line1");
    expect(result).toContain("line2");
    expect(result).toContain("line3");
    const lines = result.split("\n");
    const blockStartIndex = lines.indexOf("# blockinfile start");
    const blockEndIndex = lines.indexOf("# blockinfile end");
    const blockContent = lines.slice(blockStartIndex + 1, blockEndIndex);
    expect(blockContent).toEqual(["line1", "line2", "line3"]);
  });

  it("adds missing lines before existing content with --additive-before BOF", async () => {
    const targetFile = path.join(tempDir, "target.txt");
    await fs.writeFile(targetFile, "header\n# blockinfile start\nline2\n# blockinfile end\nfooter");

    runCli(`--additive --additive-before BOF -i - ${targetFile}`, "line1\nline2\nline3");

    const result = await fs.readFile(targetFile, "utf-8");
    const lines = result.split("\n");
    const blockStartIndex = lines.indexOf("# blockinfile start");
    const blockEndIndex = lines.indexOf("# blockinfile end");
    const blockContent = lines.slice(blockStartIndex + 1, blockEndIndex);
    expect(blockContent).toEqual(["line1", "line3", "line2"]);
  });

  it("adds missing lines after matching line with --additive-after regex", async () => {
    const targetFile = path.join(tempDir, "target.txt");
    await fs.writeFile(
      targetFile,
      "header\n# blockinfile start\nline1\nmarker\nline3\n# blockinfile end\nfooter",
    );

    runCli(`--additive --additive-after '^marker$' -i - ${targetFile}`, "line1\nline2\nline3");

    const result = await fs.readFile(targetFile, "utf-8");
    const lines = result.split("\n");
    const blockStartIndex = lines.indexOf("# blockinfile start");
    const blockEndIndex = lines.indexOf("# blockinfile end");
    const blockContent = lines.slice(blockStartIndex + 1, blockEndIndex);
    expect(blockContent).toEqual(["line1", "marker", "line2", "line3"]);
  });

  it("errors when both --additive-before and --additive-after are specified", async () => {
    const targetFile = path.join(tempDir, "target.txt");
    await fs.writeFile(targetFile, "header\nfooter");

    expect(() =>
      runCli(`--additive --additive-before BOF --additive-after EOF -i - ${targetFile}`, "line1"),
    ).toThrow("Cannot specify both --additive-before and --additive-after");
  });

  it("outputs to stdout with --additive", async () => {
    const targetFile = path.join(tempDir, "target.txt");
    await fs.writeFile(targetFile, "header\n# blockinfile start\nline1\n# blockinfile end\nfooter");

    const output = runCli(`--additive -i - ${targetFile} -o -`, "line1\nline2\nline3");

    expect(output).toContain("line1");
    expect(output).toContain("line2");
    expect(output).toContain("line3");
  });

  it("works with empty block", async () => {
    const targetFile = path.join(tempDir, "target.txt");
    await fs.writeFile(targetFile, "header\n# blockinfile start\n# blockinfile end\nfooter");

    runCli(`--additive -i - ${targetFile}`, "line1\nline2\nline3");

    const result = await fs.readFile(targetFile, "utf-8");
    const lines = result.split("\n");
    const blockStartIndex = lines.indexOf("# blockinfile start");
    const blockEndIndex = lines.indexOf("# blockinfile end");
    const blockContent = lines.slice(blockStartIndex + 1, blockEndIndex);
    expect(blockContent).toEqual(["line1", "line2", "line3"]);
  });
});
