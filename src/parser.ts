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
	untilParser,
	whitespace,
} from "./parsers"

interface ArrayType {
	type: "array"
	types: InternalType[]
}

interface OptionalType {
	type: "optional"
	content: InternalType
}

interface UnionType {
	type: "union"
	types: InternalType[]
}

interface ArgumentsType {
	type: "arguments"
	types: InternalType[]
}

interface FunctionType {
	type: "function"
	arguments: ArgumentsType | CustomNameType
	return: InternalType
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

type InternalType =
	| ArrayType
	| LiteralType
	| StringLiteralType
	| CustomNameType
	| OptionalType
	| UnionType
	| ArgumentsType
	| FunctionType

const customTypeNameParser = lookAheadSequenceIgnore(
	regex(/^[A-Z]{1}/),
	regex(/^[A-Z]{1}[a-zA-Z0-9_-]*/)
		.errorMap((err) => {
			return err.error.replace(
				"matching '/^[A-Z]{1}[a-zA-Z0-9]*/'",
				"to be a custom type name (starts with"
			)
		})
		.map((name): InternalType => ({ type: "customTypeName", name }))
)

const stringLiteralParser: Parser<InternalType, string, any> =
	lookAheadSequenceIgnore(
		char('"'),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			InternalType,
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
const literalParser = (
	name: LiteralKeys
): Parser<InternalType, string, any> => {
	return lookAheadSequenceIgnore(
		regex(/^[a-z]{1}/),
		str(name).map((): InternalType => ({ type: name }))
	)
}

const internalTypeParser = recursiveParser(
	(): Parser<InternalType, string, any> =>
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
			customTypeNameParser,
			stringLiteralParser,
			arrayParser,
			optionalParser,
			unionParser,
			argumentsParser,
			functionParser,
		])
)

const arrayParser: Parser<InternalType, string, any> = lookAheadSequenceIgnore(
	str("array"),
	contextual(function* (): CustomGenerator<
		Parser<any, string, any>,
		InternalType,
		string
	> {
		yield str("array")
		yield char("<")

		yield optionalWhitespace

		const types = (yield sepBy(sequenceOf([char(","), optionalWhitespace]))(
			internalTypeParser
		)) as unknown as InternalType[]

		yield optionalWhitespace

		yield char(">")
		return {
			type: "array",
			types,
		}
	})
)

const optionalParser: Parser<InternalType, string, any> =
	lookAheadSequenceIgnore(
		str("optional"),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			InternalType,
			string
		> {
			yield str("optional")
			yield char("<")

			yield optionalWhitespace

			const content =
				(yield internalTypeParser) as unknown as InternalType

			yield optionalWhitespace

			yield char(">")
			return {
				type: "optional",
				content,
			}
		})
	)

const unionParser: Parser<InternalType, string, any> = lookAheadSequenceIgnore(
	str("union"),
	contextual(function* (): CustomGenerator<
		Parser<any, string, any>,
		InternalType,
		string
	> {
		yield str("union")
		yield char("<")

		yield optionalWhitespace

		const types = (yield sepBy(sequenceOf([char(","), optionalWhitespace]))(
			internalTypeParser
		)) as unknown as InternalType[]

		yield optionalWhitespace

		yield char(">")
		return {
			type: "union",
			types,
		}
	})
)

const argumentsParser: Parser<InternalType, string, any> =
	lookAheadSequenceIgnore(
		str("arguments"),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			InternalType,
			string
		> {
			yield str("arguments")
			yield char("<")

			yield optionalWhitespace

			const types = (yield sepBy(
				sequenceOf([char(","), optionalWhitespace])
			)(internalTypeParser)) as unknown as InternalType[]

			yield optionalWhitespace

			yield char(">")
			return {
				type: "arguments",
				types,
			}
		})
	)

const functionParser: Parser<InternalType, string, any> =
	lookAheadSequenceIgnore(
		str("function"),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			InternalType,
			string
		> {
			yield str("function")
			yield char("<")

			yield optionalWhitespace

			const argumentsContent = (yield choice([
				argumentsParser,
				customTypeNameParser,
			])) as unknown as ArgumentsType | CustomNameType

			yield optionalWhitespace
			yield char(",")
			yield optionalWhitespace

			const returnContent =
				(yield internalTypeParser) as unknown as InternalType

			yield optionalWhitespace

			yield char(">")
			return {
				type: "function",
				arguments: argumentsContent,
				return: returnContent,
			}
		})
	)

