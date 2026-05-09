"use client";

import { useMemo, useState } from "react";
import type { Address } from "@solana/kit";
import {
  useActivity,
  type ActivityKind,
} from "../../../lib/hooks/use-activity";
import { ActivityFeed } from "../../../components/dao/activity-feed";

type Props = { daoAddress: Address };

const KIND_FILTERS: Array<{ value: ActivityKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "donate", label: "Donate" },
  { value: "apply", label: "Propose" },
  { value: "vote", label: "Vote" },
  { value: "execute", label: "Execute" },
  { value: "cancel", label: "Cancel" },
  { value: "metadata", label: "Metadata" },
];

export function ActivityTab({ daoAddress }: Props) {
  const { entries, isLoading, refresh } = useActivity(daoAddress, 50);
  const [kind, setKind] = useState<ActivityKind | "all">("all");

  const filtered = useMemo(() => {
    if (kind === "all") return entries;
    return entries.filter((e) => e.kind === kind);
  }, [entries, kind]);

  return (
    <section className="workspace-card p-5">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">On-chain activity</h2>
          <p className="text-xs text-foreground-muted">
            The latest 50 program calls, parsed from program logs via
            getSignaturesForAddress + getTransaction
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="btn-ghost text-xs"
        >
          ↻ Refresh
        </button>
      </header>
      <div className="mb-4 flex flex-wrap gap-2">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setKind(f.value)}
            data-active={kind === f.value}
            className="tab-bar-item"
          >
            {f.label}
          </button>
        ))}
      </div>
      <ActivityFeed entries={filtered} isLoading={isLoading} />
    </section>
  );
}
