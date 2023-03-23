#!/usr/bin/env -S deno eval
import { readLines } from "https://deno.land/std/io/mod.ts"
import { readAll } from "https://deno.land/std/streams/read_all.ts"

function get<T>(source: Partial<T>, defaults: Partial<T>, ...keys: (keyof T)[]) {
	if (keys.length === 1) {
		const key = keys[0]
		const o = source[key]
		return (o !== undefined ? o : defaults[key]) as any
	}

	var o = new Array(keys.length)
	for (let i in keys) {
		o[i] = get(source, defaults, keys[i])
	}
	return o
}

async function _input(file: string) {
	return file === "-" || file === undefined ? Deno.stdin : await Deno.open(file, { read: true })
}

export interface BlockInFileOptions {
		after?: string | RegExp | boolean
		before?: string | RegExp | boolean
		comment: string
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
	debug: false,
	diff: undefined,
	dos: false,
	input: undefined,
	markerStart: "start",
	markerEnd: "end",
	name: "blockinfile",
	output: undefined,
}

export class BlockInFile {
	static defaults = defaults

	options: Partial<BlockInFileOptions>

	_input?: string

	constructor(options: Partial<BlockInFileOptions> = {}) {
		this.options = options
	}

	async run(filePath: string) {
		const [input, output, _before, _after, start, end, comment, name, diff, dos] = get(this.options, (this.constructor as any).defaults || BlockInFile.defaults, "input", "output", "before", "after", "markerStart", "markerEnd", "comment", "name", "diff", "dos")
		if (_before && _after) {
			throw new Error("Cannot have both 'before' and 'after'")
		}

		// get the input block to insert
		if (!this._input) {
			const buffer = await readAll(await _input(input))
			const decoder = new TextDecoder()
			this._input = decoder.decode(buffer)
		}

		const before = typeof(_before) === "string" ? new RegExp(_before) : _before
		const after = typeof(_after) === "string" ? new RegExp(_after) : _after
		const match = before || after
		const opener = `${comment} ${name} ${start}`
		const closer = `${comment} ${name} ${end}`
		const outputs = [] // output lines
		const diffBuffer = diff ? new Array<string>() : undefined

		// read each line
		const lines = readLines(await _input(filePath))
		let done = false // have inserted input
		let opened: number | undefined // where we found an existing block

		if (before === true) {
			outputs.push(opener, this._input, closer)
			done = true
		}
		for await (const line of lines) {
			diffBuffer?.push(line)

			if (!done && match?.test?.(line)) {
				if (before) {
					outputs.push(opener, this._input, closer, line)
				} else {
					outputs.push(line, opener, this._input, closer)
				}
				done = true
				continue
			}

			if (opened === undefined && line === opener) {
				opened = outputs.length
			} else if (opened && line === closer) {
				if (!done && !before && !after) {
					// replace the first block we find
					outputs.push(opener, this._input, closer)
					done = true
				}
				opened = undefined
				continue
			}

			if (!opened) {
				// copy in any line other than existing blocks
				outputs.push(line)
			}
		}
		if (after === true || !done) {
			outputs.push(opener, this._input, closer)
			done = true
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
	//(await import("./main.ts")).run(Deno.env)
	//(await import("./cliffy.ts")).main()
	import("./cliffy.ts").then(cliffy => cliffy.main())
}
