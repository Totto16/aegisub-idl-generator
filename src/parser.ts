import {
	Parser,
	choice,
	char,
	sepBy,
	regex,
	str,
	succeedWith,
	sequenceOf,
	lookAhead,
	recursiveParser,
	anyChar,
} from "arcsecond"
import {
	CustomGenerator,
	contextual,
	lookAheadSequenceIgnore,
	optionalWhitespace,
	untilEndOfInput,
	whitespace,
} from "./parsers"

interface NewLineType {
	type: "newLine"
}

interface EmptyLineType {
	type: "emptyLine"
}

interface CommentType {
	type: "comment"
	content: string
}

interface CustomTypeType {
	type: "customType"
	name: string
	content: TopLevelType
}

interface ArrayType {
	type: "array"
	types: TopLevelType[]
}

interface OptionalType {
	type: "optional"
	content: TopLevelType
}

type LiteralKeys =
	| "string"
	| "void"
	| "int"
	| "float"
	| "number"
	| "boolean"
	| "null"
	| "undefined"
	| "false"
	| "true"
interface LiteralType {
	type: LiteralKeys
}

interface StringLiteralType {
	type: "stringLiteral"
	value: string
}

interface CustomNameType {
	type: "customTypeName"
	name: string
}

export interface CustomType {
	name: string
	content: TopLevelType
}

type TopLevelType =
	| NewLineType
	| EmptyLineType
	| CommentType
	| CustomTypeType
	| ArrayType
	| LiteralType
	| StringLiteralType
	| CustomNameType
	| OptionalType

interface UnionType {
	__type: "union"
	types: TopLevelType[]
}

interface ArgumentType {
	__type: "argument"
	types: TopLevelType[]
}

interface FunctionType {
	__type: "function"
	arguments: ArgumentType
	return: TopLevelType
}

const customTypeName = lookAheadSequenceIgnore(
	regex(/^[A-Z]{1}/),
	regex(/^[A-Z]{1}[a-zA-Z0-9]*/)
		.errorMap((err) => {
			return err.error.replace(
				"matching '/^[A-Z]{1}[a-zA-Z0-9]*/'",
				"to be a custom type name (starts with"
			)
		})
		.map((name): TopLevelType => ({ type: "customTypeName", name }))
)

const stringLiteralParser: Parser<TopLevelType, string, any> =
	lookAheadSequenceIgnore(
		char('"'),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			TopLevelType,
			string
		> {
			yield char('"')

			const result: string[] = []

			while (true) {
				const isPotentialEnd: "no" | '"' | string = yield lookAhead(
					char('"')
				).errorChain(() => succeedWith("no"))

				//TODO: in typecheck chek if all escape sequences inside the string are valid e.g. \n vs \i vs \\i

				if (isPotentialEnd === "no") {
					result.push(yield anyChar)
				} else {
					if (result.at(-1) === "\\") {
						result.push(yield char('"'))
					} else {
						break
					}
				}
			}

			yield char('"')

			return {
				type: "stringLiteral",
				value: result.join(""),
			}
		})
	)

function getInternalTypeParser() {
	const literalParser = (
		name: LiteralKeys
	): Parser<TopLevelType, string, any> => {
		return lookAheadSequenceIgnore(
			regex(/^[a-z]{1}/),
			str(name).map((): TopLevelType => ({ type: name }))
		)
	}

	return recursiveParser(
		(): Parser<TopLevelType, string, any> =>
			choice([
				literalParser("string"),
				literalParser("void"),
				literalParser("int"),
				literalParser("float"),
				literalParser("number"),
				literalParser("boolean"),
				literalParser("null"),
				literalParser("undefined"),
				literalParser("false"),
				literalParser("true"),
				stringLiteralParser,
				arrayParser,
				optionalParser,
			])
	)
}

const arrayParser: Parser<TopLevelType, string, any> = lookAheadSequenceIgnore(
	str("array"),
	contextual(function* (): CustomGenerator<
		Parser<any, string, any>,
		TopLevelType,
		string
	> {
		yield str("array")
		yield char("<")

		yield optionalWhitespace

		const types = (yield sepBy(sequenceOf([char(","), optionalWhitespace]))(
			getInternalTypeParser()
		)) as unknown as TopLevelType[]

		yield optionalWhitespace

		yield char(">")
		return {
			type: "array",
			types,
		}
	})
)

const optionalParser: Parser<TopLevelType, string, any> =
	lookAheadSequenceIgnore(
		str("optional"),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			TopLevelType,
			string
		> {
			yield str("optional")
			yield char("<")

			yield optionalWhitespace

			const content =
				(yield getInternalTypeParser()) as unknown as TopLevelType

			yield optionalWhitespace

			yield char(">")
			return {
				type: "optional",
				content,
			}
		})
	)

interface Module {
	//
}

interface Object {
	//
}

export interface Program {
	customTypes: CustomType[]
	objects: Object[]
	modules: Module[]
}

const newLine = char("\n").map(
	(): TopLevelType => ({
		type: "newLine",
	})
)

export function getProgrammParser() {
	const commentParser = contextual(function* (): CustomGenerator<
		Parser<any, string, any>,
		string,
		string
	> {
		yield optionalWhitespace

		yield str("--")

		yield optionalWhitespace

		const content = yield regex(/^[^\n]*/)

		yield newLine

		return content
	}).map((content): TopLevelType => {
		return { type: "comment", content }
	})

	const typeParser: Parser<TopLevelType, string, any> =
		lookAheadSequenceIgnore(
			str("type"),
			contextual<CustomType>(function* (): CustomGenerator<
				Parser<any, string, any>,
				CustomType,
				any
			> {
				yield str("type")

				yield whitespace

				const name: CustomNameType = yield customTypeName

				yield optionalWhitespace

				yield char("=")

				yield optionalWhitespace

				const content: TopLevelType = yield choice([
					getInternalTypeParser(),
					customTypeName,
				])

				yield optionalWhitespace
				yield newLine

				return {
					name: name.name,
					content,
				}
			})
		).map(({ name, content }): TopLevelType => {
			return {
				type: "customType",
				name,
				content,
			}
		})

	const emptyLineParser = sequenceOf([optionalWhitespace, newLine]).map(
		(): TopLevelType => ({
			type: "emptyLine",
		})
	)

	const topLevelParser: Parser<TopLevelType, string, any> = choice([
		commentParser,
		typeParser,
		emptyLineParser,
		/* objectParser,
		moduleParser, */
	])

	const finalParser = untilEndOfInput(topLevelParser).map(
		(dataArray: TopLevelType[]): Program => {
			//console.log(dataArray)
			const customTypes: CustomType[] = []
			const modules: Module[] = []
			const objects: Object[] = []
			for (const data of dataArray) {
				switch (data.type) {
					case "customType":
						customTypes.push({
							name: data.name,
							content: data.content,
						})
						break

					default:
						break
				}
			}

			return {
				customTypes,
				modules,
				objects,
			}
		}
	)

	return finalParser
}
