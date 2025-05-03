import { ForeignCallOutput } from '@noir-lang/noir_js';
import { hexToBytes, keccak256 } from 'viem';
import { BlockHeader, headerToRlp } from '../../../../ethereum/blockHeader.js';
import { padArray } from '../../../../util/array.js';
import { encodeField, encodeHex } from '../../common/encode.js';

export const MAX_HEADER_RLP_LEN: u32 = 708;

export function encodeBlockHeader(header: BlockHeader): ForeignCallOutput[] {
  console.log("Encoding block header:", header);

  const partial = encodeBlockHeaderPartial(header);
  console.log("Partial encoding:", partial);

  const rlp = encodeBlockHeaderRlp(header);
  console.log("RLP encoding:", rlp);

  const result = [...partial, ...rlp];
  console.log("Final encoded result:", result);

  return result;
}

function encodeBlockHeaderPartial(header: BlockHeader): ForeignCallOutput[] {
  const rlpHex = headerToRlp(header);
  console.log("RLP hex:", rlpHex);

  const number = header.number;
  const hash = encodeHex(header.hash);
  const stateRoot = encodeHex(header.stateRoot);
  const transactionsRoot = encodeHex(header.transactionsRoot);
  const receiptsRoot = encodeHex(header.receiptsRoot);

  console.log("Partial encoding components:", {
    number,
    hash,
    stateRoot,
    transactionsRoot,
    receiptsRoot
  });

  return [number, hash, stateRoot, transactionsRoot, receiptsRoot];
}

function encodeBlockHeaderRlp(header: BlockHeader): ForeignCallOutput[] {
  const rlpHex = headerToRlp(header);
  console.log("RLP hex for full encoding:", rlpHex);

  const rlpBytes = encodeHex(rlpHex);
  console.log("RLP bytes:", rlpBytes);

  const encodedRlpLen = encodeField(rlpBytes.length);
  console.log("Encoded RLP length:", encodedRlpLen);

  const encodedRlp = padArray(rlpBytes, MAX_HEADER_RLP_LEN, '0x');
  console.log("Padded RLP:", encodedRlp);

  return [encodedRlp, encodedRlpLen];
}
