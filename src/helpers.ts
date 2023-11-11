import { Err } from "arcsecond"

interface Offset {
	line: number
	offset: number
}

function parseOffset(content: string, inputOffset: number): Offset {
	let line = 1

	let count = 0

	for (const lineContent of content.split("\n")) {
		const length = lineContent.length + 1

		if (inputOffset - count < length) {
			return {
				line,
				offset: inputOffset - count + 1,
			}
		}

		++line
		count += length
	}
	return {
		line,
		offset: 0,
	}
}

export function printError(
	fileName: string,
	error: Err<string, any>,
	content: string
) {
	const { line, offset } = parseOffset(content, error.index)
	console.log(error.error)
	console.log(`In '${fileName}:${line}:${offset}'`)
}
