/**
 * IPFS gateway utilities shared by client + server.
 *
 * - `IPFS_GATEWAY` is read from `NEXT_PUBLIC_IPFS_GATEWAY` so it can be inlined
 *   into the browser bundle and overridden per deployment.
 * - `validateCid` does a lightweight format check (CIDv0 base58 or CIDv1
 *   base32) so we do not roundtrip junk to chain or to the gateway.
 */

const DEFAULT_IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

export const IPFS_GATEWAY: string =
  (process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? DEFAULT_IPFS_GATEWAY).replace(
    /\/?$/,
    "/",
  );

export function cidToGatewayUrl(cid: string, gateway: string = IPFS_GATEWAY): string {
  const trimmed = cid.trim();
  const base = gateway.replace(/\/?$/, "/");
  return `${base}${trimmed}`;
}

const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1 = /^b[a-z2-7]{50,}$/;

export function validateCid(cid: string): boolean {
  const trimmed = cid.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  return CID_V0.test(trimmed) || CID_V1.test(trimmed);
}

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function guessMimeFromName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

export function shortCid(cid: string, head = 6, tail = 6): string {
  if (cid.length <= head + tail + 3) return cid;
  return `${cid.slice(0, head)}…${cid.slice(-tail)}`;
}
