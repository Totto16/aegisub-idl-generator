import {
	ArgumentsType,
	CustomNameType,
	InternalType,
	InternalTypeTemplate,
	InternalTypeWithoutCustomNames,
	Program,
	Property,
	StringLiteralType,
	UnionType,
} from "./parser"

//TODO: later to pretty print we have take a location or multiple
function typeCheckError(message: string): never {
	console.error(message)
	process.exit(3)
}

function getType<T extends boolean>(
	program: Program<T>,
	name: string
): null | InternalTypeTemplate<T> {
	for (const type of program.types) {
		if (type.name === name) {
			return type.content
		}
	}

	return null
}

function checkStringLiteral(literal: StringLiteralType): void {
	//from: https://github.com/kach/nearley/blob/6e24450f2b19b5b71557adf72ccd580f4e452b09/examples/json.ne#L10C12-L10C62
	// slightly modified
	const match = literal.value.match(
		/(?:\\["bfnrt\/\\0]|\\u[a-fA-F0-9]{4}|[^"\\])*/
	)

	if (match == null) {
		typeCheckError(
			`String Literal '${literal.value}' contains invalid escape Sequences!`
		)
	}
}

function resolveType(
	program: Program,
	type: InternalType,
	alreadyTrying: string[] | false
): InternalTypeWithoutCustomNames {
	const resolveCustomType = (
		arg: CustomNameType
	): InternalTypeWithoutCustomNames => {
		if (alreadyTrying !== false && alreadyTrying.includes(arg.name)) {
			typeCheckError(
				`Circular type dependency detected on custom type '${arg.name}'`
			)
		}

		const memberType = getType(program, arg.name)

		if (memberType !== null) {
			// TODO: we maybe don't store the resolved type, since it may be unresolved in the program, but might be already  resolved...
			return resolveType(
				program,
				memberType,
				alreadyTrying === false ? false : [...alreadyTrying, arg.name]
			)
		} else {
			if (alreadyTrying === false) {
				typeCheckError(
					`Trying to resolve a custom type, after all were resolved: type '${arg.name}' could not be resolved!`
				)
			}

			// TODO: we never store the now resolved type!
			return resolveType(program, arg, [...alreadyTrying, arg.name])
		}
	}

	switch (type.type) {
		case "string":
		case "void":
		case "int":
		case "float":
		case "number":
		case "boolean":
		case "null":
		case "undefined":
		case "false":
		case "true":
			return type
		case "stringLiteral":
			checkStringLiteral(type)
			return type

		case "array":
		case "union":
		case "arguments":
			return {
				type: type.type,
				types: type.types.map((val) =>
					resolveType(program, val, alreadyTrying)
				),
			}

		case "optional":
			return {
				type: "optional",
				content: resolveType(program, type.content, alreadyTrying),
			}

		case "function": {
			let temp: InternalTypeWithoutCustomNames

			if (type.arguments.type === "customTypeName") {
				temp = resolveCustomType(type.arguments)
			} else {
				temp = resolveType(program, type.arguments, alreadyTrying)
			}

			let resolvedArguments:
				| ArgumentsType<false>
				| UnionType<false, ArgumentsType<false>>

			if (temp.type === "arguments") {
				resolvedArguments = temp
			} else if (temp.type === "union") {
				const unionTypes = temp.types.map(({ type }) => type)

				const uniqueUnionTypes = getUnique(unionTypes)
				if (
					uniqueUnionTypes.length === 1 &&
					uniqueUnionTypes[0] === "arguments"
				) {
					//TYpescript isn't that smart, since that's really complicated xD
					resolvedArguments = temp as UnionType<
						false,
						ArgumentsType<false>
					>
				} else {
					typeCheckError(
						`Function type error: function arguments can only have type 'union<...arguments>' or 'but have type 'union<${unionTypes.join(
							", "
						)}>'`
					)
				}
			} else {
				typeCheckError(
					`Function type error: function arguments can only have type 'arguments' or 'union<...arguments>' but have type '${temp.type}'`
				)
			}

			return {
				type: "function",
				arguments: resolvedArguments,
				return: resolveType(program, type.return, alreadyTrying),
			}
		}

		case "customTypeName":
			return resolveCustomType(type)

		case "object": {
			const resolvedProperties = type.properties.map(
				({ type, name }: Property<true>): Property<false> => {
					const newType = resolveType(program, type, alreadyTrying)

					return { name, type: newType }
				}
			)

			return { type: "object", properties: resolvedProperties }
		}
	}
}

function getUnique<T>(array: T[]): T[] {
	return [...new Set(array)]
}

function hasDuplicates<T>(array: T[]): boolean {
	return getUnique(array).length !== array.length
}

function mergePrograms<T extends boolean = true>(
	program: Program<T>,
	newProgram: Program<T>,
	preferLast: boolean = true
): Program<T> {
	const result: Program<T> = new Program<T>([], [])

	const [first, second] = preferLast
		? [newProgram, program]
		: [program, newProgram]

	for (const elem of [...first.types, ...second.types]) {
		if (!result.types.map(({ name }) => name).includes(elem.name)) {
			result.types.push(elem as any)
		}
	}

	return result
}

export function typeCheck(program: Program): Program<false> {
	// multi-pass typechecking

	const newProgram: Program<false> = new Program<false>([], [])

	// check if we have duplicate types (types and objects)

	const typeNames = program.types.map(({ name }) => name)

	if (hasDuplicates(typeNames)) {
		typeCheckError("The type names have duplicates, that is not allowed!")
	}

	// resolve custom Types in custom Types
	for (const { type, content, name, origin } of program.types) {
		const newType = resolveType(
			mergePrograms(program, newProgram, true),
			content,
			[name]
		)
		newProgram.types.push({ type, name, content: newType, origin })
	}

	// resolve custom Types in modules
	for (const { name, type, properties } of program.modules) {
		const newType = resolveType(
			mergePrograms(program, newProgram, true),
			{ type: "object", properties }, // do a little trick with 'object' type!
			false
		)
		if (newType.type !== "object") {
			throw new Error(
				`Implementation Error, a type 'object' should always be resolved to 'object' but resolved to '${newType.type}'`
			)
		}

		newProgram.modules.push({ type, name, properties: newType.properties })
	}

	//TODO checks these things:
	//TODO: optional is only allowed in arguments or properties, and also if it'S there inside a union of only optionals, this is a harder and can also be ignored, since optional means  ?: in ts and can be replaced with  "T | undefined" in other places
	// optionals are trailing in function arguments

	return newProgram
}
