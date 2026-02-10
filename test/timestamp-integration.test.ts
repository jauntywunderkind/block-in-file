import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("timestamp CLI integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "blockinfile-timestamp-"));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const runBlockInFile = (args: string[], input?: string): string => {
    const cmd = `node block-in-file.ts ${args.join(" ")}`;
    return execSync(cmd, { encoding: "utf-8", cwd: "/home/rektide/src/block-in-file", input });
  };

  it("should add timestamp tag to start marker with epoch-nano", () => {
    const filePath = join(tempDir, "test.txt");
    const args = ["--input", "-", "--name", "testblock", "--timestamp", "epoch-nano", filePath];
    runBlockInFile(args, "test content\n");

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    expect(lines[0]).toMatch(/^# testblock start \[timestamp:\d+\]$/);
    expect(lines[1]).toBe("test content");
    expect(lines[2]).toBe("# testblock end");
  });

  it("should add timestamp tag to start marker with epoch-sec", () => {
    const filePath = join(tempDir, "test.txt");
    const args = ["--input", "-", "--name", "testblock", "--timestamp", "epoch-sec", filePath];
    runBlockInFile(args, "test content\n");

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    expect(lines[0]).toMatch(/^# testblock start \[timestamp:\d+\]$/);
    expect(lines[1]).toBe("test content");
    expect(lines[2]).toBe("# testblock end");
  });

  it("should add timestamp tag to start marker with iso8601", () => {
    const filePath = join(tempDir, "test.txt");
    const args = ["--input", "-", "--name", "testblock", "--timestamp", "iso8601", filePath];
    runBlockInFile(args, "test content\n");

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    expect(lines[0]).toMatch(
      /^# testblock start \[timestamp:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\]$/,
    );
    expect(lines[1]).toBe("test content");
    expect(lines[2]).toBe("# testblock end");
  });

  it("should update timestamp on block replacement", async () => {
    const filePath = join(tempDir, "test.txt");
    const args = ["--input", "-", "--name", "testblock", "--timestamp", "epoch-sec", filePath];
    runBlockInFile(args, "original content\n");

    const firstContent = readFileSync(filePath, "utf-8");
    const firstTimestamp = firstContent.match(/\[timestamp:(\d+)\]/)?.[1];

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const args2 = ["--input", "-", "--name", "testblock", "--timestamp", "epoch-sec", filePath];
    runBlockInFile(args2, "updated content\n");

    const secondContent = readFileSync(filePath, "utf-8");
    const secondTimestamp = secondContent.match(/\[timestamp:(\d+)\]/)?.[1];

    expect(firstTimestamp).toBeDefined();
    expect(secondTimestamp).toBeDefined();
    expect(secondTimestamp).not.toBe(firstTimestamp);
    expect(secondContent).toContain("updated content");
  });

  it("should not add timestamp to end marker", () => {
    const filePath = join(tempDir, "test.txt");
    const args = ["--input", "-", "--name", "testblock", "--timestamp", "epoch-nano", filePath];
    runBlockInFile(args, "test content\n");

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    expect(lines[0]).toMatch(/\[timestamp:\d+\]/);
    expect(lines[2]).toBe("# testblock end");
    expect(lines[2]).not.toMatch(/\[timestamp:/);
  });

  it("should preserve existing tags when merging", () => {
    const filePath = join(tempDir, "test.txt");
    writeFileSync(filePath, "# testblock start [anchor-bof:100]\nold content\n# testblock end\n");

    const args = ["--input", "-", "--name", "testblock", "--timestamp", "epoch-sec", filePath];
    runBlockInFile(args, "new content\n");

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("[anchor-bof:100]");
    expect(content).toContain("[timestamp:");
    expect(content).toContain("new content");
  });

  it("should use tag-mode replace to remove existing tags", () => {
    const filePath = join(tempDir, "test.txt");
    writeFileSync(
      filePath,
      "# testblock start [anchor-bof:100] [oldtag:value]\nold content\n# testblock end\n",
    );

    const args = [
      "--input",
      "-",
      "--name",
      "testblock",
      "--timestamp",
      "epoch-sec",
      "--tag-mode",
      "replace",
      filePath,
    ];
    runBlockInFile(args, "new content\n");

    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain("[anchor-bof:100]");
    expect(content).not.toContain("[oldtag:value]");
    expect(content).toContain("[timestamp:");
    expect(content).toContain("new content");
  });

  it("should work with custom comment character", () => {
    const filePath = join(tempDir, "test.txt");
    const args = [
      "--input",
      "-",
      "--name",
      "testblock",
      "--timestamp",
      "epoch-nano",
      "--comment",
      "//",
      filePath,
    ];
    runBlockInFile(args, "test content\n");

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    expect(lines[0]).toMatch(/^\/\/ testblock start \[timestamp:\d+\]$/);
    expect(lines[2]).toBe("// testblock end");
  });

  it("should work with custom markers", () => {
    const filePath = join(tempDir, "test.txt");
    const args = [
      "--input",
      "-",
      "--name",
      "testblock",
      "--timestamp",
      "epoch-sec",
      "--marker-start",
      "BEGIN",
      "--marker-end",
      "END",
      filePath,
    ];
    runBlockInFile(args, "test content\n");

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    expect(lines[0]).toMatch(/^# testblock BEGIN \[timestamp:\d+\]$/);
    expect(lines[2]).toBe("# testblock END");
  });

  it("should add timestamp with append-newline", () => {
    const filePath = join(tempDir, "test.txt");
    const args = [
      "--input",
      "-",
      "--name",
      "testblock",
      "--timestamp",
      "epoch-nano",
      "--append-newline",
      filePath,
    ];
    runBlockInFile(args, "test content\n");

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    expect(lines[0]).toMatch(/\[timestamp:\d+\]/);
    expect(lines[1]).toBe("test content");
    expect(lines[2]).toBe("# testblock end");
    expect(lines[3]).toBe("");
  });
});
