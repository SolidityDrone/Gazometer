import { type Address, isAddress, isHex, Hex, getAddress } from 'viem';
import { assert } from '../../../util/assert.js';
import { BYTE_HEX_LEN } from '../../../util/const.js';
import { ADDRESS_LEN, BYTES32_LEN, MAX_U8 } from './const.js';

export function decodeBytes32(arg: string[]): Hex {
  assert(arg.length === BYTES32_LEN, `Invalid Bytes32 length: ${arg.length}`);
  for (const e of arg) {
    const d = parseInt(e, 16);
    assert(0 <= d && d <= MAX_U8 && isHex(e), `Invalid Bytes32, with byte: ${e}`);
  }

  const result = decodeHexValue(arg);

  assert(isHex(result), `Invalid Bytes32: ${result}`);
  return result;
}

export function decodeAddress(arg: string[]): Address {
  assert(arg.length === ADDRESS_LEN, `Invalid address length: ${arg.length}`);
  for (const e of arg) {
    const d = parseInt(e, 16);
    assert(0 <= d && d <= MAX_U8 && isHex(e), `Invalid address, with byte: ${e}`);
  }

  const result = getAddress(decodeHexValue(arg));

  assert(isAddress(result), `Invalid address: ${result}`);
  return result;
}

function decodeHexValue(arg: string[]): Hex {
  return ('0x' +
    arg
      .map((e) => parseInt(e, 16))
      .map((e) => e.toString(16).padStart(BYTE_HEX_LEN, '0'))
      .join('')) as Hex;
}

export function decodeField(arg: string): bigint {
  // If it's a hex string (starts with 0x)
  if (arg.startsWith('0x')) {
    return BigInt(arg);
  }
  // If it's a number or a string representing a number
  if (!isNaN(Number(arg))) {
    const num = Number(arg);
    // Pad to 32 bytes (64 hex characters) and ensure it's lowercase
    const hex = num.toString(16).toLowerCase().padStart(64, '0');
    return BigInt(`0x${hex}`);
  }
  // If it's a hex string without 0x prefix
  if (isHex(`0x${arg}`)) {
    return BigInt(`0x${arg}`);
  }
  throw new Error(`Invalid field element: ${arg}`);
}
