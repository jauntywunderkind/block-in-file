import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

describe("CLI comment-out / uncomment", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blockinfile-comment-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function runCli(args: string[]) {
    const cwd = path.resolve(import.meta.dirname!, "..");
    return spawnSync("npx", ["tsx", "block-in-file.ts", ...args], {
      cwd,
      encoding: "utf-8",
      input: "",
    });
  }

  async function writeFixture(name: string, content: string): Promise<string> {
    const file = path.join(tempDir, name);
    await fs.writeFile(file, content, "utf-8");
    return file;
  }

  async function read(file: string): Promise<string> {
    return fs.readFile(file, "utf-8");
  }

  it("comments the named block in place, tagging the opener", async () => {
    const original = "pre\n# deploy start\ndeb one\ndeb two\n# deploy end\npost\n";
    const file = await writeFixture("f.txt", original);
    const result = runCli(["-n", "deploy", "--comment-out", file]);
    expect(result.status).toBe(0);
    expect(await read(file)).toBe(
      "pre\n# deploy start [commented]\n# deb one\n# deb two\n# deploy end\npost\n",
    );
  });

  it("does not read stdin or require -i", async () => {
    const file = await writeFixture("f.txt", "# deploy start\ndeb one\n# deploy end\n");
    const result = runCli(["-n", "deploy", "--comment-out", file]);
    expect(result.status).toBe(0);
    expect(await read(file)).toContain("# deb one");
  });

  it("uncomment restores the original byte-for-byte", async () => {
    const original = "pre\n# deploy start\n# source: x\ndeb one\n# note\n\n# deploy end\npost\n";
    const file = await writeFixture("f.txt", original);
    runCli(["-n", "deploy", "--comment-out", file]);
    const result = runCli(["-n", "deploy", "--uncomment", file]);
    expect(result.status).toBe(0);
    expect(await read(file)).toBe(original);
  });

  it("is idempotent: a second --comment-out changes nothing and exits 0", async () => {
    const file = await writeFixture("f.txt", "# deploy start\ndeb one\n# deploy end\n");
    runCli(["-n", "deploy", "--comment-out", file]);
    const once = await read(file);
    const result = runCli(["-n", "deploy", "--comment-out", file]);
    expect(result.status).toBe(0);
    expect(await read(file)).toBe(once);
  });

  it("exits 1 when no block with the name exists", async () => {
    const file = await writeFixture("f.txt", "nothing here\n");
    const result = runCli(["-n", "missing", "--comment-out", file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no block");
  });

  it("rejects combining --comment-out and --uncomment", async () => {
    const file = await writeFixture("f.txt", "# a start\nx\n# a end\n");
    const result = runCli(["-n", "a", "--comment-out", "--uncomment", file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cannot combine");
  });

  it("rejects combining flips with --commented", async () => {
    const file = await writeFixture("f.txt", "# a start\nx\n# a end\n");
    const result = runCli(["-n", "a", "--comment-out", "--commented", file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--commented");
  });

  it("requires a file argument", async () => {
    const result = runCli(["-n", "a", "--comment-out"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Need file argument");
  });

  it("surfaces the existing duplicate-block conflict rather than flipping", async () => {
    const file = await writeFixture(
      "f.txt",
      "# dep start\none\n# dep end\nmid\n# dep start\ntwo\n# dep end\n",
    );
    const result = runCli(["-n", "dep", "--comment-out", file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("conflict");
  });

  it("honors a custom comment character", async () => {
    const file = await writeFixture("f.txt", "// dep start\none\n// dep end\n");
    const result = runCli(["-c", "//", "-n", "dep", "--comment-out", file]);
    expect(result.status).toBe(0);
    expect(await read(file)).toBe("// dep start [commented]\n// one\n// dep end\n");
  });

  describe("emission persistence on the update path", () => {
    it("keeps a commented block commented across ensure re-runs", async () => {
      const src = await writeFixture("src.txt", "deploy=true\n");
      const file = await writeFixture("f.txt", "pre\n");
      const insert = ["-n", "deploy", "-i", src, "--source-label", "none", "--mode", "ensure"];
      runCli([...insert, file]);
      runCli(["-n", "deploy", "--comment-out", file]);
      const commented = await read(file);

      const result = runCli([...insert, file]);
      expect(result.status).toBe(0);
      expect(await read(file)).toBe(commented);
    });

    it("writes new input commented when updating a commented block", async () => {
      const src = await writeFixture("src.txt", "deploy=true\n");
      const file = await writeFixture("f.txt", "pre\n");
      runCli(["-n", "deploy", "-i", src, "--source-label", "none", file]);
      runCli(["-n", "deploy", "--comment-out", file]);

      const src2 = await writeFixture("src2.txt", "deploy=false\n");
      runCli(["-n", "deploy", "-i", src2, "--source-label", "none", file]);
      const content = await read(file);
      expect(content).toContain("# deploy start [commented]");
      expect(content).toContain("# deploy=false");
      expect(content).not.toContain("deploy=true");
    });

    it("--commented installs a new block already commented", async () => {
      const src = await writeFixture("src.txt", "deploy=true\n");
      const file = await writeFixture("f.txt", "pre\n");
      const result = runCli([
        "-n",
        "deploy",
        "-i",
        src,
        "--source-label",
        "none",
        "--commented",
        file,
      ]);
      expect(result.status).toBe(0);
      expect(await read(file)).toBe(
        "pre\n# deploy start [commented]\n# deploy=true\n\n# deploy end\n",
      );
    });

    it("--commented flips an existing active block", async () => {
      const src = await writeFixture("src.txt", "deploy=true\n");
      const file = await writeFixture("f.txt", "pre\n");
      runCli(["-n", "deploy", "-i", src, "--source-label", "none", file]);
      runCli(["-n", "deploy", "-i", src, "--source-label", "none", "--commented", file]);
      const content = await read(file);
      expect(content).toContain("# deploy start [commented]");
      expect(content).toContain("# deploy=true");
    });

    it("rejects --additive on commented emission", async () => {
      const src = await writeFixture("src.txt", "deploy=true\n");
      const file = await writeFixture("f.txt", "# deploy start [commented]\n# x\n# deploy end\n");
      const result = runCli(["-n", "deploy", "-i", src, "--additive", file]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--additive");
    });
  });

  describe("family flags", () => {
    it("--comment-out-all flips every named block in one pass", async () => {
      const original =
        "# apt start\ndeb one\n# apt end\nplain\n# cron start\n0 * * * *\n# cron end\n# keep start\nstay\n# keep end\n";
      const file = await writeFixture("f.txt", original);
      const result = runCli(["--comment-out-all", "apt cron", file]);
      expect(result.status).toBe(0);
      const content = await read(file);
      expect(content).toContain("# apt start [commented]\n# deb one\n# apt end");
      expect(content).toContain("# cron start [commented]\n# 0 * * * *\n# cron end");
      expect(content).toContain("# keep start\nstay\n# keep end");
    });

    it("--uncomment-all restores them byte-for-byte", async () => {
      const original =
        "# apt start\ndeb one\n# apt end\nplain\n# cron start\n0 * * * *\n# cron end\n";
      const file = await writeFixture("f.txt", original);
      runCli(["--comment-out-all", "apt cron", file]);
      const result = runCli(["--uncomment-all", "apt cron", file]);
      expect(result.status).toBe(0);
      expect(await read(file)).toBe(original);
    });

    it("--comment-out-all merges with --comment-out for the named block", async () => {
      const original = "# a start\none\n# a end\n# b start\ntwo\n# b end\n";
      const file = await writeFixture("f.txt", original);
      const result = runCli(["-n", "a", "--comment-out", "--comment-out-all", "b", file]);
      expect(result.status).toBe(0);
      const content = await read(file);
      expect(content).toContain("# a start [commented]\n# one\n# a end");
      expect(content).toContain("# b start [commented]\n# two\n# b end");
    });

    it("--comment-out-match flips only names matching the regex", async () => {
      const original =
        "# dep-apt start\ndeb\n# dep-apt end\n# keep start\nstay\n# keep end\n# dep-cron start\njob\n# dep-cron end\n";
      const file = await writeFixture("f.txt", original);
      const result = runCli(["--comment-out-match", "^dep-", file]);
      expect(result.status).toBe(0);
      const content = await read(file);
      expect(content).toContain("# dep-apt start [commented]\n# deb\n# dep-apt end");
      expect(content).toContain("# dep-cron start [commented]\n# job\n# dep-cron end");
      expect(content).toContain("# keep start\nstay\n# keep end");
    });

    it("--uncomment-match restores only matching names", async () => {
      const original =
        "# dep-apt start [commented]\n# deb\n# dep-apt end\n# keep start [commented]\n# stay\n# keep end\n";
      const file = await writeFixture("f.txt", original);
      const result = runCli(["--uncomment-match", "^dep-", file]);
      expect(result.status).toBe(0);
      const content = await read(file);
      expect(content).toContain("# dep-apt start\ndeb\n# dep-apt end");
      expect(content).toContain("# keep start [commented]\n# stay\n# keep end");
    });

    it("--comment-out-all is idempotent and reports already-in-state exits 0", async () => {
      const file = await writeFixture("f.txt", "# a start\none\n# a end\n");
      runCli(["--comment-out-all", "a", file]);
      const once = await read(file);
      const result = runCli(["--comment-out-all", "a", file]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("already in state");
      expect(await read(file)).toBe(once);
    });

    it("exits 1 when no addressed block exists", async () => {
      const file = await writeFixture("f.txt", "# other start\nx\n# other end\n");
      const all = runCli(["--comment-out-all", "missing", file]);
      expect(all.status).toBe(1);
      expect(all.stderr).toContain("no block");

      const match = runCli(["--uncomment-match", "^nope-", file]);
      expect(match.status).toBe(1);
      expect(match.stderr).toContain("no block");
    });

    it("rejects mixing comment-out and uncomment family flags", async () => {
      const file = await writeFixture("f.txt", "# a start\nx\n# a end\n");
      const result = runCli(["--comment-out-all", "a", "--uncomment-match", "a", file]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Cannot combine");
    });

    it("rejects combining family flips with removal flags and --commented", async () => {
      const file = await writeFixture("f.txt", "# a start\nx\n# a end\n");
      const removal = runCli(["--comment-out-all", "a", "--remove", "a", file]);
      expect(removal.status).toBe(1);
      expect(removal.stderr).toContain("Cannot combine");

      const commented = runCli(["--comment-out-match", "a", "--commented", file]);
      expect(commented.status).toBe(1);
      expect(commented.stderr).toContain("--commented");
    });

    it("surfaces duplicate-block conflicts for an addressed name", async () => {
      const file = await writeFixture(
        "f.txt",
        "# dep start\none\n# dep end\nmid\n# dep start\ntwo\n# dep end\n",
      );
      const result = runCli(["--comment-out-match", "^dep$", file]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("conflict");
    });

    it("does not read stdin or require -i", async () => {
      const file = await writeFixture("f.txt", "# a start\none\n# a end\n");
      const result = runCli(["--comment-out-all", "a", file]);
      expect(result.status).toBe(0);
      expect(await read(file)).toContain("# a start [commented]");
    });

    it("honors a custom comment character", async () => {
      const file = await writeFixture(
        "f.txt",
        "// a start\none\n// a end\n// b start\ntwo\n// b end\n",
      );
      const result = runCli(["-c", "//", "--comment-out-all", "a b", file]);
      expect(result.status).toBe(0);
      const content = await read(file);
      expect(content).toContain("// a start [commented]\n// one\n// a end");
      expect(content).toContain("// b start [commented]\n// two\n// b end");
    });
  });

  describe("reads", () => {
    it("--read returns the commented body verbatim", async () => {
      const file = await writeFixture(
        "f.txt",
        "# deploy start [commented]\n# deploy=true\n# deploy end\n",
      );
      const result = runCli(["--read", "-n", "deploy", file]);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("# deploy=true");
    });

    it("--read-uncommented strips one comment layer", async () => {
      const file = await writeFixture(
        "f.txt",
        "# deploy start [commented]\n# deploy=true\n# # note\n# deploy end\n",
      );
      const result = runCli(["--read-uncommented", "-n", "deploy", file]);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("deploy=true\n# note");
    });

    it("--read-uncommented strips genuine comments on an active block too", async () => {
      const file = await writeFixture("f.txt", "# a start\nalpha\n# genuine note\n# a end\n");
      const result = runCli(["--read-uncommented", "-n", "a", file]);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("alpha\ngenuine note");
    });
  });
});
