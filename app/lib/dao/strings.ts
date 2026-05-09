import type { ReadonlyUint8Array } from "@solana/kit";

export const NAME_BYTES = 32;
export const DESCRIPTION_BYTES = 128;
export const ICON_URI_BYTES = 96;

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: false });

/**
 * Pack a UTF-8 string into a fixed-length byte buffer. Overflow is hard-truncated
 * by byte count, but never in the middle of a multi-byte character.
 */
export function encodeFixedString(text: string, len: number): Uint8Array {
  const out = new Uint8Array(len);
  if (!text) return out;
  const raw = enc.encode(text);
  let n = Math.min(raw.length, len);
  // Don't slice through a multi-byte UTF-8 character
  while (n > 0 && (raw[n] & 0b1100_0000) === 0b1000_0000) n -= 1;
  out.set(raw.subarray(0, n));
  return out;
}

/** Decode a fixed-length on-chain byte buffer into a string, trimming trailing zero bytes. */
export function decodeFixedString(
  bytes: ReadonlyUint8Array | Uint8Array | null | undefined
): string {
  if (!bytes) return "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let end = arr.length;
  while (end > 0 && arr[end - 1] === 0) end -= 1;
  if (end === 0) return "";
  try {
    return dec.decode(arr.subarray(0, end));
  } catch {
    return "";
  }
}

export function encodeName(text: string): Uint8Array {
  return encodeFixedString(text, NAME_BYTES);
}

export function encodeDescription(text: string): Uint8Array {
  return encodeFixedString(text, DESCRIPTION_BYTES);
}

export function encodeIconUri(text: string): Uint8Array {
  return encodeFixedString(text, ICON_URI_BYTES);
}

/**
 * Return a human-readable DAO name. Falls back to a truncated DAO address when
 * the on-chain name is empty.
 */
export function readDaoName(
  rawName: ReadonlyUint8Array | Uint8Array | null | undefined,
  fallbackAddress?: string
): string {
  const decoded = decodeFixedString(rawName).trim();
  if (decoded) return decoded;
  if (fallbackAddress) {
    return `DAO ${fallbackAddress.slice(0, 4)}…${fallbackAddress.slice(-4)}`;
  }
  return "Unnamed DAO";
}