const newLine = char("\n")

interface Property {
	name: string
	type: InternalType
}

const identifierParser = regex(/^[a-z]{1}[a-zA-Z0-9_-]*/)

const propertyParser: Parser<Property, string, any> = lookAheadSequenceIgnore(
	sequenceOf([optionalWhitespace, identifierParser]),
	contextual<Property>(function* (): CustomGenerator<
		Parser<any, string, any>,
		Property,
		any
	> {
		yield optionalWhitespace

		const name: string = yield identifierParser

		yield optionalWhitespace

		yield char(":")

		yield optionalWhitespace

		const type = (yield internalTypeParser) as unknown as InternalType

		yield optionalWhitespace
		yield newLine

		return {
			name: name,
			type,
		}
	})
)

// TOP level parsers

interface EmptyLine {
	type: "emptyLine"
}

interface Comment {
	type: "comment"
	content: string
}

interface Type {
	type: "type"
	name: string
	content: InternalType
}

interface Object {
	type: "object"
	name: string
	properties: Property[]
}

interface Module {
	type: "module"
	name: string
	properties: Property[]
}

type TopLevelResult = EmptyLine | Comment | Type | Object | Module

export interface Program {
	types: Type[]
	objects: Object[]
	modules: Module[]
}

const emptyLineParser = sequenceOf([optionalWhitespace, newLine]).map(
	(): TopLevelResult => ({
		type: "emptyLine",
	})
)

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
}).map((content): TopLevelResult => {
	return { type: "comment", content }
})

const typeParser: Parser<Type, string, any> = lookAheadSequenceIgnore(
	str("type"),
	contextual<Type>(function* (): CustomGenerator<
		Parser<any, string, any>,
		Type,
		any
	> {
		yield str("type")

		yield whitespace

		const { name }: CustomNameType = yield customTypeNameParser

		yield optionalWhitespace

		yield char("=")

		yield optionalWhitespace

		const content: InternalType = yield choice([
			internalTypeParser,
			customTypeNameParser,
		])

		yield optionalWhitespace
		yield newLine

		return {
			type: "type",
			name,
			content,
		}
	})
)

const objectParser: Parser<Object, string, any> = lookAheadSequenceIgnore(
	str("object"),
	contextual<Object>(function* (): CustomGenerator<
		Parser<any, string, any>,
		Object,
		any
	> {
		yield str("object")

		yield whitespace

		const { name }: CustomNameType = yield customTypeNameParser

		yield optionalWhitespace

		yield char("{")

		yield optionalWhitespace
		yield newLine

		const properties: Property[] = yield untilParser(
			propertyParser,
			sequenceOf([optionalWhitespace, char("}")])
		)

		yield optionalWhitespace
		yield char("}")
		yield optionalWhitespace
		yield newLine

		return {
			type: "object",
			name: name,
			properties,
		}
	})
)

const moduleParser: Parser<Module, string, any> = lookAheadSequenceIgnore(
	str("module"),
	contextual<Module>(function* (): CustomGenerator<
		Parser<any, string, any>,
		Module,
		any
	> {
		yield str("module")

		yield whitespace

		const name: string = yield identifierParser

		yield optionalWhitespace

		yield char("{")

		yield optionalWhitespace
		yield newLine

		const properties: Property[] = yield untilParser(
			propertyParser,
			sequenceOf([optionalWhitespace, char("}")])
		)

		yield optionalWhitespace
		yield char("}")
		yield optionalWhitespace
		yield newLine

		return {
			type: "module",
			name,
			properties,
		}
	})
)
const topLevelParser: Parser<TopLevelResult, string, any> = choice([
	emptyLineParser,
	commentParser,
	typeParser,
	objectParser,
	moduleParser,
])

export const programmParser = untilEndOfInput(topLevelParser).map(
	(dataArray: TopLevelResult[]): Program => {
		//console.log(dataArray)
		const types: Type[] = []
		const objects: Object[] = []
		const modules: Module[] = []
		for (const data of dataArray) {
			switch (data.type) {
				case "type":
					types.push(data)
					break
				case "object":
					objects.push(data)
					break
				case "module":
					modules.push(data)
					break
				default:
					break
			}
		}

		return {
			types,
			objects,
			modules,
		}
	}
)
