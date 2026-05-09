"use client";

import type { Address } from "@solana/kit";
import { useCluster } from "../cluster-context";
import { ellipsify } from "../../lib/explorer";
import { lamportsToSolString } from "../../lib/lamports";
import type { MemberWithAddress } from "../../lib/hooks/use-members";
import { Skeleton } from "../ui/skeleton";
import { EmptyState } from "../ui/empty-state";

type Props = {
  members: MemberWithAddress[];
  isLoading: boolean;
  myAddress?: Address | null;
  /** Show only the top N entries */
  limit?: number;
};

const RANK_COLORS = [
  "linear-gradient(135deg,#F4CF63 0%,#E8853D 100%)",
  "linear-gradient(135deg,#9D4EDD 0%,#48BFE3 100%)",
  "linear-gradient(135deg,#48BFE3 0%,#6BCE8A 100%)",
];

export function DonorLeaderboard({
  members,
  isLoading,
  myAddress,
  limit,
}: Props) {
  const { getExplorerUrl } = useCluster();
  const list = limit ? members.slice(0, limit) : members;

  if (isLoading && members.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={48} />
        ))}
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <EmptyState
        variant="member"
        title="No donors yet"
        description="Donate any amount of SOL to become a member and appear on the leaderboard."
      />
    );
  }

  return (
    <ol className="space-y-2">
      {list.map((m, i) => {
        const rankColor = i < 3 ? RANK_COLORS[i] : "var(--surface-2)";
        const isMine = myAddress && m.data.wallet === myAddress;
        return (
          <li
            key={m.address}
            className={`flex items-center gap-3 rounded-2xl border border-border-low bg-surface-1 px-3 py-2.5 transition hover:bg-surface-2 ${
              isMine ? "ring-2 ring-primary/40" : ""
            }`}
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-white"
              style={{ background: rankColor }}
              aria-label={`Rank ${i + 1}`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={getExplorerUrl(`/address/${m.data.wallet}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate font-mono text-sm text-foreground hover:text-primary-strong"
              >
                {ellipsify(m.data.wallet, 5)}
                {isMine && (
                  <span className="ml-2 text-xs text-primary-strong">
                    (you)
                  </span>
                )}
              </a>
              <p className="text-xs text-foreground-muted">
                Joined{" "}
                {new Date(Number(m.data.joinedAt) * 1000).toLocaleDateString(
                  "en-US"
                )}
              </p>
            </div>
            <p className="font-display text-base font-bold tabular-nums text-primary-strong">
              {lamportsToSolString(m.data.totalDonated as never, 4)}
              <span className="ml-1 text-xs font-medium text-foreground-muted">
                SOL
              </span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
