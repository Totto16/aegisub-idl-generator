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
		string | RType,
		string | undefined
	>
) => {
	return succeedWith<string, string, string>("").chain(
		(a: string | undefined): Parser<string, string, string> => {
			const iterator: CustomGenerator<
				Parser<any, string, string>,
				string | RType,
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

const customTypeName = regex(/^[A-Z]{1}[a-zA-Z0-9]*/)

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

export function getProgrammParser() {
	const commentParser = regex(/^\s*--(.*)\s*$/)

	const typeParser: Parser<Type | string, string, any> = contextual(
		function* (): CustomGenerator<Parser<any, string, any>, Type, string> {
			yield str("type")

			yield whitespace

			const name = yield customTypeName

			yield optionalWhitespace

			yield char("=")

			yield optionalWhitespace

			const resolvedValue = (yield choice([
				customTypeName,
				getInternalTypeParser(),
			])) as AllInternalTypes | CustomType

			return {
				name,
				resolvedValue,
			}
		}
	)

	const objectParser = char("!")

	const moduleParser = char("?")

	const topLevelParser = choice([
		commentParser,
		typeParser,
		objectParser,
		moduleParser,
	])

	const finalParser = sepBy(char("\n"))(topLevelParser)
	return finalParser
}
