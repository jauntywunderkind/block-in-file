const MAX_ITERATIONS = 100;
const VAR_PATTERN_BRACES = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const VAR_PATTERN_SIMPLE = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;

export type EnvsubstMode = "recursive" | "non-recursive" | false;

export interface EnvsubstOptions {
  mode: EnvsubstMode;
  exclude?: RegExp;
}

export function substitute(text: string, options: EnvsubstOptions): string {
  const { mode, exclude } = options;

  if (mode === false) {
    return text;
  }

  if (mode === "non-recursive") {
    return substituteOnce(text, exclude);
  }

  return substituteUntilStable(text, MAX_ITERATIONS, exclude);
}

function substituteUntilStable(
  text: string,
  maxIterations: number,
  exclude: RegExp | undefined,
): string {
  let current = text;
  let previous = "";
  let iterations = 0;

  while (current !== previous && iterations < maxIterations) {
    previous = current;
    current = substituteOnce(current, exclude);
    iterations++;
  }

  return current;
}

function substituteOnce(text: string, exclude: RegExp | undefined): string {
  let result = text;

  result = result.replace(VAR_PATTERN_BRACES, (match, varName) => {
    if (exclude && exclude.test(varName)) return match;
    const value = process.env[varName];
    if (value === undefined) {
      return "";
    }
    return value;
  });

  result = result.replace(VAR_PATTERN_SIMPLE, (match, varName) => {
    if (exclude && exclude.test(varName)) return match;
    const value = process.env[varName];
    if (value === undefined) {
      return "";
    }
    return value;
  });

  return result;
}
