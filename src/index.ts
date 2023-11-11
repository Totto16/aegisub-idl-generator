import fs from "fs"
import { getProgrammParser } from "./parser"

async function main() {
	//TODO: use "commander" to parse args so that the file and mode (c++ or ts generator) can be set

	if (process.argv.length != 3) {
		throw new Error("Missing filename")
	}

	const file = process.argv[2]

	if (!fs.existsSync(file)) {
		throw new Error(`File ${file} doesn't exist!`)
	}

	const fileData = fs.readFileSync(file)

	// parse
	const programmParser = getProgrammParser()

	const parsed = programmParser.run(fileData)

	console.log(parsed)

	// typecheck

	// generate
}

main()
