import { InternalType, InternalTypeWithoutCustomNames, Program } from "./parser"

function resolveType(
	program: Program,
	type: InternalType,
	alreadyTrying: string[] = []
): InternalTypeWithoutCustomNames {
	//TODO
	return { type: "void" }
}

export function typeCheck(program: Program): Program<false> {
	// multi-pass typechecking

	const newProgram: Program = {
		types: [],
		objects: [],
		modules: [],
	}

	// resolve custom Types in custom Types
	for (const type of program.types) {
		//TODO
	}

	//TODO

	process.exit(1)
}
