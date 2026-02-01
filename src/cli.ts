#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --ext ts
import { Command, EnumType } from "https://deno.land/x/cliffy@v0.25.7/command/mod.ts"
import { BlockInFile } from "./block-in-file.ts"

const createArg = new EnumType(["file", "block", true, false])

export default async function main(args = Deno.args) {
	return await new Command()
		.name("blockinfile")
		.version("0.1.0")
		.description("Insert & update blocks of text in file")
		.env("DEBUG=<debug:boolean>", "Enable debug output.")
		.type("createArg", createArg)
		.option("-d, --debug", "Enable debug output.")
		.option("-n, --name <name:string>", "Name for block", { default: "blockinfile" })
		.option("-c, --comment <comment:string>", "Comment string for marker", { default: "#" })
		.option("--marker-end <end:string>", "Marker for end", { default: "end" })
		.option("--marker-start <start:string>", "Marker for start", { default: "start" })
		.option("-D, --diff [output:string]", "Print diff")
		.option("--dos", "Use dos line endings")
		.option("-i, --input <input:file>", "Input file to read contents from, or - from stdout", { default: "-" })
		.option("-o, --output <output:file>", "Output file, or - for stdout, or -- for no output, or --- for overwriting existing file", { default: "---" })
		.option("-b, --before [before:string]", "String or regex to insert before, or at beginning if no argument")
		.option("-a, --after [after:string]", "String or regex to insert after, or at end if no argument")
		.option("-C, --create [create:createArg]", "Create file or block if missing")
		.option("--backup", "Backup file if changes (not implemented)")
		.option("--last", "Place after last match instead of first (not implemented)")
		.option("--multi", "Multi-line matching (not implemented)")
		.arguments("[file_or_-:file]")
		.action(async (options, ...files) => {
			if (files.length === 0) {
				if (/^--?-?$/.test(options.output || "")) {
					throw new Error("Need output of some kind")
				}
				files = [options.output]
			}
			const bif = new BlockInFile(options)
			const runs = files.map((file) => bif.run(file!))
			await Promise.all(runs)
		})
		.parse(args)
}

export { main }

import { realpath } from "node:fs/promises"
realpath(process.argv[1]).then(async (realPath) => {
	if (realPath === import.meta.filename) {
		main()
	}
})
