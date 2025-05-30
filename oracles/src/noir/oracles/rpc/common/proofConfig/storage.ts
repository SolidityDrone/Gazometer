import { BYTES32_LEN } from '../../../common/const.js';
import { getProofConfig } from '../proofConfig.js';

const KEY_LEN: u32 = BYTES32_LEN;
const VALUE_LEN: u32 = BYTES32_LEN;
const MAX_PROOF_LEVELS = 8; // Empirically correct values to be determined after we scan ethereum state trie.

export const storageProofConfig = getProofConfig(KEY_LEN, VALUE_LEN, MAX_PROOF_LEVELS);
