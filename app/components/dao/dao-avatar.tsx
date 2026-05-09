import type { ReadonlyUint8Array } from "@solana/kit";
import { decodeFixedString } from "../../lib/dao/strings";

type Props = {
  address: string;
  name?: string | ReadonlyUint8Array | null;
  iconUri?: string | ReadonlyUint8Array | null;
  size?: number;
  className?: string;
};

const PALETTES: Array<[string, string]> = [
  ["#F4A261", "#E8853D"],
  ["#9D4EDD", "#7C2DC2"],
  ["#48BFE3", "#2095BD"],
  ["#F4CF63", "#C99A1C"],
  ["#FF8E72", "#D85252"],
  ["#6BCE8A", "#359A5C"],
];

function hashAddress(addr: string): number {
  let h = 0;
  for (let i = 0; i < addr.length; i += 1) {
    h = (h * 31 + addr.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initials(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return cleaned.slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function DaoAvatar({
  address,
  name,
  iconUri,
  size = 56,
  className = "",
}: Props) {
  const decodedName =
    typeof name === "string" ? name : decodeFixedString(name ?? null);
  const decodedIcon =
    typeof iconUri === "string" ? iconUri : decodeFixedString(iconUri ?? null);

  const palette = PALETTES[hashAddress(address) % PALETTES.length];
  const text = initials(decodedName) || address.slice(0, 2).toUpperCase();

  if (decodedIcon && /^https?:\/\//.test(decodedIcon)) {
    return (
      <span
        className={`relative inline-flex shrink-0 overflow-hidden rounded-2xl ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={decodedIcon}
          alt={decodedName || "DAO icon"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl font-display font-bold text-white shadow-sm ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.35,
        background: `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 100%)`,
      }}
      aria-label={decodedName || `DAO ${address.slice(0, 4)}`}
    >
      {text}
    </span>
  );
}
