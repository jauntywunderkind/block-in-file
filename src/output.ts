export function formatOutputs(outputs: string[], dos: boolean): string {
	if (outputs[outputs.length - 1] !== "") {
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
