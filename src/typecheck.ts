import {
	ArgumentsType,
	CustomNameType,
	InternalType,
	InternalTypeTemplate,
	InternalTypeWithoutCustomNames,
	Program,
	Property,
} from "./parser"

function getType<T extends boolean>(
	program: Program<T>,
	name: string
): undefined | InternalTypeTemplate<T> {
	for (const type of program.types) {
		if (type.name === name) {
			return type.content
		}
	}

	for (const type of program.objects) {
		if (type.name === name) {
			return { type: "object", properties: type.properties }
		}
	}
}

function resolveType(
	program: Program,
	type: InternalType,
	alreadyTrying: string[]
): InternalTypeWithoutCustomNames {
	console.log("tyring to resolve " + type.type)

	const resolveCustomType = (
		arg: CustomNameType
	): InternalTypeWithoutCustomNames => {
		if (alreadyTrying.includes(arg.name)) {
			console.error(
				`Circular type dependency detected on custom type '${arg.name}'`
			)
			process.exit(3)
		}

		const memberType = getType(program, arg.name)

		if (memberType) {
			// TODO: we maybe don't store the resolved type, since it may be unresolved in the program, but might be already  resolved...
			return resolveType(program, memberType, [
				...alreadyTrying,
				arg.name,
			])
		} else {
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
		case "stringLiteral":
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
			let resolvedArguments: ArgumentsType<false>

			if (type.arguments.type === "customTypeName") {
				const temp = resolveCustomType(type.arguments)

				if (temp.type !== "arguments") {
					console.error(
						`The custom type '${type.arguments.name}' has to resolve to an 'arguments' type, but resolved to '${temp.type}' !`
					)
					process.exit(3)
				}
				resolvedArguments = temp
			} else {
				const temp = resolveType(program, type.arguments, alreadyTrying)

				if (temp.type !== "arguments") {
					throw new Error(
						`Implementation Error, a type 'arguments' should always be resolved to 'arguments' but resolved to '${temp.type}'`
					)
				}
				resolvedArguments = temp
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
	keys: [keyof Program<T>],
	preferLast: boolean = true
): Program<T> {
	const result: Program<T> = {
		types: [],
		objects: [],
		modules: [],
	}

	for (const key of getUnique(keys)) {
		const [first, second] = preferLast
			? [newProgram, program]
			: [program, newProgram]

		for (const elem of [...first[key], ...second[key]]) {
			if (!result[key].map(({ name }) => name).includes(elem.name)) {
				result[key].push(elem as any)
			}
		}
	}

	return result
}

export function typeCheck(program: Program): Program<false> {
	// multi-pass typechecking

	const newProgram: Program<false> = {
		types: [],
		objects: [],
		modules: [],
	}

	// check if we have duplicate types (types and objects)

	const typeNames = program.types.map(({ name }) => name)

	const objectTypeNames = program.objects.map(({ name }) => name)

	if (hasDuplicates(typeNames)) {
		console.error("The type names have duplicates, that is not allowed!")
		process.exit(3)
	}

	if (hasDuplicates(objectTypeNames)) {
		console.error("The objects names have duplicates, that is not allowed!")
		process.exit(3)
	}

	if (hasDuplicates([...typeNames, ...objectTypeNames])) {
		console.error(
			"The type names (objects + types) have duplicates, that is not allowed!"
		)
		process.exit(3)
	}

	// resolve custom Types in custom Types
	for (const { type, content, name } of program.types) {
		console.log(name + "\n")
		const newType = resolveType(
			mergePrograms(program, newProgram, ["types"], true),
			content,
			[name]
		)
		console.log(name, newType)
		newProgram.types.push({ type, name, content: newType })
	}

	//TODO

	process.exit(1)
}
