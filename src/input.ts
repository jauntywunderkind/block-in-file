import { readAll } from "jsr:@std/io/read-all"
import type { CreateArg, InputOptions } from "./types.ts"

export function get<T>(source: Partial<T>, defaults: Partial<T>, ...keys: (keyof T)[]) {
	if (keys.length === 1) {
		const key = keys[0]
		const o = source[key]
		// deno-lint-ignore no-explicit-any
		return (o !== undefined ? o : defaults?.[key]) as any
	}

	const o = new Array(keys.length)
	for (const i in keys) {
		o[i] = get(source, defaults, keys[i])
	}
	return o
}

export function createOpt(value: CreateArg, target: CreateArg): InputOptions | undefined {
	return value === 1 || value === true || value === target ? { create: true } : undefined
}

export async function openInput(file: string, opts?: InputOptions) {
	try {
		return file === "-" || file === undefined ? Deno.stdin : await Deno.open(file, { read: true })
	} catch (ex) {
		if (opts?.create) {
			return Deno.open("/dev/null", { read: true })
		}
		throw ex
	}
}

export async function readInput(file: string, opts?: InputOptions): Promise<string> {
	const inputStream = await openInput(file, opts)
	const buffer = await readAll(inputStream)
	const decoder = new TextDecoder()
	return decoder.decode(buffer)
}
