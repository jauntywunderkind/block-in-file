import * as crypto from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs/promises";

export type BackupMode = "iterate" | "fail" | "overwrite";

export interface BackupOptions {
  enabled: boolean;
  suffixes: string[];
  backupDir?: string;
  stateOnFail?: BackupMode;
}

export interface TemplateVariables {
  date: string;
  time: string;
  iso: string;
  epoch: string;
  md5?: string;
  sha256?: string;
}

export function generateTemplateVariables(content?: string): TemplateVariables {
  const now = new Date();

  const variables: TemplateVariables = {
    date: now.toISOString().split("T")[0],
    time: now.toTimeString().split(" ")[0].replace(/:/g, ""),
    iso: now.toISOString(),
    epoch: Math.floor(now.getTime() / 1000).toString(),
  };

  if (content) {
    const md5 = crypto.createHash("md5").update(content).digest("hex");
    const sha256 = crypto.createHash("sha256").update(content).digest("hex");
    variables.md5 = md5.substring(0, 8);
    variables.sha256 = sha256.substring(0, 8);
  }

  return variables;
}

export function replaceTemplateVariables(template: string, variables: TemplateVariables): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${key}}`, value);
  }

  return result;
}

export function generateBackupPaths(
  originalPath: string,
  suffixes: string[],
  variables: TemplateVariables,
  backupDir?: string,
): string[] {
  const basePath = backupDir ? path.join(backupDir, path.basename(originalPath)) : originalPath;

  return suffixes.map((suffix) => {
    const processedSuffix = replaceTemplateVariables(suffix, variables);
    return `${basePath}${processedSuffix}`;
  });
}

export async function detectGitRepo(dir: string): Promise<boolean> {
  try {
    const gitPath = path.join(dir, ".git");
    await fs.access(gitPath);
    return true;
  } catch {
    return false;
  }
}

export async function isPathInGitRepo(filePath: string): Promise<boolean> {
  const dir = path.dirname(filePath);
  return detectGitRepo(dir);
}

export async function createBackup(originalPath: string, backupPath: string): Promise<void> {
  await fs.copyFile(originalPath, backupPath);

  const isGitRepo = await isPathInGitRepo(backupPath);
  if (isGitRepo) {
    const gitignorePath = path.join(path.dirname(backupPath), ".gitignore");

    try {
      const gitignore = await fs.readFile(gitignorePath, "utf-8");
      const backupName = path.basename(backupPath);

      if (!gitignore.includes(backupName)) {
        await fs.appendFile(gitignorePath, `\n${backupName}\n`);
      }
    } catch {
      await fs.writeFile(gitignorePath, `${path.basename(backupPath)}\n`);
    }
  }
}

export async function findAvailableBackupPath(
  baseBackupPath: string,
  mode: BackupMode = "iterate",
): Promise<string | null> {
  try {
    await fs.access(baseBackupPath);

    if (mode === "iterate") {
      let counter = 1;
      while (true) {
        const backupPath = `${baseBackupPath}.${counter}`;
        try {
          await fs.access(backupPath);
          counter++;
        } catch {
          return backupPath;
        }
      }
    } else if (mode === "overwrite") {
      return baseBackupPath;
    } else {
      return null;
    }
  } catch {
    return baseBackupPath;
  }
}

export async function performBackup(
  originalPath: string,
  options: BackupOptions,
  content?: string,
): Promise<string[]> {
  if (!options.enabled) {
    return [];
  }

  const variables = generateTemplateVariables(content);
  const backupPaths = generateBackupPaths(
    originalPath,
    options.suffixes,
    variables,
    options.backupDir,
  );

  const createdBackups: string[] = [];

  for (const backupPath of backupPaths) {
    try {
      await fs.access(originalPath);

      const finalBackupPath = await findAvailableBackupPath(backupPath, options.stateOnFail);

      if (finalBackupPath === null && options.stateOnFail === "fail") {
        throw new Error(
          `Backup failed: backup file already exists and state-on-fail is set to 'fail'`,
        );
      }

      if (finalBackupPath) {
        await createBackup(originalPath, finalBackupPath);
        createdBackups.push(finalBackupPath);
      }
    } catch (err) {
      if (options.stateOnFail === "fail") {
        throw err;
      }
    }
  }

  return createdBackups;
}

export function parseBackupOption(backupArg: string | undefined): BackupOptions {
  if (!backupArg) {
    return { enabled: false, suffixes: [] };
  }

  if (backupArg === "true" || backupArg === "1") {
    return { enabled: true, suffixes: [".{epoch}.backup"] };
  }

  if (backupArg === "false" || backupArg === "0") {
    return { enabled: false, suffixes: [] };
  }

  const suffixes = backupArg.trim().split(/\s+/).filter(Boolean);

  return {
    enabled: true,
    suffixes,
  };
}
