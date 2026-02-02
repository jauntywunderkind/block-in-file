import type { CreateArg, InputOptions } from "./types.js";
import * as fs from "node:fs/promises";

export function get<T>(source: Partial<T>, defaults: Partial<T>, ...keys: (keyof T)[]) {
  if (keys.length === 1) {
    const key = keys[0];
    const o = source[key];
    return (o !== undefined ? o : defaults?.[key]) as any;
  }

  const o = Array.from({ length: keys.length });
  for (const i in keys) {
    o[i] = get(source, defaults, keys[i]);
  }
  return o;
}

export function createOpt(value: CreateArg, target: CreateArg): InputOptions | undefined {
  return value === 1 || value === true || value === target ? { create: true } : undefined;
}

export async function openInput(file: string, opts?: InputOptions): Promise<fs.FileHandle> {
  try {
    if (file === "-" || file === undefined) {
      return process.stdin as any;
    }
    return await fs.open(file, "r");
  } catch (ex) {
    if (opts?.create) {
      return await fs.open("/dev/null", "r");
    }
    throw ex;
  }
}

export async function readInput(file: string, opts?: InputOptions): Promise<string> {
  const inputStream = await openInput(file, opts);
  if (typeof inputStream === "object" && "readable" in inputStream) {
    const reader = inputStream.readable.getReader();
    const chunks: Uint8Array[] = [];

    let done = false;
    while (!done) {
      const { value, done: isDone } = await reader.read();
      done = isDone;
      if (value) {
        chunks.push(value);
      }
    }

    const decoder = new TextDecoder();
    return decoder.decode(concat(chunks));
  }

  throw new Error("Invalid input stream");
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
