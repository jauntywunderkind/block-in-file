import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promisify } from "node:util";
import { exec } from "node:child_process";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const execAsync = promisify(exec);
const CLI = "node block-in-file.ts";

describe("source attribution", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "bif-source-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("adds source attribution with stdin input", async () => {
    const target = join(testDir, "target.txt");
    await writeFile(target, "");
    await execAsync(`echo 'hello world' | ${CLI} -i - ${target}`);
    const content = await readFile(target, "utf-8");
    expect(content).toContain("# source: <STDIN>");
    expect(content).toContain("hello world");
  });

  it("adds source attribution with file input", async () => {
    const target = join(testDir, "target.txt");
    const input = join(testDir, "input.txt");
    await writeFile(target, "");
    await writeFile(input, "my content");
    await execAsync(`${CLI} -i ${input} ${target}`);
    const content = await readFile(target, "utf-8");
    expect(content).toContain(`# source: ${input}`);
    expect(content).toContain("my content");
  });

  it("places source line directly after opener", async () => {
    const target = join(testDir, "target.txt");
    await writeFile(target, "");
    await execAsync(`echo 'content' | ${CLI} -i - ${target}`);
    const lines = (await readFile(target, "utf-8")).split("\n");
    const openerIdx = lines.findIndex((l) => l.includes("blockinfile start"));
    expect(openerIdx).toBeGreaterThanOrEqual(0);
    expect(lines[openerIdx + 1]).toBe("# source: <STDIN>");
    expect(lines[openerIdx + 2]).toBe("content");
  });

  it("disables attribution with --source-attribution=false", async () => {
    const target = join(testDir, "target.txt");
    await writeFile(target, "");
    await execAsync(`echo 'content' | ${CLI} -i - --source-attribution=false ${target}`);
    const content = await readFile(target, "utf-8");
    expect(content).not.toContain("source:");
  });

  it("updates source line on subsequent runs", async () => {
    const target = join(testDir, "target.txt");
    const input = join(testDir, "input.txt");
    await writeFile(target, "");
    await writeFile(input, "content");

    await execAsync(`echo 'content' | ${CLI} -i - ${target}`);
    let content = await readFile(target, "utf-8");
    expect(content).toContain("# source: <STDIN>");

    await execAsync(`${CLI} -i ${input} ${target}`);
    content = await readFile(target, "utf-8");
    expect(content).toContain(`# source: ${input}`);
    expect(content).not.toContain("# source: <STDIN>");
  });

  it("is idempotent — ensure mode skips when content and source unchanged", async () => {
    const target = join(testDir, "target.txt");
    await writeFile(target, "");
    await execAsync(`echo 'content' | ${CLI} -i - --mode ensure ${target}`);
    const first = await readFile(target, "utf-8");

    await execAsync(`echo 'content' | ${CLI} -i - --mode ensure ${target}`);
    const second = await readFile(target, "utf-8");
    expect(first).toBe(second);
  });

  it("uses custom comment prefix in source line", async () => {
    const target = join(testDir, "target.txt");
    await writeFile(target, "");
    await execAsync(`echo 'content' | ${CLI} -i - --comment '//' ${target}`);
    const content = await readFile(target, "utf-8");
    expect(content).toContain("// source: <STDIN>");
  });
});
