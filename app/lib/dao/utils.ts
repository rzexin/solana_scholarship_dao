import { type Address, address } from "@solana/kit";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isProbablyValidAddress(value: string): boolean {
  return BASE58_RE.test(value.trim());
}

export function tryParseAddress(value: string): Address | null {
  const v = value.trim();
  if (!isProbablyValidAddress(v)) return null;
  try {
    return address(v);
  } catch {
    return null;
  }
}

export function shortAddress(value: string, chars = 4): string {
  if (value.length <= chars * 2 + 3) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

export function formatLamportsAsSol(value: bigint, maxDecimals = 4): string {
  const lamportsPerSol = 1_000_000_000n;
  const whole = value / lamportsPerSol;
  const frac = value % lamportsPerSol;
  if (frac === 0n) return whole.toString();
  const fracStr = frac
    .toString()
    .padStart(9, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  if (!fracStr) return whole.toString();
  return `${whole}.${fracStr}`;
}

export function solToLamports(sol: number): bigint {
  if (!Number.isFinite(sol) || sol < 0) {
    throw new Error("invalid SOL amount");
  }
  return BigInt(Math.round(sol * 1_000_000_000));
}
