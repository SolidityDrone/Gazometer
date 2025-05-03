import { type ForeignCallOutput } from '@noir-lang/noir_js';
import { assert } from '../../../util/assert.js';
import { encodeAccount, encodeStateProof, encodeStorageProof } from './accountOracle/encode.js';
import { decodeAddress, decodeBytes32, decodeField } from '../common/decode.js';
import { NoirArguments } from '../types.js';
import { Hex } from 'viem';
import { MultiChainClient } from '../../../ethereum/client.js';
import { Enum } from '../../../util/enum.js';

export enum ARGS {
  CHAIN_ID,
  BLOCK_NUM,
  ADDRESS,
  STORAGE_KEY
}
console.log("MADONNA CAGNA LAIDA")
export const getProofOracle = async (
  multiChainClient: MultiChainClient,
  args: NoirArguments
): Promise<ForeignCallOutput[]> => {

  console.log("ARGS get proof", args)
  const { blockNumber, address, storageKey, chainId } = decodeGetProofArguments(args);
  const client = multiChainClient.getClient(chainId);
  console.log("DIO LURIDO SCHIFO")
  console.log("Decoded result", blockNumber, address, storageKey, chainId)
  const accountProof = await client.getProof({
    address,
    storageKeys: [storageKey],
    blockNumber
  });
  console.log("DIO LURIDO SCHIFO")
  const encodedAccount = encodeAccount(accountProof);

  const encodedStateProof = encodeStateProof(accountProof);

  // Convert storage key to the format expected by encodeStorageProof
  let formattedStorageKey = storageKey;
  if (typeof storageKey === 'string' && storageKey.startsWith('0x')) {
    // Remove the 0x prefix and ensure it's a valid hex string
    formattedStorageKey = storageKey.substring(2).padStart(64, '0');
  }


  const encodedStorageProof = encodeStorageProof(formattedStorageKey, accountProof.storageProof[0]);

  return [...encodedAccount, encodedStateProof, encodedStorageProof];
};

export function decodeGetProofArguments(args: NoirArguments): {
  chainId: number;
  blockNumber: bigint;
  address: Hex;
  storageKey: Hex;
} {
  //#region 

  assert(args.length === Enum.size(ARGS), `get_proof requires ${Enum.size(ARGS)} arguments`);
  assert(args[ARGS.CHAIN_ID].length === 1, 'chainId should be a single value');
  assert(args[ARGS.BLOCK_NUM].length === 1, 'blockNumber should be a single value');
  //#endregion
  const address = decodeAddress(args[ARGS.ADDRESS]);
  const storageKey = decodeBytes32(args[ARGS.STORAGE_KEY]);

  const blockNumberStr = args[ARGS.BLOCK_NUM][0].toString();
  let blockNumber: bigint;

  if (args[ARGS.BLOCK_NUM][0].toString().length < 32) {
    // short hex
    blockNumber = BigInt(blockNumberStr.slice(2));
    console.log("DEBUG - Decoded short hex block number:", blockNumber.toString());
    console.log("DEBUG - Original hex:", blockNumberStr);
  } else {
    // long hex
    blockNumber = decodeField(args[ARGS.BLOCK_NUM][0])
    console.log("DEBUG - Decoded long hex block number:", blockNumber.toString());
  }

  return { blockNumber, address, storageKey, chainId: 11155111 };
}
