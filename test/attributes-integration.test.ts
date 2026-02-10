import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { supportsChattr } from "../src/attributes.ts";

describe("Attributes integration", () => {
  let tempDir: string;
  const isLinuxWithChattr = process.platform === "linux" && supportsChattr();

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blockinfile-attributes-"));
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

  describe("with --attributes option", () => {
    if (!isLinuxWithChattr) {
      it.skip("should be skipped on non-Linux or without chattr", () => {
        expect(process.platform).not.toBe("linux");
      });
      return;
    }

    it("sets immutable attribute on file", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "original\n");

      runBlockInFile(`--attributes "+i" ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("CONTENT");

      try {
        const lsattr = execSync(`lsattr ${targetFile}`, { encoding: "utf-8" });
        expect(lsattr).toMatch(/i/);
      } finally {
        execSync(`chattr -i ${targetFile}`, { stdio: "ignore" });
      }
    });

    it("sets multiple attributes", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "original\n");

      runBlockInFile(`--attributes "+i +a" ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("CONTENT");

      try {
        const lsattr = execSync(`lsattr ${targetFile}`, { encoding: "utf-8" });
        expect(lsattr).toMatch(/i/);
        expect(lsattr).toMatch(/a/);
      } finally {
        execSync(`chattr -i -a ${targetFile}`, { stdio: "ignore" });
      }
    });

    it("removes immutable attribute", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "original\n");

      try {
        execSync(`chattr +i ${targetFile}`);
      } catch (err) {
        console.warn(`Skipping test: cannot set immutable attribute: ${(err as Error).message}`);
        return;
      }

      runBlockInFile(`--attributes "-i" ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("CONTENT");

      const lsattr = execSync(`lsattr ${targetFile}`, { encoding: "utf-8" });
      expect(lsattr).not.toMatch(/i/);
    });

    it("works with --backup option", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "original\n");

      runBlockInFile(`--backup .old --attributes "+i" ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("CONTENT");

      try {
        const lsattr = execSync(`lsattr ${targetFile}`, { encoding: "utf-8" });
        expect(lsattr).toMatch(/i/);
      } finally {
        execSync(`chattr -i ${targetFile}`, { stdio: "ignore" });
      }
    });

    it("warns about insufficient privileges when not root", async () => {
      if (process.getuid && process.getuid() === 0) {
        return;
      }

      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "original\n");

      runBlockInFile(`--attributes "+i" ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("CONTENT");
    });
  });

  describe("cross-platform behavior", () => {
    it("should work without errors on all platforms", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "original\n");

      runBlockInFile(`--attributes "+i" ${targetFile}`, "CONTENT");

      const result = await fs.readFile(targetFile, "utf-8");
      expect(result).toContain("CONTENT");
    });
  });

  describe("with --debug option", () => {
    if (!isLinuxWithChattr) {
      it.skip("should show debug info on Linux with chattr", () => {
        expect(process.platform).not.toBe("linux");
      });
      return;
    }

    it("shows attribute application in debug output", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      await fs.writeFile(targetFile, "original\n");

      const output = runBlockInFile(`--debug --attributes "+i" ${targetFile}`, "CONTENT");

      expect(output).toContain("Applying attributes");

      try {
        const lsattr = execSync(`lsattr ${targetFile}`, { encoding: "utf-8" });
        expect(lsattr).toMatch(/i/);
      } finally {
        execSync(`chattr -i ${targetFile}`, { stdio: "ignore" });
      }
    });
  });
});
