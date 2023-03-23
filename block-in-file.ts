#!/usr/bin/env deno
import {readLines} from "https://deno.land/std/io/mod.ts"

export interface BlockInFileOptions {
		after?: string | RegExp
		before?: string | RegExp
		comment: string 
		debug: boolean
		diff: boolean
		markerStart: string
		markerEnd: string
		name: string
}

export let defaults: BlockInFileOptions = {
	after: undefined,
	before: undefined,
	comment: "#",
	debug: false,
	diff: false,
	input: "-",
	markerStart: "BLOCKINFILE START",
	markerEnd: "BLOCKINFILE END",
	name: "blockinfile",
	output: "-",
}

export class BlockInFile implements BlockInFileOptions {
	static defaults = defaults

	after: string | RegExp = BlockInFile.defaults.after
	before: string | RegExp = BlockInFile.defaults.before
	comment: string = BlockInFile.defaults.comment
	debug: boolean = BlockInFile.defaults.debug
	diff: boolean = BlockInFile.defaults.diff
	input: boolean = BlockInFile.defaults.input
	markerStart: string = BlockInFile.defaults.markerStart
	markerEnd: string = BlockInFile.defaults.markerEnd
	name: string = BlockInFile.defaults.name
	output: boolean = BlockInFile.defaults.output

	_lines: string[] = []
	_after: RegExp
	_before: RegExp
	_start: number
	_end: number

	constructor(opts: Partial<BlockInFileOptions> = {}) {
		let { before, after } = opts
		if (after && typeof(after) === "string") {
			after = new RegExp(after)
		}
		if (before) {
			if (after) {
				throw new Error("Can only have 'after' or 'before', but have both")
			}
			if (typeof(before) === "string") {
				before = new RegExp(before)
			}
		}

		Object.assign(this, opts, {
			_after: after,
			_before: before,
		});
	}

	async _run() {
		await _readLines()
		if (this.diff) {
			await _diff()
		}
		await _replace()
		await _write()
	}

	async _readLines() {
		const decoder = new TextDecoder();
		for await (const chunk of Deno.stdin.readable) {
			const text = decoder.decode(chunk);
			// do something with the text
		}
		const f=await Deno.open('./testdata/sample2.txt');
		for await(const l of readLines(f)) {
		  console.log('Processing:', l);
			
		}
	}

	async _replace() {
	}

	async _write() {
	}
}

if (import.meta.main) {
	//(await import("./main.ts")).run(Deno.env)
	(await import("./cliffy.ts"))
}
