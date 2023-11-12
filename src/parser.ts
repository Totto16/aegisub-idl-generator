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

type EmptyObject = Record<string, never>

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

export interface StringLiteralType {
	type: "stringLiteral"
	value: string
}

interface ArrayType<T extends boolean = true> {
	type: "array"
	types: InternalTypeTemplate<T>[]
}

interface OptionalType<T extends boolean = true> {
	type: "optional"
	content: InternalTypeTemplate<T>
}

export interface UnionType<
	T extends boolean = true,
	TT extends InternalTypeTemplate<T> = InternalTypeTemplate<T>
> {
	type: "union"
	types: TT[]
}

export interface ArgumentsType<T extends boolean = true> {
	type: "arguments"
	types: InternalTypeTemplate<T>[]
}

interface FunctionType<T extends boolean = true> {
	type: "function"
	arguments:
		| ArgumentsType<T>
		| (T extends true ? CustomNameType : never)
		| UnionType<T, ArgumentsType<T>>
	return: InternalTypeTemplate<T>
}

export interface CustomNameType {
	type: "customTypeName"
	name: string
}

interface ObjectType<T extends boolean = true> {
	type: "object"
	properties: Property<T>[]
}

export type InternalTypeTemplate<T extends boolean> =
	| LiteralType
	| StringLiteralType
	| ArrayType<T>
	| OptionalType<T>
	| UnionType<T>
	| ArgumentsType<T>
	| FunctionType<T>
	| ObjectType<T>
	| (T extends true ? CustomNameType : never)

export type InternalType = InternalTypeTemplate<true>

export type InternalTypeWithoutCustomNames = InternalTypeTemplate<false>

const customTypeNameParser: Parser<InternalType, string, EmptyObject> =
	lookAheadSequenceIgnore(
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

const stringLiteralParser: Parser<InternalType, string, EmptyObject> =
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
): Parser<InternalType, string, EmptyObject> => {
	return lookAheadSequenceIgnore(
		regex(/^[a-z]{1}/),
		str(name).map((): InternalType => ({ type: name }))
	)
}

const internalTypeParser: Parser<InternalType, string, EmptyObject> =
	recursiveParser(
		(): Parser<InternalType, string, EmptyObject> =>
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

const arrayParser: Parser<InternalType, string, EmptyObject> =
	lookAheadSequenceIgnore(
		str("array"),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			InternalType,
			any
		> {
			yield str("array")
			yield char("<")

			yield optionalWhitespace

			const types: InternalType[] = yield sepBy(
				sequenceOf([char(","), optionalWhitespace])
			)(internalTypeParser)

			yield optionalWhitespace

			yield char(">")
			return {
				type: "array",
				types,
			}
		})
	)

const optionalParser: Parser<InternalType, string, EmptyObject> =
	lookAheadSequenceIgnore(
		str("optional"),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			InternalType,
			any
		> {
			yield str("optional")
			yield char("<")

			yield optionalWhitespace

			const content: InternalType = yield internalTypeParser

			yield optionalWhitespace

			yield char(">")
			return {
				type: "optional",
				content,
			}
		})
	)

const unionParser: Parser<InternalType, string, EmptyObject> =
	lookAheadSequenceIgnore(
		str("union"),
		contextual(function* (): CustomGenerator<
			Parser<any, string, string>,
			InternalType,
			any
		> {
			yield str("union")
			yield char("<")

			yield optionalWhitespace

			const types: InternalType[] = yield sepBy(
				sequenceOf([char(","), optionalWhitespace])
			)(internalTypeParser)

			yield optionalWhitespace

			yield char(">")
			return {
				type: "union",
				types,
			}
		})
	)

const argumentsParser: Parser<InternalType, string, EmptyObject> =
	lookAheadSequenceIgnore(
		str("arguments"),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			InternalType,
			any
		> {
			yield str("arguments")
			yield char("<")

			yield optionalWhitespace

			const types: InternalType[] = yield sepBy(
				sequenceOf([char(","), optionalWhitespace])
			)(internalTypeParser)

			yield optionalWhitespace

			yield char(">")
			return {
				type: "arguments",
				types,
			}
		})
	)

