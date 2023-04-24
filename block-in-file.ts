#!/usr/bin/env -S deno run --allow-read --allow-net --ext ts
import { readLines } from "https://deno.land/std/io/read_lines.ts"
import { readAll } from "https://deno.land/std/streams/read_all.ts"

function get<T>(source: Partial<T>, defaults: Partial<T>, ...keys: (keyof T)[]) {
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

type CreateArg = boolean | 0 | 1 | "file" | "block"

interface InputOptions {
	create?: boolean
}

function createOpt(value: CreateArg, target: CreateArg): InputOptions | undefined {
	return value === 1 || value === true || value === target ? { create: true } : undefined
}

async function _input(file: string, opts?: InputOptions) {
	try {
		return file === "-" || file === undefined ? Deno.stdin : await Deno.open(file, { read: true })
	} catch (ex) {
		if (opts?.create) {
			return Deno.open("/dev/null", { read: true })
		}

		throw ex
	}
}

export interface BlockInFileOptions {
	after?: string | RegExp | boolean
	before?: string | RegExp | boolean
	comment: string
	create?: CreateArg
	debug?: boolean
	diff?: string | boolean
	dos?: boolean
	input?: string
	markerStart: string
	markerEnd: string
	name: string
	output?: string
}

export let defaults: BlockInFileOptions = {
	after: undefined,
	before: undefined,
	comment: "#",
	create: false,
	debug: false,
	diff: undefined,
	dos: false,
	input: undefined,
	markerStart: "start",
	markerEnd: "end",
	name: "blockinfile",
	output: undefined,
}
export function setDefaults(newDefaults: BlockInFileOptions) {
	defaults = newDefaults
}

export class BlockInFile {
	static defaults = defaults

	options: Partial<BlockInFileOptions>

	_input?: string

	constructor(options: Partial<BlockInFileOptions> = {}) {
		this.options = options
	}

	async run(filePath: string) {
		// deno-lint-ignore no-explicit-any
		const [input, output, _before, _after, start, end, comment, create, name, diff, dos] = get(
			this.options,
			(this.constructor as any).defaults || BlockInFile.defaults,
			"input",
			"output",
			"before",
			"after",
			"markerStart",
			"markerEnd",
			"comment",
			"create",
			"name",
			"diff",
			"dos",
		)
		if (_before && _after) {
			throw new Error("Cannot have both 'before' and 'after'")
		}

		// get the input block to insert
		if (!this._input) {
			const buffer = await readAll(await _input(input, createOpt(create, "block")))
			const decoder = new TextDecoder()
			this._input = decoder.decode(buffer)
		}

		const before = typeof (_before) === "string" ? new RegExp(_before) : _before
		const after = typeof (_after) === "string" ? new RegExp(_after) : _after
		const match = before || after
		const opener = `${comment} ${name} ${start}`
		const closer = `${comment} ${name} ${end}`
		const outputs = [] // output lines
		const diffBuffer = diff ? new Array<string>() : undefined

		// read each line
		const lines = readLines(await _input(filePath, createOpt(create, "file")))
		let done = false // have inserted input
		let opened: number | undefined // where we found an existing block
		let matched = -1 // where we found a match
		let i = -1

		//if (before === true) {
		//	outputs.push(opener, this._input, closer)
		//	done = true
		//}
		for await (const line of lines) {
			const isOpen = opened !== undefined
			i++
			diffBuffer?.push(line)

			// open block
			if (!isOpen && line === opener) {
				opened = outputs.length
				// look for close block
			} else if (isOpen) {
				if (line !== closer) {
					// still looking for close
					continue
				}

				// close
				opened = undefined

				if (done) {
					// we already printed our results once, skip
					continue
				}

				// replace the first block we find
				// eliminate future blocks
				outputs.push(opener, this._input, closer)
				done = true
			} else {
				// save line
				outputs.push(line)

				// look for first match if not done
				if (!done && matched === -1 && match?.test?.(line)) {
					matched = i
				}
			}
		}
		// was left uncompleted, terminate
		if (opened !== undefined) {
			outputs.push(opener, this._input, closer)
			done = true
		}
		// no existing blocks but match found
		if (!done) {
			if (matched === -1) {
				// insert at end
				matched = i
			}
			outputs.splice(matched + (after ? 1 : 0), 0, opener, this._input, closer)
		}

		if (outputs[outputs.length] !== "") {
			// end of line
			outputs.push("")
		}

		const outputText = outputs.join(dos ? "\r\n" : "\n")

		// write
		if (!output || output === "---") {
			await Deno.writeTextFile(filePath, outputText)
		} else if (output === "--") {
			// do nothing
		} else if (output === "-") {
			console.log(outputText)
		} else {
			await Deno.writeTextFile(output, outputText)
		}

		//if (this.diff) {
		//	// stderr by default but configurable
		//	await _diff()
		//}
	}
}

if (import.meta.main) {
	import("./cliffy.ts").then((cliffy) => cliffy.main())
}
