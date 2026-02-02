import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { unlink, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

describe("envsubst integration", () => {
  const testDir = join(process.cwd(), ".test-envsubst");
  const testFile = join(testDir, "test.txt");

  beforeEach(async () => {
    try {
      await mkdir(testDir, { recursive: true });
    } catch {}
    await writeFile(testFile, "original content\n", "utf8");
  });

  afterEach(async () => {
    try {
      await unlink(testFile);
    } catch {}
  });

  it("should substitute environment variables with ${VAR} syntax", async () => {
    process.env.TEST_VAR = "hello world";
    const input = "content: ${TEST_VAR}";

    await execAsync(`echo '${input}' | npx tsx block-in-file.ts --envsubst=recursive ${testFile}`);

    const content = await readFile(testFile, "utf8");
    expect(content).toContain("content: hello world");
    delete process.env.TEST_VAR;
  });

  it("should substitute nested variables in recursive mode", async () => {
    process.env.VAR1 = "value1";
    process.env.VAR2 = "prefix ${VAR1}";
    const input = "result: ${VAR2}";

    await execAsync(`echo '${input}' | npx tsx block-in-file.ts --envsubst=recursive ${testFile}`);

    const content = await readFile(testFile, "utf8");
    expect(content).toContain("result: prefix value1");
    delete process.env.VAR1;
    delete process.env.VAR2;
  });

  it("should do single pass in non-recursive mode", async () => {
    process.env.VAR1 = "final";
    process.env.VAR2 = "${VAR1}";
    process.env.VAR3 = "${VAR2}";
    const input = "${VAR3}";

    await execAsync(
      `echo '${input}' | npx tsx block-in-file.ts --envsubst=non-recursive ${testFile}`,
    );

    const content = await readFile(testFile, "utf8");
    // Non-recursive: only ${VAR3} is replaced, result is ${VAR2}
    expect(content).toContain("${VAR2}");
    delete process.env.VAR1;
    delete process.env.VAR2;
    delete process.env.VAR3;
  });

  it("should not substitute when envsubst is false", async () => {
    process.env.TEST_VAR = "value";
    const input = "content: ${TEST_VAR}";

    await execAsync(`echo '${input}' | npx tsx block-in-file.ts --envsubst=false ${testFile}`);

    const content = await readFile(testFile, "utf8");
    expect(content).toContain("content: ${TEST_VAR}");
    delete process.env.TEST_VAR;
  });
});
