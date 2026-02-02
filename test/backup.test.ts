import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  generateTemplateVariables,
  replaceTemplateVariables,
  generateBackupPaths,
  detectGitRepo,
  createBackup,
  findAvailableBackupPath,
  performBackup,
  parseBackupOption,
  type BackupOptions,
} from "../src/backup.js";

describe("Backup", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blockinfile-backup-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("generateTemplateVariables", () => {
    it("should generate basic date/time variables", () => {
      const variables = generateTemplateVariables();

      expect(variables.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(variables.time).toMatch(/^\d{6}$/);
      expect(variables.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(variables.epoch).toMatch(/^\d+$/);
    });

    it("should generate hash variables with content", () => {
      const content = "test content";
      const variables = generateTemplateVariables(content);

      expect(variables.md5).toBeDefined();
      expect(variables.md5?.length).toBe(8);
      expect(variables.sha256).toBeDefined();
      expect(variables.sha256?.length).toBe(8);
    });

    it("should not generate hash variables without content", () => {
      const variables = generateTemplateVariables();

      expect(variables.md5).toBeUndefined();
      expect(variables.sha256).toBeUndefined();
    });
  });

  describe("replaceTemplateVariables", () => {
    it("should replace date variable", () => {
      const variables = generateTemplateVariables();
      const template = "backup-{date}";
      const result = replaceTemplateVariables(template, variables);

      expect(result).toBe(`backup-${variables.date}`);
    });

    it("should replace multiple variables", () => {
      const variables = generateTemplateVariables();
      const template = "backup-{date}-{time}";
      const result = replaceTemplateVariables(template, variables);

      expect(result).toBe(`backup-${variables.date}-${variables.time}`);
    });

    it("should replace hash variables", () => {
      const variables = generateTemplateVariables("test");
      const template = "backup-{md5}";
      const result = replaceTemplateVariables(template, variables);

      expect(result).toBe(`backup-${variables.md5}`);
    });

    it("should handle missing variables", () => {
      const variables = generateTemplateVariables();
      const template = "backup-{unknown}";
      const result = replaceTemplateVariables(template, variables);

      expect(result).toBe("backup-{unknown}");
    });
  });

  describe("generateBackupPaths", () => {
    it("should generate single backup path", () => {
      const variables = generateTemplateVariables();
      const paths = generateBackupPaths("file.txt", [".{date}.backup"], variables);

      expect(paths).toHaveLength(1);
      expect(paths[0]).toBe(`file.txt.${variables.date}.backup`);
    });

    it("should generate multiple backup paths", () => {
      const variables = generateTemplateVariables();
      const paths = generateBackupPaths("file.txt", [".{date}.backup", ".bak"], variables);

      expect(paths).toHaveLength(2);
      expect(paths[0]).toBe(`file.txt.${variables.date}.backup`);
      expect(paths[1]).toBe("file.txt.bak");
    });

    it("should use backup directory when specified", () => {
      const variables = generateTemplateVariables();
      const paths = generateBackupPaths(
        path.join("some", "dir", "file.txt"),
        [".{date}.backup"],
        variables,
        "/backups",
      );

      expect(paths).toHaveLength(1);
      expect(paths[0]).toBe(`/backups/file.txt.${variables.date}.backup`);
    });
  });

  describe("detectGitRepo", () => {
    it("should detect git repository", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      const isGitRepo = await detectGitRepo(tempDir);

      expect(isGitRepo).toBe(true);
    });

    it("should not detect non-git directory", async () => {
      const isGitRepo = await detectGitRepo(tempDir);

      expect(isGitRepo).toBe(false);
    });
  });

  describe("createBackup", () => {
    it("should create backup file", async () => {
      const originalFile = path.join(tempDir, "file.txt");
      const backupFile = path.join(tempDir, "file.txt.backup");

      await fs.writeFile(originalFile, "original content");
      await createBackup(originalFile, backupFile);

      const backupContent = await fs.readFile(backupFile, "utf-8");
      expect(backupContent).toBe("original content");
    });

    it("should add to .gitignore in git repo", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      const originalFile = path.join(tempDir, "file.txt");
      const backupFile = path.join(tempDir, "file.txt.backup");

      await fs.writeFile(originalFile, "original content");
      await createBackup(originalFile, backupFile);

      const gitignorePath = path.join(tempDir, ".gitignore");
      const gitignore = await fs.readFile(gitignorePath, "utf-8");

      expect(gitignore).toContain("file.txt.backup");
    });

    it("should append to existing .gitignore", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      const gitignorePath = path.join(tempDir, ".gitignore");
      await fs.writeFile(gitignorePath, "existing-pattern\n");

      const originalFile = path.join(tempDir, "file.txt");
      const backupFile = path.join(tempDir, "file.txt.backup");

      await fs.writeFile(originalFile, "original content");
      await createBackup(originalFile, backupFile);

      const gitignore = await fs.readFile(gitignorePath, "utf-8");

      expect(gitignore).toContain("existing-pattern");
      expect(gitignore).toContain("file.txt.backup");
    });
  });

  describe("findAvailableBackupPath", () => {
    it("should return original path if file does not exist", async () => {
      const backupPath = path.join(tempDir, "file.txt.backup");
      const result = await findAvailableBackupPath(backupPath);

      expect(result).toBe(backupPath);
    });

    it("should add iteration suffix in iterate mode", async () => {
      const backupPath = path.join(tempDir, "file.txt.backup");
      await fs.writeFile(backupPath, "backup");

      const result = await findAvailableBackupPath(backupPath, "iterate");

      expect(result).toBe(`${backupPath}.1`);
    });

    it("should handle multiple iterations", async () => {
      const backupPath = path.join(tempDir, "file.txt.backup");
      await fs.writeFile(backupPath, "backup");
      await fs.writeFile(`${backupPath}.1`, "backup1");
      await fs.writeFile(`${backupPath}.2`, "backup2");

      const result = await findAvailableBackupPath(backupPath, "iterate");

      expect(result).toBe(`${backupPath}.3`);
    });

    it("should return same path in overwrite mode", async () => {
      const backupPath = path.join(tempDir, "file.txt.backup");
      await fs.writeFile(backupPath, "backup");

      const result = await findAvailableBackupPath(backupPath, "overwrite");

      expect(result).toBe(backupPath);
    });

    it("should return null in fail mode when file exists", async () => {
      const backupPath = path.join(tempDir, "file.txt.backup");
      await fs.writeFile(backupPath, "backup");

      const result = await findAvailableBackupPath(backupPath, "fail");

      expect(result).toBeNull();
    });
  });

  describe("parseBackupOption", () => {
    it("should parse boolean true", () => {
      const options1 = parseBackupOption("true");
      const options2 = parseBackupOption("1");

      expect(options1.enabled).toBe(true);
      expect(options1.suffixes[0]).toBe(".{epoch}.backup");
      expect(options2.enabled).toBe(true);
      expect(options2.suffixes[0]).toBe(".{epoch}.backup");
    });

    it("should parse boolean false", () => {
      const options1 = parseBackupOption("false");
      const options2 = parseBackupOption("0");

      expect(options1.enabled).toBe(false);
      expect(options1.suffixes).toHaveLength(0);
      expect(options2.enabled).toBe(false);
      expect(options2.suffixes).toHaveLength(0);
    });

    it("should parse custom suffix", () => {
      const options = parseBackupOption(".bak");

      expect(options.enabled).toBe(true);
      expect(options.suffixes).toEqual([".bak"]);
    });

    it("should parse multiple space-separated suffixes", () => {
      const options = parseBackupOption(".bak .backup");

      expect(options.enabled).toBe(true);
      expect(options.suffixes).toEqual([".bak", ".backup"]);
    });

    it("should parse template with variables", () => {
      const options = parseBackupOption(".{date}.bak");

      expect(options.enabled).toBe(true);
      expect(options.suffixes).toEqual([".{date}.bak"]);
    });

    it("should handle undefined backup option", () => {
      const options = parseBackupOption(undefined);

      expect(options.enabled).toBe(false);
      expect(options.suffixes).toHaveLength(0);
    });
  });

  describe("performBackup", () => {
    it("should not create backups when disabled", async () => {
      const originalFile = path.join(tempDir, "file.txt");
      await fs.writeFile(originalFile, "content");

      const options: BackupOptions = {
        enabled: false,
        suffixes: [".backup"],
      };

      const backups = await performBackup(originalFile, options);

      expect(backups).toHaveLength(0);
    });

    it("should create single backup", async () => {
      const originalFile = path.join(tempDir, "file.txt");
      await fs.writeFile(originalFile, "content");

      const options: BackupOptions = {
        enabled: true,
        suffixes: [".backup"],
      };

      const backups = await performBackup(originalFile, options);

      expect(backups).toHaveLength(1);
      expect(backups[0]).toBe(path.join(tempDir, "file.txt.backup"));

      const backupContent = await fs.readFile(backups[0], "utf-8");
      expect(backupContent).toBe("content");
    });

    it("should create multiple backups", async () => {
      const originalFile = path.join(tempDir, "file.txt");
      await fs.writeFile(originalFile, "content");

      const options: BackupOptions = {
        enabled: true,
        suffixes: [".backup", ".bak"],
      };

      const backups = await performBackup(originalFile, options);

      expect(backups).toHaveLength(2);
      expect(backups[0]).toBe(path.join(tempDir, "file.txt.backup"));
      expect(backups[1]).toBe(path.join(tempDir, "file.txt.bak"));
    });

    it("should use custom backup directory", async () => {
      const backupDir = path.join(tempDir, "backups");
      await fs.mkdir(backupDir);

      const originalFile = path.join(tempDir, "file.txt");
      await fs.writeFile(originalFile, "content");

      const options: BackupOptions = {
        enabled: true,
        suffixes: [".backup"],
        backupDir,
      };

      const backups = await performBackup(originalFile, options);

      expect(backups).toHaveLength(1);
      expect(backups[0]).toBe(path.join(backupDir, "file.txt.backup"));
    });

    it("should iterate when backup exists", async () => {
      const originalFile = path.join(tempDir, "file.txt");
      await fs.writeFile(originalFile, "content");

      const existingBackup = path.join(tempDir, "file.txt.backup");
      await fs.writeFile(existingBackup, "old backup");

      const options: BackupOptions = {
        enabled: true,
        suffixes: [".backup"],
        stateOnFail: "iterate",
      };

      const backups = await performBackup(originalFile, options);

      expect(backups).toHaveLength(1);
      expect(backups[0]).toBe(`${existingBackup}.1`);

      const originalBackupContent = await fs.readFile(existingBackup, "utf-8");
      expect(originalBackupContent).toBe("old backup");
    });

    it("should throw error when fail mode and backup exists", async () => {
      const originalFile = path.join(tempDir, "file.txt");
      await fs.writeFile(originalFile, "content");

      const existingBackup = path.join(tempDir, "file.txt.backup");
      await fs.writeFile(existingBackup, "old backup");

      const options: BackupOptions = {
        enabled: true,
        suffixes: [".backup"],
        stateOnFail: "fail",
      };

      await expect(performBackup(originalFile, options)).rejects.toThrow();
    });

    it("should overwrite when backup exists in overwrite mode", async () => {
      const originalFile = path.join(tempDir, "file.txt");
      await fs.writeFile(originalFile, "content");

      const existingBackup = path.join(tempDir, "file.txt.backup");
      await fs.writeFile(existingBackup, "old backup");

      const options: BackupOptions = {
        enabled: true,
        suffixes: [".backup"],
        stateOnFail: "overwrite",
      };

      const backups = await performBackup(originalFile, options);

      expect(backups).toHaveLength(1);
      expect(backups[0]).toBe(existingBackup);

      const backupContent = await fs.readFile(existingBackup, "utf-8");
      expect(backupContent).toBe("content");
    });
  });
});
