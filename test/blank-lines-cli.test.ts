import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("blank-line emission contracts", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "bif-blanks-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function cli(args: string[], input = "row\n"): Promise<{ code: number; stderr: string }> {
    return new Promise((resolveResult, reject) => {
      const child = spawn("node", ["--import", "tsx", "block-in-file.ts", ...args], {
        cwd: resolve(import.meta.dirname!, ".."),
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolveResult({ code: code ?? -1, stderr }));
      child.stdin.end(input);
    });
  }

  for (const mode of ["keep", "never", "separators"]) {
    it(`${mode}: adopts and updates in place, preserving exterior context`, async () => {
      const file = join(dir, "row.sources");
      await writeFile(file, "Types: deb\nURIs: old\nSuites: stable\n");
      const args = [
        file,
        "--name",
        "row",
        "--source-label",
        "none",
        "--blank-lines",
        mode,
        "--adopt",
        "^URIs:",
        "--mode",
        "ensure",
      ];
      expect((await cli(args, "URIs: new\n")).code).toBe(0);
      const adopted = "Types: deb\n# row start\nURIs: new\n# row end\nSuites: stable\n";
      expect(await readFile(file, "utf8")).toBe(adopted);
      const mtime = (await stat(file)).mtimeMs;
      expect((await cli(args, "URIs: new\n")).code).toBe(0);
      expect((await stat(file)).mtimeMs).toBe(mtime);
      expect((await cli(args, "URIs: later\n")).code).toBe(0);
      expect(await readFile(file, "utf8")).toBe(adopted.replace("URIs: new", "URIs: later"));
    });

    it(`${mode}: anchored insert does not add separator`, async () => {
      const file = join(dir, "anchored");
      await writeFile(file, "first\nanchor\nlast\n");
      expect(
        (await cli([file, "--blank-lines", mode, "--source-label", "none", "--before", "^anchor$"]))
          .code,
      ).toBe(0);
      expect(await readFile(file, "utf8")).toBe(
        "first\n# blockinfile start\nrow\n# blockinfile end\nanchor\nlast\n",
      );
    });

    it(`${mode}: EOF insert follows its separator regime and keeps backup unchanged`, async () => {
      const file = join(dir, "end");
      await writeFile(file, "head\n");
      expect(
        (
          await cli([
            file,
            "--blank-lines",
            mode,
            "--source-label",
            "none",
            "--backup",
            "bak",
            "--mode",
            "ensure",
          ])
        ).code,
      ).toBe(0);
      const content = await readFile(file, "utf8");
      expect(content).toBe(
        `head\n${mode === "separators" ? "\n" : ""}# blockinfile start\nrow\n# blockinfile end\n`,
      );
      expect(
        (await readdir(dir)).some((name) => name.startsWith("end.") && name.includes("bak")),
      ).toBe(true);
      const mtime = (await stat(file)).mtimeMs;
      expect(
        (await cli([file, "--blank-lines", mode, "--source-label", "none", "--mode", "ensure"]))
          .code,
      ).toBe(0);
      expect((await stat(file)).mtimeMs).toBe(mtime);
    });
  }

  it("never and separators drop blank input lines, including on updates", async () => {
    for (const mode of ["never", "separators"]) {
      const file = join(dir, mode);
      await writeFile(file, "head\n# row start\nold\n\n# row end\ntail\n");
      const args = [
        file,
        "--name",
        "row",
        "--blank-lines",
        mode,
        "--source-label",
        "none",
        "--mode",
        "ensure",
      ];
      expect((await cli(args, "first\n\n \nsecond\n")).code).toBe(0);
      expect(await readFile(file, "utf8")).toBe(
        "head\n# row start\nfirst\nsecond\n# row end\ntail\n",
      );
    }
  });

  it("separators collapses excess EOF blanks and never works after unterminated content", async () => {
    const file = join(dir, "end");
    await writeFile(file, "head\n\n\n");
    expect((await cli([file, "--source-label", "none", "--blank-lines", "separators"])).code).toBe(
      0,
    );
    expect(await readFile(file, "utf8")).toBe(
      "head\n\n# blockinfile start\nrow\n# blockinfile end\n",
    );
    const other = join(dir, "unterminated");
    await writeFile(other, "head");
    expect((await cli([other, "--source-label", "none", "--blank-lines", "never"])).code).toBe(0);
    expect(await readFile(other, "utf8")).toBe(
      "head\n# blockinfile start\nrow\n# blockinfile end\n",
    );
  });

  it("separators also separates a fresh --anchor eof placement", async () => {
    const file = join(dir, "anchored-eof");
    await writeFile(file, "head\n");
    expect(
      (
        await cli([
          file,
          "--blank-lines",
          "separators",
          "--source-label",
          "none",
          "--anchor",
          "eof",
        ])
      ).code,
    ).toBe(0);
    expect(await readFile(file, "utf8")).toMatch(
      /^head\n\n# blockinfile start \[anchor-eof:100\]\nrow\n# blockinfile end\n$/,
    );
  });

  it("rejects unknown modes without writing", async () => {
    const file = join(dir, "invalid");
    await writeFile(file, "head\n");
    const result = await cli([file, "--blank-lines", "oops"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("--blank-lines must be keep, never, or separators");
    expect(await readFile(file, "utf8")).toBe("head\n");
  });

  it("explicit --append-newline overrides never and separators after the end marker", async () => {
    for (const mode of ["never", "separators"]) {
      const file = join(dir, mode);
      await writeFile(file, "head\n");
      expect(
        (await cli([file, "--blank-lines", mode, "--source-label", "none", "--append-newline"]))
          .code,
      ).toBe(0);
      expect(await readFile(file, "utf8")).toContain("# blockinfile end\n\n");
    }
  });
});
