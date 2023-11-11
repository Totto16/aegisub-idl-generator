import {
	Parser,
	char,
	lookAhead,
	possibly,
	regex,
	succeedWith,
} from "arcsecond"

// only changed the type, so that next has to pass the value, no undefined allowed!
export interface CustomGenerator<T = unknown, TReturn = any, TNext = unknown>
	extends Iterator<T, TReturn, TNext> {
	next(...args: [TNext]): IteratorResult<T, TReturn>
	return(value: TReturn): IteratorResult<T, TReturn>
	throw(e: any): IteratorResult<T, TReturn>
	[Symbol.iterator](): CustomGenerator<T, TReturn, TNext>
}

export const contextual = <RType = any>(
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

export const whitespace = contextual(function* (): CustomGenerator<
	Parser<string, string, any>,
	string,
	any
> {
	const result: string[] = []

	const whiteSpaceRegex = regex(/^\s{1}/)
	while (true) {
		const isNewline: "no" | "\n" = yield lookAhead(char("\n")).errorChain(
			() => succeedWith("no")
		)

		if (isNewline !== "no") {
			break
		}

		const isWhiteSpace: "no" | string = yield lookAhead(
			whiteSpaceRegex
		).errorChain(() => succeedWith("no"))

		if (isWhiteSpace === "no") {
			break
		}

		const value: string = yield whiteSpaceRegex
		result.push(value)
	}

	return result.join("")
})

export const optionalWhitespace: Parser<string | null> = possibly(
	whitespace
).map((x) => x || "")
