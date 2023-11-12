import { readFile, writeFile, access } from "fs/promises"
import { programmParser } from "./parser"
import { printError } from "./helpers"
import { Command, CommandOptions, program } from "commander"
import { constants } from "fs"
import { typeCheck } from "./typecheck"
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

function replaceExtension(path: string, newExtension: string) {
	const splitFile: string[] = path.split(".")

	splitFile.splice(-1)

	splitFile.push(newExtension)

	return splitFile.join(".")
}

async function main() {
	const options = await getOptions()

	const fileName = options.file

	if (!access(fileName, constants.R_OK)) {
		console.error(`File '${fileName}' doesn't exist!`)
		process.exit(1)
	}

	const fileData = (await readFile(fileName)).toString()

	// parse
	const parsed = programmParser.run(fileData)

	if (parsed.isError) {
		printError(fileName, parsed, fileData)
		process.exit(2)
	}

	console.log(`Successfully parsed '${fileName}' file.`)

	const program = parsed.result

	// typecheck
	const resolvedProgram = typeCheck(program)

	// generate

	if (options.command.type === "cpp") {
		const output = options.command.output ?? replaceExtension(fileName, "h")

		await writeFile(output, "// TODO cpp")
	} else if (options.command.type === "ts") {
		const output =
			options.command.output ?? replaceExtension(fileName, "d.ts")

		await writeFile(output, "// TODO ts")
	} else {
		throw new Error("UNREACHABLE")
	}
}

main()
