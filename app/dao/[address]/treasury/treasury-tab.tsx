"use client";

import { useMemo } from "react";
import type { Address } from "@solana/kit";
import { useDao } from "../../../lib/hooks/use-dao";
import { useMembers } from "../../../lib/hooks/use-members";
import { useCluster } from "../../../components/cluster-context";
import { TreasuryTimeline } from "../../../components/charts/treasury-timeline";
import { DonatePanel } from "../../../components/dao/donate-panel";
import { Skeleton } from "../../../components/ui/skeleton";
import { lamportsToSolString } from "../../../lib/lamports";
import { ellipsify } from "../../../lib/explorer";

type Props = { daoAddress: Address };

export function TreasuryTab({ daoAddress }: Props) {
  const { snapshot, isLoading } = useDao(daoAddress);
  const { members, isLoading: memLoading } = useMembers(daoAddress);
  const { getExplorerUrl } = useCluster();

  const totalIn = useMemo(
    () => members.reduce((acc, m) => acc + m.data.totalDonated, 0n),
    [members]
  );
  const totalOut = useMemo(
    () =>
      snapshot.applications
        .filter((a) => Number(a.data.status) === 1)
        .reduce((acc, a) => acc + (a.data.amount as bigint), 0n),
    [snapshot.applications]
  );
  const executedCount = snapshot.applications.filter(
    (a) => Number(a.data.status) === 1
  ).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section className="space-y-4">
        <div className="workspace-card p-5" data-tone="cool">
          <header className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Treasury trend</h2>
              <p className="text-xs text-foreground-muted">
                Reconstructed from the treasury PDA&apos;s recent transaction
                history. The rightmost point matches the live on-chain balance.
              </p>
            </div>
            <span className="font-display text-2xl font-bold tabular-nums text-primary-strong">
              {lamportsToSolString(snapshot.treasuryLamports as never, 4)} SOL
            </span>
          </header>
          {isLoading && memLoading ? (
            <Skeleton height={220} />
          ) : (
            <TreasuryTimeline
              treasuryAddress={snapshot.treasuryAddress}
              currentTreasuryLamports={snapshot.treasuryLamports}
            />
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="workspace-card p-4">
            <p className="text-xs uppercase tracking-wider text-foreground-muted">
              Total inflows (donations)
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">
              {lamportsToSolString(totalIn as never, 4)}
              <span className="ml-1 text-sm font-medium text-foreground-muted">
                SOL
              </span>
            </p>
          </div>
          <div className="workspace-card p-4">
            <p className="text-xs uppercase tracking-wider text-foreground-muted">
              Total outflows (executed)
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">
              {lamportsToSolString(totalOut as never, 4)}
              <span className="ml-1 text-sm font-medium text-foreground-muted">
                SOL
              </span>
            </p>
          </div>
          <div className="workspace-card p-4">
            <p className="text-xs uppercase tracking-wider text-foreground-muted">
              Executed proposals
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">
              {executedCount}
            </p>
          </div>
        </div>

        <div className="workspace-card p-5">
          <h3 className="font-display text-base font-bold">
            Treasury PDA · on-chain account
          </h3>
          <p className="mt-2 text-sm text-foreground-muted">
            Donations move into this PDA via the system program. Executing a
            proposal CPI-transfers funds out using program-derived signer
            seeds.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Treasury
            </span>
            <span className="font-mono text-sm">
              {snapshot.treasuryAddress
                ? ellipsify(snapshot.treasuryAddress, 6)
                : "—"}
            </span>
            {snapshot.treasuryAddress && (
              <a
                href={getExplorerUrl(`/address/${snapshot.treasuryAddress}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-strong hover:underline"
              >
                Explorer ↗
              </a>
            )}
          </div>
        </div>
      </section>

      <DonatePanel daoAddress={daoAddress} />
    </div>
  );
}
