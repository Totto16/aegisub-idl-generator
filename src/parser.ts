import {
	Parser,
	choice,
	char,
	sepBy,
	regex,
	str,
	succeedWith,
	sequenceOf,
	endOfInput,
	lookAhead,
	recursiveParser,
} from "arcsecond"
import {
	CustomGenerator,
	contextual,
	optionalWhitespace,
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

interface OptionalType {
	__type: "optional"
	type: TopLevelType
}

const customTypeName = regex(/^[A-Z]{1}[a-zA-Z0-9]*/)
	.errorMap((err) => {
		return err.error.replace(
			"matching '/^[A-Z]{1}[a-zA-Z0-9]*/'",
			"to be a custom type name (starts with"
		)
	})
	.map((name): TopLevelType => ({ type: "customTypeName", name }))

function getInternalTypeParser() {
	const literalParser = (
		name: LiteralKeys
	): Parser<TopLevelType, string, any> => {
		return str(name).map((): TopLevelType => ({ type: name }))
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
				arrayParser,
			])
	)
}

const arrayParser: Parser<TopLevelType, string, any> = contextual(
	function* (): CustomGenerator<
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
	}
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

function untilEndOfInput<T>(parser: Parser<T, string, any>) {
	return contextual<T[]>(function* (): CustomGenerator<
		Parser<T, string, any>,
		T[],
		any
	> {
		const result: T[] = []
		while (true) {
			const isEndOfInput: "no" | null = yield lookAhead(
				endOfInput
			).errorChain(() => succeedWith("no")) as Parser<T, string, any>

			if (isEndOfInput === null) {
				break
			}

			const value: T = yield parser
			result.push(value)
		}

		return result
	})
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
				sequenceOf([
					lookAhead(regex(/^[a-z]{1}/)),
					getInternalTypeParser(),
				]).map(([_, type]) => type),
				customTypeName,
			])

			yield optionalWhitespace
			yield newLine

			return {
				name: name.name,
				content,
			}
		}).map(({ name, content }): TopLevelType => {
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
		sequenceOf([lookAhead(str("type")), typeParser]).map(
			([_, type]) => type
		),
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
