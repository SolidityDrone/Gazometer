import { type ForeignCallOutput } from '@noir-lang/noir_js';
import { type BlockHeader, blockToHeader } from '../../../ethereum/blockHeader.js';
import { assert } from '../../../util/assert.js';
import { encodeBlockHeader } from './headerOracle/encode.js';
import { decodeField } from '../common/decode.js';
import { NoirArguments } from '../types.js';
import { type Block } from '../../../ethereum/blockHeader.js';
import { AlchemyClient, MultiChainClient } from '../../../ethereum/client.js';
import { Enum } from '../../../util/enum.js';

export enum ARGS {
  CHAIN_ID,
  BLOCK_NUM
}

export async function getHeaderOracle(
  multiChainClient: MultiChainClient,
  args: NoirArguments
): Promise<ForeignCallOutput[]> {
  console.log("PORCODDIOOOO ARGS", args)
  const { blockNumber, chainId } = decodeGetHeaderArguments(args);
  console.log("PORCODDIO CHE MERDA", chainId);
  const client = multiChainClient.getClient(chainId);
  const blockHeader = await getBlockHeader(client, blockNumber);
  return encodeBlockHeader(blockHeader);
}

export function decodeGetHeaderArguments(args: NoirArguments): {
  chainId: number;
  blockNumber: bigint;
} {
  assert(args.length === Enum.size(ARGS), `get_header requires ${Enum.size(ARGS)} argument`);
  assert(args[ARGS.CHAIN_ID].length === 1, 'chainId should be a single value');
  assert(args[ARGS.BLOCK_NUM].length === 1, 'blockNumber should be a single value');

  // Handle chain ID
  const chainIdHex = args[ARGS.CHAIN_ID][0];
  let chainId: number;

  // If it's a hex string (starts with 0x)
  if (chainIdHex.startsWith('0x')) {
    // Remove 0x prefix and convert to number
    chainId = parseInt(chainIdHex.slice(2), 16);
  } else {
    // If it's already a number string
    chainId = parseInt(chainIdHex, 10);
  }
  console.log("DEBUG - BLock", args[ARGS.BLOCK_NUM][0])
  // Handle block number
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

  return {
    chainId: 11155111,
    blockNumber
  };
}

export async function getBlockHeader(client: AlchemyClient, blockNumber: bigint): Promise<BlockHeader> {
  // Convert the block number to a number for Alchemy
  const blockNumberNum = Number(blockNumber);
  const block: Block = (await client.getBlock({ blockNumber: blockNumberNum as any })) as Block;

  return blockToHeader(block);
}
