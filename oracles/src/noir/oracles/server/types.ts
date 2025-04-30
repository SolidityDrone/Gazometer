// Taken from here: https://noir-lang.org/docs/how_to/how-to-oracles

export type SingleForeignCallParam = string;
export type ArrayForeignCallParam = string[];
export type ForeignCallParam = SingleForeignCallParam | ArrayForeignCallParam;
export type ForeignCallParams = ForeignCallParam[];

export interface ForeignCallResult {
	values: ForeignCallParams;
}
