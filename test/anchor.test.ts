import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runCli(args: string, input?: string): string {
  const cmd = `npx tsx block-in-file.ts ${args}`;
  return execSync(cmd, { input, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

describe("anchor", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "anchor-test-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("places bof anchor block at beginning of file", () => {
    const file = join(tempDir, "bof-test.txt");
    writeFileSync(file, "hello\nworld\n");

    runCli(`--anchor bof --name header ${file}`, "header content");

    const result = readFileSync(file, "utf-8");
    expect(result).toContain("# header start [anchor-bof:100]");
    expect(result.indexOf("# header start")).toBeLessThan(result.indexOf("hello"));
  });

  it("places eof anchor block at end of file", () => {
    const file = join(tempDir, "eof-test.txt");
    writeFileSync(file, "hello\nworld\n");

    runCli(`--anchor eof --name footer ${file}`, "footer content");

    const result = readFileSync(file, "utf-8");
    expect(result).toContain("# footer start [anchor-eof:100]");
    expect(result.indexOf("world")).toBeLessThan(result.indexOf("# footer start"));
  });

  it("respects priority ordering for bof anchors", () => {
    const file = join(tempDir, "priority-test.txt");
    writeFileSync(file, "content\n");

    runCli(`--anchor bof:50 --name mid ${file}`, "mid priority");

    const result1 = readFileSync(file, "utf-8");
    expect(result1).toContain("# mid start [anchor-bof:50]");

    runCli(`--anchor bof:100 --name high ${file}`, "high priority");

    const result2 = readFileSync(file, "utf-8");
    const highIndex = result2.indexOf("# high start");
    const midIndex = result2.indexOf("# mid start");
    expect(highIndex).toBeLessThan(midIndex);
  });

  it("respects priority ordering for eof anchors", () => {
    const file = join(tempDir, "eof-priority-test.txt");
    writeFileSync(file, "content\n");

    runCli(`--anchor eof:50 --name mid ${file}`, "mid priority");

    const result1 = readFileSync(file, "utf-8");
    expect(result1).toContain("# mid start [anchor-eof:50]");

    runCli(`--anchor eof:100 --name high ${file}`, "high priority");

    const result2 = readFileSync(file, "utf-8");
    const highIndex = result2.indexOf("# high start");
    const midIndex = result2.indexOf("# mid start");
    expect(highIndex).toBeGreaterThan(midIndex);
  });

  it("uses default priority of 100 when not specified", () => {
    const file = join(tempDir, "default-priority.txt");
    writeFileSync(file, "content\n");

    runCli(`--anchor bof ${file}`, "test");

    const result = readFileSync(file, "utf-8");
    expect(result).toContain("[anchor-bof:100]");
  });

  it("allows custom priority value", () => {
    const file = join(tempDir, "custom-priority.txt");
    writeFileSync(file, "content\n");

    runCli(`--anchor eof:200 ${file}`, "test");

    const result = readFileSync(file, "utf-8");
    expect(result).toContain("[anchor-eof:200]");
  });
});
