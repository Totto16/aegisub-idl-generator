import {
	Parser,
	choice,
	char,
	sepBy,
	regex,
	optionalWhitespace,
	str,
	possibly,
	succeedWith,
	letters,
	digits,
	sequenceOf,
	whitespace,
	many,
	endOfInput,
	lookAhead,
} from "arcsecond"

// only changed the type, so that next has to pass the value, no undefined allowed!
interface CustomGenerator<T = unknown, TReturn = any, TNext = unknown>
	extends Iterator<T, TReturn, TNext> {
	next(...args: [TNext]): IteratorResult<T, TReturn>
	return(value: TReturn): IteratorResult<T, TReturn>
	throw(e: any): IteratorResult<T, TReturn>
	[Symbol.iterator](): CustomGenerator<T, TReturn, TNext>
}

const contextual = <RType = any>(
	generatorFn: () => CustomGenerator<
		Parser<any, string, string>,
		RType,
		string | undefined
	>
): Parser<RType, string, any> => {
	return succeedWith<string, string, string>("").chain(
		(a: string | undefined): Parser<RType, string, string> => {
			const iterator: CustomGenerator<
				Parser<any, string, string>,
				RType,
				string
			> = generatorFn()

			const runStep: (
				nextValue: string
			) => Parser<any, string, string> = (nextValue) => {
				const { done, value } = iterator.next(nextValue)

				if (done) {
					return succeedWith(value)
				}
				if (!(value instanceof Parser)) {
					throw new Error(
						"contextual: yielded values must always be parsers!"
					)
				}
				const nextParser: Parser<any, string, string> = value

				return nextParser.chain(runStep)
			}

			return runStep("")
		}
	)
}

type StringType = "string"
type VoidType = "void"
type IntType = "int"
type FloatType = "float"
type NumberType = "number"
type BooleanType = "boolean"

type NullType = "null"
type UndefinedType = "undefined"
type FalseType = "false"
type TrueType = "true"
type StringLiteralType = "stringLiteral"

type LiteralType =
	| NullType
	| UndefinedType
	| FalseType
	| TrueType
	| StringLiteralType

interface ArrayType {
	__type: "array"
	types: InternalType[]
}

interface UnionType {
	__type: "union"
	types: InternalType[]
}

interface ArgumentType {
	__type: "argument"
	types: InternalType[]
}

interface FunctionType {
	__type: "function"
	arguments: ArgumentType
	return: InternalType
}

interface OptionalType {
	__type: "optional"
	type: InternalType
}

type InternalType =
	| StringType
	| VoidType
	| IntType
	| FloatType
	| NumberType
	| BooleanType
	| ArrayType
	| UnionType
	| FunctionType
	| LiteralType

type AllInternalTypes = InternalType | ArgumentType | OptionalType

interface CustomType {
	name: string
}

export interface Type {
	name: string
	resolvedValue: AllInternalTypes | CustomType
}

const customTypeName = regex(/^[A-Z]{1}[a-zA-Z0-9]*/).errorMap((err) => {
	return err.error.replace(
		"matching '/^[A-Z]{1}[a-zA-Z0-9]*/'",
		"to be a custom type name (starts with"
	)
})

const arrayParser: Parser<ArrayType | string, string, any> = contextual(
	function* (): CustomGenerator<Parser<any, string, any>, ArrayType, string> {
		yield str("array")
		yield char("<")

		yield optionalWhitespace

		const types = (yield sepBy(sequenceOf([char(","), optionalWhitespace]))(
			//TODO: use recursive parsers
			str("int") //internalTypeParser
		)) as unknown as InternalType[]

		yield optionalWhitespace

		yield char(">")
		return {
			__type: "array",
			types,
		}
	}
)

function getInternalTypeParser() {
	const internalTypeParser = choice([
		str("string"),
		str("void"),
		str("int"),
		str("float"),
		str("number"),
		str("boolean"),
		arrayParser,
	])

	return internalTypeParser
}

interface Module {
	//
}

interface Object {
	//
}

export interface Program {
	customTypes: Type[]
	objects: Object[]
	modules: Module[]
}

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
	content: Type
}

type TopLevelType = NewLineType | EmptyLineType | CommentType | CustomTypeType

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

export function getProgrammParser() {
	const commentParser = regex(/^(\s)*--(.*)(\s)*/).map((d): TopLevelType => {
		return { type: "comment", content: d }
	})

	const typeParser: Parser<TopLevelType, string, any> = contextual<Type>(
		function* (): CustomGenerator<Parser<any, string, any>, Type, string> {
			yield str("type")

			yield whitespace

			const name = yield customTypeName

			yield optionalWhitespace

			yield char("=")

			yield optionalWhitespace

			const resolvedValue = (yield choice([
				sequenceOf([
					lookAhead(regex(/^[a-z]{1}/)),
					getInternalTypeParser(),
				]).map(([_, type]) => type),
				customTypeName,
			])) as AllInternalTypes | CustomType

			return {
				name,
				resolvedValue,
			}
		}
	).map((a): TopLevelType => {
		return {
			type: "customType",
			content: a,
		}
	})

	const emptyLineParser = regex(/^\s*$/).map(
		(): TopLevelType => ({
			type: "emptyLine",
		})
	)
	const newLine = char("\n").map(
		(): TopLevelType => ({
			type: "newLine",
		})
	)

	const topLevelParser: Parser<TopLevelType, string, any> = choice([
		emptyLineParser,
		commentParser,
		sequenceOf([lookAhead(str("type")), typeParser]).map(
			([_, type]) => type
		),
		newLine,
		/* objectParser,
		moduleParser, */
	])

	const finalParser = untilEndOfInput(topLevelParser).map(
		(dataArray: TopLevelType[]): Program => {
			//console.log(dataArray)
			const customTypes: Type[] = []
			const modules: Module[] = []
			const objects: Object[] = []
			for (const data of dataArray) {
				switch (data.type) {
					case "customType":
						customTypes.push(data.content)
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
