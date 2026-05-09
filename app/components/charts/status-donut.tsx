"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ApplicationWithAddress } from "../../lib/hooks/use-dao";
import {
  getProposalLifecycle,
  type ProposalLifecycle,
} from "../../lib/dao/proposal-status";

type Props = {
  applications: ApplicationWithAddress[];
  dao: { quorum: number; voteThreshold: number } | null;
  nowSeconds: number;
};

const COLORS: Record<ProposalLifecycle, string> = {
  voting: "#F4CF63",
  ready: "#48BFE3",
  expired: "#C7B299",
  executed: "#6BCE8A",
  cancelled: "#FF9D9D",
};

const LABELS: Record<ProposalLifecycle, string> = {
  voting: "Voting",
  ready: "Executable",
  expired: "Expired",
  executed: "Executed",
  cancelled: "Canceled",
};

export function StatusDonut({ applications, dao, nowSeconds }: Props) {
  const data = useMemo(() => {
    if (!dao) return [];
    const counts: Record<ProposalLifecycle, number> = {
      voting: 0,
      ready: 0,
      expired: 0,
      executed: 0,
      cancelled: 0,
    };
    for (const a of applications) {
      const lc = getProposalLifecycle(a.data, dao, nowSeconds);
      counts[lc.lifecycle] += 1;
    }
    return (Object.keys(counts) as ProposalLifecycle[])
      .filter((k) => counts[k] > 0)
      .map((k) => ({ name: LABELS[k], key: k, value: counts[k] }));
  }, [applications, dao, nowSeconds]);

  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-foreground-muted">
        No proposal data yet
      </div>
    );
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.key} fill={COLORS[d.key]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface-1)",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
