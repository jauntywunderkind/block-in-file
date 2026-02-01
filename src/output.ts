export function formatOutputs(outputs: string[], dos: boolean): string {
	if (outputs.length === 0 || outputs[outputs.length - 1] !== "") {
		outputs.push("")
	}
	return outputs.join(dos ? "\r\n" : "\n")
}

export async function writeOutput(outputText: string, output: string | undefined, filePath: string): Promise<void> {
	if (!output || output === "---") {
		await Deno.writeTextFile(filePath, outputText)
	} else if (output === "--") {
		// no output
	} else if (output === "-") {
		console.log(outputText)
	} else {
		await Deno.writeTextFile(output, outputText)
	}
}

export function generateDiff(original: string, modified: string, filePath: string): string {
	const originalLines = original.split("\n")
	const modifiedLines = modified.split("\n")
	const output: string[] = []

	output.push(`--- ${filePath}`)
	output.push(`+++ ${filePath}`)

	let i = 0
	let j = 0

	while (i < originalLines.length || j < modifiedLines.length) {
		if (i < originalLines.length && j < modifiedLines.length && originalLines[i] === modifiedLines[j]) {
			output.push(` ${originalLines[i]}`)
			i++
			j++
		} else {
			const origStart = i
			const modStart = j

			while (i < originalLines.length && (j >= modifiedLines.length || originalLines[i] !== modifiedLines[j])) {
				let found = false
				for (let k = j; k < Math.min(j + 10, modifiedLines.length); k++) {
					if (originalLines[i] === modifiedLines[k]) {
						found = true
						break
					}
				}
				if (found) break
				i++
			}

			while (j < modifiedLines.length && (i >= originalLines.length || modifiedLines[j] !== originalLines[i])) {
				let found = false
				for (let k = i; k < Math.min(i + 10, originalLines.length); k++) {
					if (modifiedLines[j] === originalLines[k]) {
						found = true
						break
					}
				}
				if (found) break
				j++
			}

			for (let k = origStart; k < i; k++) {
				output.push(`-${originalLines[k]}`)
			}
			for (let k = modStart; k < j; k++) {
				output.push(`+${modifiedLines[k]}`)
			}
		}
	}

	return output.join("\n")
}

export async function writeDiff(
	diff: string | boolean | undefined,
	originalContent: string,
	newContent: string,
	filePath: string,
): Promise<void> {
	if (!diff) return

	const diffText = generateDiff(originalContent, newContent, filePath)

	if (diff === true || diff === "-") {
		console.error(diffText)
	} else {
		await Deno.writeTextFile(diff, diffText)
	}
}
