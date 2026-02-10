import { x } from "tinyexec";
import type { LoggerExtension } from "./plugins/logger.ts";
import type { IOExtension } from "./plugins/io.ts";

export interface AttributeChange {
  mode: "+" | "-" | "=";
  attribute: string;
}

export interface AttributeOptions {
  attributes?: string;
  debug: boolean;
  logger: LoggerExtension;
  io: IOExtension;
}

export function parseAttributes(attrString: string): AttributeChange[] {
  const changes: AttributeChange[] = [];

  if (!attrString || attrString.trim().length === 0) {
    return changes;
  }

  const tokens = attrString.trim().split(/\s+/);

  for (const token of tokens) {
    if (token.length === 0) continue;

    const mode = token[0] as "+" | "-" | "=";
    const attr = token.slice(1);

    if (!/^[+\-=]/.test(mode) || !/^[a-zA-Z]+$/.test(attr)) {
      throw new Error(`Invalid attribute syntax: ${token}`);
    }

    changes.push({ mode, attribute: attr });
  }

  return changes;
}

export async function supportsChattr(): Promise<boolean> {
  if (process.platform !== "linux") {
    return false;
  }

  try {
    await x("which", ["chattr"], { throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

async function runChattr(args: string[]): Promise<void> {
  try {
    await x("chattr", args, { throwOnError: true });
  } catch (err) {
    const error = err as Error & { stderr?: string; exitCode?: number };
    const stderr = error.stderr?.trim() || "";
    const code = error.exitCode;
    throw new Error(
      `chattr failed${code !== undefined ? ` with code ${code}` : ""}${stderr ? `: ${stderr}` : ""}`,
    );
  }
}

async function runLsattr(filePath: string): Promise<string> {
  try {
    const result = await x("lsattr", [filePath], { throwOnError: true });
    return result.stdout.trim();
  } catch (err) {
    const error = err as Error & { stderr?: string; exitCode?: number };
    const stderr = error.stderr?.trim() || "";
    const code = error.exitCode;
    throw new Error(
      `lsattr failed${code !== undefined ? ` with code ${code}` : ""}${stderr ? `: ${stderr}` : ""}`,
    );
  }
}

export async function applyAttributes(
  filePath: string,
  changes: AttributeChange[],
  debug: boolean,
  logger: LoggerExtension,
): Promise<void> {
  if (changes.length === 0) {
    return;
  }

  if (!(await supportsChattr())) {
    throw new Error(
      "chattr is not available on this system. File attributes require Linux and the chattr command.",
    );
  }

  if (debug) {
    logger.debug(
      `Applying attributes to ${filePath}: ${changes.map((c) => `${c.mode}${c.attribute}`).join(" ")}`,
    );
  }

  for (const change of changes) {
    await runChattr([`${change.mode}${change.attribute}`, filePath]);
  }

  if (debug) {
    try {
      const attrs = await runLsattr(filePath);
      logger.debug(`File attributes after chattr: ${attrs}`);
    } catch (err) {
      logger.debug(`Could not verify attributes with lsattr: ${(err as Error).message}`);
    }
  }
}

export async function applyAttributesSafe(
  filePath: string,
  changes: AttributeChange[],
  opts: AttributeOptions,
): Promise<void> {
  const { debug, logger } = opts;

  if (changes.length === 0) {
    return;
  }

  if (!(await supportsChattr())) {
    if (debug) {
      logger.debug("chattr not available on this system, skipping attribute setting");
    }
    return;
  }

  if (process.platform !== "linux") {
    if (debug) {
      logger.debug(`File attributes are only supported on Linux, skipping for ${process.platform}`);
    }
    return;
  }

  if (debug) {
    logger.debug(
      `Attempting to set attributes on ${filePath}: ${changes.map((c) => `${c.mode}${c.attribute}`).join(" ")}`,
    );
  }

  try {
    await applyAttributes(filePath, changes, debug, logger);
  } catch (err) {
    const errorMsg = (err as Error).message;
    if (errorMsg.includes("Operation not permitted") || errorMsg.includes("Permission denied")) {
      logger.warn(
        `Insufficient privileges to set file attributes. Root or CAP_LINUX_IMMUTABLE capability required.`,
      );
    } else {
      logger.warn(`Failed to set file attributes: ${errorMsg}`);
    }
  }
}
