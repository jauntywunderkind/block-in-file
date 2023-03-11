import {Command, Flags} from 'npm:@oclif/core'

export class BlockInFile extends Command {
	static description = 'List the files in a directory.'
	static flags = {
		version: Flags.version(),
		help: Flags.help(),
		dir: Flags.string({
			char: 'd',
			default: process.cwd(),
		}),
	}

	async run(env = Deno.env) {
	}
}

export function run(env = Deno.env) {
	BlockInFile.run(env).then(() => {
		require('@oclif/core/flush')
	}, () => {
		require('@oclif/core/handle')
	})
}
