import type { CSSProperties, HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Border-radius shape preset */
  shape?: "rect" | "pill" | "circle" | "text";
  width?: number | string;
  height?: number | string;
};

/**
 * Warm cream-tone skeleton. Use this for real loading states instead of
 * placeholder text like "loading\u2026".
 */
export function Skeleton({
  shape = "rect",
  width,
  height,
  className = "",
  style,
  ...rest
}: Props) {
  const radius =
    shape === "circle"
      ? "9999px"
      : shape === "pill"
        ? "9999px"
        : shape === "text"
          ? "0.4em"
          : "0.85rem";
  const merged: CSSProperties = {
    width,
    height,
    borderRadius: radius,
    ...style,
  };
  return (
    <div
      aria-hidden="true"
      className={`skeleton ${shape === "text" ? "h-[0.95em]" : ""} ${className}`}
      style={merged}
      {...rest}
    />
  );
}

/** A row of skeletons, typical placeholder for a list. */
export function SkeletonList({
  rows = 3,
  className = "",
  rowHeight = 84,
}: {
  rows?: number;
  rowHeight?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={rowHeight} />
      ))}
    </div>
  );
}
