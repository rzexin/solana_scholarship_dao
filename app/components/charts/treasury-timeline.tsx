"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Address } from "@solana/kit";
import { useTreasuryHistory } from "../../lib/hooks/use-treasury-history";

type Props = {
  treasuryAddress: Address | null;
  currentTreasuryLamports: bigint;
};

type Point = { t: number; sol: number };

/**
 * Treasury balance over time, reconstructed from the treasury PDA's recent
 * signatures (`postBalances` after each touching transaction). This is exact
 * for whatever the RPC returns within its history window. The terminal point
 * is reconciled with the live balance so the curve "breathes" with refreshes.
 */
export function TreasuryTimeline({
  treasuryAddress,
  currentTreasuryLamports,
}: Props) {
  const { points: rawPoints, isLoading } = useTreasuryHistory(treasuryAddress);

  const data = useMemo<Point[]>(() => {
    const lamportsToSol = (l: bigint) =>
      Number((Number(l) / 1_000_000_000).toFixed(4));

    const points: Point[] = rawPoints.map((p) => ({
      t: p.t,
      sol: lamportsToSol(p.lamports),
    }));

    const nowMs = Date.now();
    const currentSol = lamportsToSol(currentTreasuryLamports);

    if (points.length === 0) {
      if (currentTreasuryLamports > 0n) {
        return [
          { t: nowMs - 86_400_000, sol: 0 },
          { t: nowMs, sol: currentSol },
        ];
      }
      return [];
    }

    // Reconcile the terminal point with the live balance so the curve stays
    // up to date between RPC refreshes. We always keep X strictly increasing
    // to avoid recharts ghosting (two lines on top of each other).
    const last = points[points.length - 1];
    const balanceDiffers = Math.abs(currentSol - last.sol) > 1e-6;
    const timeGapMs = nowMs - last.t;

    if (balanceDiffers || timeGapMs > 60 * 1000) {
      const t = nowMs > last.t ? nowMs : last.t + 1;
      points.push({ t, sol: currentSol });
    }

    if (points.length === 1) {
      points.unshift({ t: points[0].t - 86_400_000, sol: 0 });
    }

    return points;
  }, [rawPoints, currentTreasuryLamports]);

  if (isLoading && data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-foreground-muted">
        Loading treasury history…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-foreground-muted">
        Treasury has no activity yet — be the first to donate.
      </div>
    );
  }

  // When the entire series fits in a single calendar day, switch the X tick
  // formatter to show times instead of repeating the same date label five times.
  const spanMs = data[data.length - 1].t - data[0].t;
  const useTimeTick = spanMs > 0 && spanMs < 24 * 60 * 60 * 1000;

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="treasuryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F4A261" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#F4A261" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border-low)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              useTimeTick
                ? new Date(v).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : new Date(v).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
            }
            stroke="var(--foreground-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "var(--border-low)" }}
          />
          <YAxis
            stroke="var(--foreground-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={42}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface-1)",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
            }}
            labelFormatter={(v) =>
              new Date(v as number).toLocaleString("en-US")
            }
            formatter={(value) =>
              [`${Number(value)} SOL`, "Treasury"] as [string, string]
            }
          />
          <Area
            type="monotone"
            dataKey="sol"
            stroke="#E8853D"
            strokeWidth={2.2}
            fill="url(#treasuryFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
