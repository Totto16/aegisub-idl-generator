import fs from "fs"
import { programmParser } from "./parser"
import { printError } from "./helpers"
import { Command, CommandOptions, program } from "commander"
const packageInfo = require("../package.json")

interface TSCommand {
	type: "ts"
	output?: string
}

interface CppCommand {
	type: "cpp"
	output?: string
}

type ProgramCommand = CppCommand | TSCommand

interface Options {
	file: string
	command: ProgramCommand
}

async function getOptions(): Promise<Options> {
	return new Promise((resolve) => {
		program
			.name(packageInfo.name)
			.description(packageInfo.description)
			.version(packageInfo.version)

		program
			.command("cpp")
			.description("generate a CPP header file")
			.argument("<file>", "The file to process")
			.option("-o, --output <string>", "the output file name")
			.action(
				(
					file: string,
					{ output }: { output?: string },
					command: Command
				) => {
					resolve({
						file,
						command: { type: "cpp", output },
					})
				}
			)

		program
			.command("ts")
			.description("generate a ts type declaration file")
			.argument("<file>", "The file to process")
			.option("-o, --output <string>", "the output file name")
			.action(
				(
					file: string,
					{ output }: { output?: string },
					command: Command
				) => {
					resolve({
						file,
						command: { type: "ts", output },
					})
				}
			)

		program.parse()
	})
}

async function main() {
	const options = await getOptions()

	const file = options.file

	if (!fs.existsSync(file)) {
		console.error(`File '${file}' doesn't exist!`)
		process.exit(1)
	}

	const fileData = fs.readFileSync(file).toString()

	// parse
	const parsed = programmParser.run(fileData)

	if (parsed.isError) {
		printError(file, parsed, fileData)
		process.exit(2)
	}

	console.log(`Successfully parsed '${file}' file.`)

	// typecheck

	// generate
}

main()
