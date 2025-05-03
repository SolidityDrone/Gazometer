import { ForeignCallOutput } from '@noir-lang/noir_js';
import { GetProofReturnType, Hex, fromRlp, isHex, keccak256, toRlp } from 'viem';
import { encodeField, encodeHex, encodeProof } from '../../common/encode.js';
import { padArray } from '../../../../util/array.js';
import { MAX_TRIE_NODE_LEN, ZERO_PAD_VALUE } from '../../common/const.js';
import { assert } from '../../../../util/assert.js';
import { accountProofConfig } from '../common/proofConfig/account.js';
import { storageProofConfig } from '../common/proofConfig/storage.js';
import { toHexString } from '../../../../ethereum/blockHeader.js';

const RLP_VALUE_INDEX = 1;

export function encodeAccount(ethProof: GetProofReturnType): ForeignCallOutput[] {
  const nonce = encodeField(ethProof.nonce);
  const balance = encodeField(ethProof.balance);
  const storageRoot = encodeHex(ethProof.storageHash);
  const codeHash = encodeHex(ethProof.codeHash);

  return [nonce, balance, storageRoot, codeHash];
}

export function encodeStateProof(ethProof: GetProofReturnType): ForeignCallOutput {
  const key = padArray(
    encodeHex(keccak256(ethProof.address)),
    accountProofConfig.maxPrefixedKeyNibbleLen,
    ZERO_PAD_VALUE,
    'left'
  );
  const value = padArray(encodeValue(ethProof.accountProof), accountProofConfig.maxValueLen, ZERO_PAD_VALUE, 'left');
  const nodes = encodeProof(
    ethProof.accountProof.slice(0, ethProof.accountProof.length - 1),
    (accountProofConfig.maxProofDepth - 1) * MAX_TRIE_NODE_LEN
  );
  const leaf = padArray(
    encodeHex(ethProof.accountProof[ethProof.accountProof.length - 1]),
    accountProofConfig.maxLeafLen,
    ZERO_PAD_VALUE
  );
  const depth = encodeField(ethProof.accountProof.length);

  return [...key, ...value, ...nodes, ...leaf, depth];
}

export function getValue(proof: Hex[]): Hex {
  const lastProofEntry = fromRlp(proof[proof.length - 1], 'hex');
  const value = lastProofEntry[RLP_VALUE_INDEX];
  assert(isHex(value), 'value should be of type Hex');
  return value;
}

export function encodeValue(proof: Hex[]): string[] {
  return padArray(encodeHex(getValue(proof)), accountProofConfig.maxValueLen, ZERO_PAD_VALUE, 'left');
}

type StorageProof = GetProofReturnType['storageProof'][number];

export function encodeStorageProof(storageKey: Hex, storageProof: StorageProof): ForeignCallOutput {


  const key = padArray(
    encodeHex(keccak256(storageKey)),
    storageProofConfig.maxPrefixedKeyNibbleLen,
    ZERO_PAD_VALUE,
    'left'
  );
  console.log("---storageKey PAD --");


  // For storage values, we need to use the raw hex value without RLP encoding
  // This ensures it's properly formatted as a bytes32 value
  console.log("--Value", storageProof.value);
  const value = padArray(
    encodeHex(toHexString(storageProof.value)),
    storageProofConfig.maxValueLen,
    ZERO_PAD_VALUE,
    'left'
  );
  console.log("---storageValue PAD --");

  // If the proof has only one node, we need to handle it differently
  // In this case, the first node is the leaf node, and there are no intermediate nodes
  let nodes;
  let leaf;
  let depth;

  if (storageProof.proof.length === 1) {
    // If there's only one node, it's the leaf node
    nodes = padArray([], (storageProofConfig.maxProofDepth - 1) * MAX_TRIE_NODE_LEN, ZERO_PAD_VALUE, 'left');
    leaf = padArray(
      encodeHex(storageProof.proof[0]),
      storageProofConfig.maxLeafLen,
      ZERO_PAD_VALUE
    );
    depth = encodeField(1); // Set depth to 1 to indicate there's only one node
  } else {
    // Normal case: multiple nodes
    nodes = encodeProof(
      storageProof.proof.slice(0, storageProof.proof.length - 1),
      (storageProofConfig.maxProofDepth - 1) * MAX_TRIE_NODE_LEN
    );
    leaf = padArray(
      encodeHex(storageProof.proof[storageProof.proof.length - 1]),
      storageProofConfig.maxLeafLen,
      ZERO_PAD_VALUE
    );
    depth = encodeField(storageProof.proof.length);
  }

  console.log("---leaf:", leaf);
  console.log("---depth:", depth);
  console.log("---key:", key);
  console.log("---value:", value);
  console.log("---nodes:", nodes);

  return [...key, ...value, ...nodes, ...leaf, depth];
}
