import { x } from "tinyexec";
import { tokenizeArgs } from "args-tokenizer";

export async function runValidation(file: string, validateCmd: string): Promise<void> {
  const substitutedCmd = validateCmd.replaceAll("%s", file);
  const [command, ...args] = tokenizeArgs(substitutedCmd);
  const result = await x(command, args, { throwOnError: true });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "Validation command failed");
  }
}
