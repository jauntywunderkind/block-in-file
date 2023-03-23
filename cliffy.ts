import { Command, EnumType } from "https://deno.land/x/cliffy@v0.25.7/command/mod.ts";
import { BlockInFile } from "./block-in-file.ts"

export default async function main(args = Deno.args) {
	await new Command()
		.name("blockinfile")
		.version("0.1.0")
		.description("Insert & update blocks of text in file")
		.env("DEBUG=<debug:boolean>", "Enable debug output.")
		.option("-d, --debug", "Enable debug output.")
		.option("-n, --name <name:string>", "Name for block", { default: "blockinfile" })
		.option("-c, --comment <comment:string>", "Comment string for marker", { default: "#" })
		.option("--marker-end <end:string>", "Marker for end", { default: "end" })
		.option("--marker-start <start:string>", "Marker for start", { default: "start" })
		.option("-D, --diff <diff:string>", "Print diff")
		.option("--dos", "Use dos line endings")
		.option("-i, --input [input:string]", "Input file to read contents from, or - from stdout", { default: "-" })
		.option("-o, --output [output:string]", "Output file, or - for stdout, or -- for no output, or --- for overwriting existing file", {default: "---"})
		.option("-b, --before <regex:string>", "String or regex to insert before, or at beginning if no argument")
		.option("-a, --after <regex:string", "String or regex to insert after, or at end if no argument")
		.option("--multi", "Multi-line matching (not implemented)")
		.arguments("<files:string>")
		.action(async (options, ...files) => {
			console.log(options, files)
			options.markerStart = options.start
			delete options.start
			options.markerEnd = options.end
			delete options.end
			const bif = new BlockInFile(options)
			await Promise.all(files.map(file => bif.run(file)))
		})
		.parse(args)
}
export { main }
