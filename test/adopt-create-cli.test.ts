import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("CLI adoption and update-only creation", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "bif-adopt-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function cli(
    args: string[],
    input = "",
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolveResult, reject) => {
      const child = spawn("node", ["--import", "tsx", "block-in-file.ts", ...args], {
        cwd: resolve(import.meta.dirname!, ".."),
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolveResult({ code: code ?? -1, stdout, stderr }));
      child.stdin.end(input);
    });
  }

  it("adopts first matching line in place with custom markers, reads it, and ensures a no-op rerun", async () => {
    const file = join(dir, "source.list");
    await writeFile(
      file,
      "first\ndeb http://old stable main\nafter\ndeb http://second stable main\n",
    );
    const args = [
      file,
      "--name",
      "apt-uri",
      "--comment",
      "//",
      "--marker-start",
      "begin",
      "--marker-end",
      "finish",
      "--adopt",
      "^deb ",
      "--mode",
      "ensure",
    ];
    const input = "deb https://new stable main\n";
    expect((await cli(args, input)).code).toBe(0);
    const adopted = await readFile(file, "utf8");
    expect(adopted).toBe(
      "first\n// apt-uri begin\n// source: <STDIN>\ndeb https://new stable main\n// apt-uri finish\nafter\ndeb http://second stable main\n",
    );
    const mtime = (await stat(file)).mtimeMs;
    expect((await cli(args, input)).code).toBe(0);
    expect(await readFile(file, "utf8")).toBe(adopted);
    expect((await stat(file)).mtimeMs).toBe(mtime);
    const read = await cli([
      file,
      "--name",
      "apt-uri",
      "--comment",
      "//",
      "--marker-start",
      "begin",
      "--marker-end",
      "finish",
      "--read",
    ]);
    expect(read.code).toBe(0);
    expect(read.stdout).toBe(input.trimEnd());
    expect((await cli(args, "deb https://later stable main\n")).code).toBe(0);
    expect(await readFile(file, "utf8")).toContain("deb https://later stable main");
  });

  it("fails without writing if adoption regex does not match", async () => {
    const file = join(dir, "source.list");
    await writeFile(file, "first\nlast\n");
    const result = await cli([file, "--adopt", "^deb ", "--name", "apt-uri"], "deb new\n");
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("^deb ");
    expect(await readFile(file, "utf8")).toBe("first\nlast\n");
  });

  it("sets an opaque provenance label on insert and replaces it in ensure mode on update", async () => {
    const file = join(dir, "source.list");
    await writeFile(file, "old\n");
    const args = [file, "--name", "row", "--mode", "ensure"];
    expect((await cli(args, "row\n")).code).toBe(0);
    expect(await readFile(file, "utf8")).toContain("# source: <STDIN>");
    const labelled = [...args, "--source-label", "/etc/apt/*.sources: scheme policy"];
    expect((await cli(labelled, "row\n")).code).toBe(0);
    const content = await readFile(file, "utf8");
    expect(content).toContain("# source: /etc/apt/*.sources: scheme policy");
    expect(content).not.toContain("# source: <STDIN>");
    expect(content.match(/# source:/g)).toHaveLength(1);
    const read = await cli([file, "--name", "row", "--read", "--source-label", "ignored"]);
    expect(read.stdout).toBe("row");
    const mtime = (await stat(file)).mtimeMs;
    expect((await cli(labelled, "row\n")).code).toBe(0);
    expect((await stat(file)).mtimeMs).toBe(mtime);
  });

  it("suppresses provenance with exact none/false on insert and on update, including tagged markers", async () => {
    for (const label of ["none", "false"]) {
      const file = join(dir, label);
      await writeFile(file, "head\n");
      const args = [file, "--name", "row", "--source-label", label, "--mode", "ensure"];
      expect((await cli(args, "value\n")).code).toBe(0);
      expect(await readFile(file, "utf8")).toBe("head\n# row start\nvalue\n# row end\n");
      expect((await cli([file, "--name", "row", "--tag-mode", "merge"], "value\n")).code).toBe(0);
      expect(await readFile(file, "utf8")).toContain("# source: <STDIN>");
      expect((await cli(args, "value\n")).code).toBe(0);
      expect(await readFile(file, "utf8")).toBe("head\n# row start\nvalue\n# row end\n");
      expect((await cli([file, "--name", "row", "--read", "--source-label", label])).stdout).toBe("value");
    }
    const file = join(dir, "capitalized");
    await writeFile(file, "");
    expect((await cli([file, "--source-label", "None"], "value\n")).code).toBe(0);
    expect(await readFile(file, "utf8")).toContain("# source: None");
  });

  it("gates missing blocks and files with --create false, including mode only", async () => {
    const file = join(dir, "source.list");
    await writeFile(file, "existing\n");
    for (const mode of ["ensure", "only"]) {
      const result = await cli(
        [file, "--name", "missing", "--create", "false", "--mode", mode],
        "new\n",
      );
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("missing");
      expect(await readFile(file, "utf8")).toBe("existing\n");
    }
    const missing = join(dir, "absent");
    const result = await cli([missing, "--create", "false"], "new\n");
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("target file does not exist");
    await expect(stat(missing)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps file, block and true creation modes working and updates an existing block with false", async () => {
    const existing = join(dir, "existing");
    await writeFile(existing, "head\n");
    expect((await cli([existing, "--name", "one", "--create", "block"], "one\n")).code).toBe(0);
    expect((await cli([existing, "--name", "one", "--create", "false"], "two\n")).code).toBe(0);
    expect(await readFile(existing, "utf8")).toContain("two");
    for (const mode of ["file", "true"]) {
      const target = join(dir, mode);
      expect((await cli([target, "--create", mode], "new\n")).code).toBe(0);
      expect(await readFile(target, "utf8")).toContain("new");
    }
  });
});
