const MAX_ITERATIONS = 100;
const VAR_PATTERN_BRACES = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const VAR_PATTERN_SIMPLE = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;

export type EnvsubstMode = "recursive" | "non-recursive" | false;

export interface EnvsubstOptions {
  mode: EnvsubstMode;
}

export function substitute(text: string, options: EnvsubstOptions): string {
  const { mode } = options;

  if (mode === false) {
    return text;
  }

  if (mode === "non-recursive") {
    return substituteOnce(text);
  }

  return substituteUntilStable(text, MAX_ITERATIONS);
}

function substituteUntilStable(text: string, maxIterations: number): string {
  let current = text;
  let previous = "";
  let iterations = 0;

  while (current !== previous && iterations < maxIterations) {
    previous = current;
    current = substituteOnce(current);
    iterations++;
  }

  return current;
}

function substituteOnce(text: string): string {
  let result = text;

  result = result.replace(VAR_PATTERN_BRACES, (match, varName) => {
    const value = process.env[varName];
    if (value === undefined) {
      return "";
    }
    return value;
  });

  result = result.replace(VAR_PATTERN_SIMPLE, (match, varName) => {
    const value = process.env[varName];
    if (value === undefined) {
      return "";
    }
    return value;
  });

  return result;
}
