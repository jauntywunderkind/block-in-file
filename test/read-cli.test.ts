import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

describe("CLI read mode", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blockinfile-read-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function runCli(args: string[]) {
    const cwd = path.resolve(import.meta.dirname!, "..");
    return spawnSync("npx", ["tsx", "block-in-file.ts", ...args], {
      cwd,
      encoding: "utf-8",
    });
  }

  async function writeFixture(name: string, content: string): Promise<string> {
    const file = path.join(tempDir, name);
    await fs.writeFile(file, content, "utf-8");
    return file;
  }

  it("prints block body without banner or Done!", async () => {
    const file = await writeFixture(
      "f.txt",
      "pre\n# myblock start\nalpha\nbeta\n# myblock end\npost\n",
    );
    const result = runCli(["--read", "-n", "myblock", file]);
    expect(result.status).toBe(0);
    // byte-exact: exactly the lines between the markers, nothing else
    expect(result.stdout).toBe("alpha\nbeta");
    expect(result.stdout).not.toContain("block-in-file (");
    expect(result.stdout).not.toContain("Done!");
  });

  it("round-trips: read output is byte-identical to the written input", async () => {
    const source = path.join(tempDir, "source.txt");
    const payload = "line one\nline two\n\nlast line\n";
    await fs.writeFile(source, payload, "utf-8");
    const target = await writeFixture("target.txt", "existing\n");
    const write = runCli(["-n", "myblock", "-i", source, "-o", target, "--mode", "ensure"]);
    expect(write.status).toBe(0);
    const read = runCli(["--read", "-n", "myblock", target]);
    expect(read.status).toBe(0);
    expect(read.stdout).toBe(payload);
  });

  it("exits 1 with a stderr note when no block is found", async () => {
    const file = await writeFixture("f.txt", "no markers here\n");
    const result = runCli(["--read", "-n", "myblock", file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no block 'myblock' found");
  });

  it("exits 1 when the file cannot be read", async () => {
    const result = runCli(["--read", "-n", "myblock", path.join(tempDir, "missing.txt")]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cannot read");
  });

  it("reads across multiple files, failing when any lacks the block", async () => {
    const withBlock = await writeFixture("a.txt", "# myblock start\nalpha\n# myblock end\n");
    const withoutBlock = await writeFixture("b.txt", "nothing\n");
    const result = runCli(["--read", "-n", "myblock", withBlock, withoutBlock]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("alpha");
    expect(result.stderr).toContain("b.txt");
  });

  it("requires a file argument", async () => {
    const result = runCli(["--read", "-n", "myblock"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Need file argument for read mode");
  });

  it("does not consume stdin or require -i", async () => {
    const file = await writeFixture("f.txt", "# myblock start\nalpha\n# myblock end\n");
    const result = runCli(["--read", "-n", "myblock", file]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("alpha");
  });

  it("honors a custom comment character", async () => {
    const file = await writeFixture("f.txt", "// myblock start\nalpha\n// myblock end\n");
    const result = runCli(["--read", "-c", "//", "-n", "myblock", file]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("alpha");
  });
});
