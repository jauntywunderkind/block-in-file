#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --ext ts
export * from "./src/index.ts"

import { realpath } from "node:fs/promises"
realpath(process.argv[1]).then(async (realPath) => {
	if (realPath === import.meta.filename) {
		const { main } = await import("./src/cli.ts")
		main()
	}
})
