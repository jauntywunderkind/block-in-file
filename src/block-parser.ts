import { TextLineStream } from "jsr:@std/streams/text-line-stream"
import type { ParseResult } from "./types.ts"

export interface ParseOptions {
	opener: string
	closer: string
	inputBlock: string
	before?: RegExp | boolean
	after?: RegExp | boolean
}

export async function parseAndInsertBlock(
	inputStream: Deno.FsFile | typeof Deno.stdin,
	opts: ParseOptions,
): Promise<ParseResult> {
	const { opener, closer, inputBlock, before, after } = opts
	const match = before || after
	const outputs: string[] = []

	const textStream = inputStream.readable.pipeThrough(new TextDecoderStream())
	const lines = textStream.pipeThrough(new TextLineStream())

	let done = false
	let opened: number | undefined
	let matched = -1
	let i = -1

	for await (const line of lines) {
		const isOpen = opened !== undefined
		i++

		if (!isOpen && line === opener) {
			opened = outputs.length
		} else if (isOpen) {
			if (line !== closer) {
				continue
			}

			opened = undefined

			if (done) {
				continue
			}

			outputs.push(opener, inputBlock, closer)
			done = true
		} else {
			outputs.push(line)

			if (!done && matched === -1 && typeof match === "object" && match?.test?.(line)) {
				matched = i
			}
		}
	}

	if (opened !== undefined) {
		outputs.push(opener, inputBlock, closer)
		done = true
	}

	if (!done) {
		if (matched === -1) {
			matched = i
		}
		outputs.splice(matched + (after ? 1 : 0), 0, opener, inputBlock, closer)
	}

	return { outputs, matched, opened }
}
