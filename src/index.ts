import fs from "fs"
import { getProgrammParser } from "./parser"
import { printError } from "./helpers"

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
		printError(file, parsed, fileData)
		process.exit(1)
	}

	console.log(parsed.result)

	// typecheck

	// generate
}

main()
