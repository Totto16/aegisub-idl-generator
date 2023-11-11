import fs from "fs"
import { getProgrammParser } from "./parser"
import { Err } from "arcsecond"

interface Offset {
	line: number
	offset: number
}

function parseOffset(content: string, inputOffset: number): Offset {
	let line = 0

	let count = 0

	for (const lineContent of content.split("\n")) {
		++line

		const length = lineContent.length

		if (inputOffset - count < length) {
			return {
				line,
				offset: inputOffset - count,
			}
		}

		count += length
	}
	return {
		line,
		offset: 0,
	}
}

function printError(error: Err<string, any>, content: string) {
	const { line, offset } = parseOffset(content, error.index)
	console.log(error, line, offset)
}

async function main() {
	//TODO: use "commander" to parse args so that the file and mode (c++ or ts generator) can be set

	if (process.argv.length != 3) {
		console.error("Missing filename")
		process.exit(1)
	}

	const file = process.argv[2]

	if (!fs.existsSync(file)) {
		console.error(`File ${file} doesn't exist!`)
		process.exit(1)
	}

	const fileData = fs.readFileSync(file).toString()

	// parse
	const programmParser = getProgrammParser()

	const parsed = programmParser.run(fileData)


	if (parsed.isError) {
		printError(parsed, fileData)
		process.exit(1)
	}

	console.log(parsed.result)

	// typecheck

	// generate
}

main()
