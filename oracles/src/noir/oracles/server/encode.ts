import { ForeignCallOutput } from "@noir-lang/noir_js";
import {
	ForeignCallParam,
	ForeignCallParams,
	ForeignCallResult,
} from "./types.js";
import { NoirArguments } from "../types.js";

/// DECODE
export function decodeNoirArguments(params: ForeignCallParams): NoirArguments {
	return params.map((it) => {
		if (typeof it === "string") {
			return [it];
		}
		return it;
	});
}

/// ENCODE
export function encodeForeignCallResult(
	noirOutputs: ForeignCallOutput[],
): ForeignCallResult {
	return { values: noirOutputs.map(encodeForeignCallResultValue) };
}

function encodeForeignCallResultValue(
	noirOutput: ForeignCallOutput,
): ForeignCallParam {
	if (typeof noirOutput === "string") {
		return noirOutput;
	}
	return noirOutput;
}