const functionParser: Parser<InternalType, string, EmptyObject> =
	lookAheadSequenceIgnore(
		str("function"),
		contextual(function* (): CustomGenerator<
			Parser<any, string, any>,
			InternalType,
			any
		> {
			yield str("function")
			yield char("<")

			yield optionalWhitespace

			const argumentsContent: ArgumentsType | CustomNameType =
				yield choice([argumentsParser, customTypeNameParser])

			yield optionalWhitespace
			yield char(",")
			yield optionalWhitespace

			const returnContent: InternalType = yield internalTypeParser

			yield optionalWhitespace

			yield char(">")
			return {
				type: "function",
				arguments: argumentsContent,
				return: returnContent,
			}
		})
	)

const newLine: Parser<string, string, EmptyObject> = char("\n")

export interface Property<T extends boolean = true> {
	name: string
	type: InternalTypeTemplate<T>
}

const identifierParser = regex(/^[a-z]{1}[a-zA-Z0-9_-]*/)

const propertyParser: Parser<Property, string, EmptyObject> =
	lookAheadSequenceIgnore(
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

			const type: InternalType = yield internalTypeParser

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

type TypeOrigin = "alias" | "object"

interface Type<T extends boolean = true> {
	type: "type"
	origin: TypeOrigin
	name: string
	content: InternalTypeTemplate<T>
}
interface Module<T extends boolean = true> {
	type: "module"
	name: string
	properties: Property<T>[]
}

type TopLevelResult = EmptyLine | Comment | Type | Module

export class Program<T extends boolean = true> {
	types: Type<T>[]
	modules: Module<T>[]

	constructor(types: Type<T>[], modules: Module<T>[]) {
		this.types = types
		this.modules = modules
	}

	prettyPrint(indentation: number = 4): void {
		console.log(
			JSON.stringify(
				{ types: this.types, modules: this.modules },
				undefined,
				indentation
			)
		)
	}
}

const emptyLineParser: Parser<TopLevelResult, string, EmptyObject> = sequenceOf(
	[optionalWhitespace, newLine]
).map(
	(): TopLevelResult => ({
		type: "emptyLine",
	})
)

const commentParser: Parser<TopLevelResult, string, EmptyObject> = contextual(
	function* (): CustomGenerator<Parser<any, string, any>, string, string> {
		yield optionalWhitespace

		yield str("--")

		yield optionalWhitespace

		const content = yield regex(/^[^\n]*/)

		yield newLine

		return content
	}
).map((content): TopLevelResult => {
	return { type: "comment", content }
})

const typeParser: Parser<Type, string, EmptyObject> = lookAheadSequenceIgnore(
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
			origin: "alias",
			name,
			content,
		}
	})
)

const objectParser: Parser<Type, string, EmptyObject> = lookAheadSequenceIgnore(
	str("object"),
	contextual<Type>(function* (): CustomGenerator<
		Parser<any, string, any>,
		Type,
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
			type: "type",
			origin: "object",
			name: name,
			content: {
				type: "object",
				properties,
			},
		}
	})
)

const moduleParser: Parser<Module, string, EmptyObject> =
	lookAheadSequenceIgnore(
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
const topLevelParser: Parser<TopLevelResult, string, EmptyObject> = choice([
	emptyLineParser,
	commentParser,
	typeParser,
	objectParser,
	moduleParser,
])

//TODO: store in teh data the source line for each token, so that we can produce better errors later in the typecheck phase

export const programmParser: Parser<Program, string, EmptyObject> =
	untilEndOfInput(topLevelParser).map(
		(dataArray: TopLevelResult[]): Program => {
			//console.log(dataArray)
			const types: Type[] = []
			const modules: Module[] = []
			for (const data of dataArray) {
				switch (data.type) {
					case "type":
						types.push(data)
						break
					case "module":
						modules.push(data)
						break
					default:
						break
				}
			}

			return new Program(types, modules)
		}
	)
