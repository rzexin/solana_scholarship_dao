"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Address } from "@solana/kit";
import { useDao } from "../../lib/hooks/use-dao";
import { useMembers } from "../../lib/hooks/use-members";
import { useActivity } from "../../lib/hooks/use-activity";
import { DonatePanel } from "../../components/dao/donate-panel";
import { ProposalRow } from "../../components/dao/proposal-row";
import { Skeleton, SkeletonList } from "../../components/ui/skeleton";
import { EmptyState } from "../../components/ui/empty-state";
import { TreasuryTimeline } from "../../components/charts/treasury-timeline";
import { StatusDonut } from "../../components/charts/status-donut";
import { ActivityFeed } from "../../components/dao/activity-feed";

type Props = {
  daoAddress: Address;
};

export function OverviewTab({ daoAddress }: Props) {
  const { snapshot, isLoading } = useDao(daoAddress);
  const { members } = useMembers(daoAddress);
  const { entries, isLoading: actLoading } = useActivity(daoAddress, 6);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  const top3 = snapshot.applications.slice(0, 3);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section className="workspace-card p-5" data-tone="cool">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">Treasury trend</h2>
            <span className="text-xs text-foreground-muted">
              Reconstructed from the treasury PDA&apos;s recent transactions
            </span>
          </header>
          <TreasuryTimeline
            treasuryAddress={snapshot.treasuryAddress}
            currentTreasuryLamports={snapshot.treasuryLamports}
          />
        </section>

        <section className="space-y-3">
          <header className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Latest proposals</h2>
              <p className="text-xs text-foreground-muted">
                Showing the 3 most recent. See the Proposals tab for the full
                list.
              </p>
            </div>
            <Link
              href={`/dao/${daoAddress}/proposals`}
              className="text-xs text-foreground-muted hover:text-primary-strong"
            >
              View all →
            </Link>
          </header>
          {isLoading && top3.length === 0 ? (
            <SkeletonList rows={2} rowHeight={140} />
          ) : top3.length === 0 ? (
            <EmptyState
              variant="seed"
              title="No proposals yet"
              description="The first proposer gets the spotlight — click the button above to submit one."
              action={
                <Link
                  href={`/dao/${daoAddress}/proposals/new`}
                  className="btn-primary text-sm"
                >
                  New proposal
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3">
              {top3.map((a) => (
                <ProposalRow key={a.address} app={a} daoAddress={daoAddress} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="space-y-4">
        <DonatePanel daoAddress={daoAddress} />

        <section className="workspace-card p-5">
          <h2 className="font-display text-lg font-bold">Proposal mix</h2>
          <p className="text-xs text-foreground-muted">
            Broken down by status: voting, executable, expired, executed,
            canceled
          </p>
          {isLoading && snapshot.applications.length === 0 ? (
            <Skeleton height={200} className="mt-3" />
          ) : (
            <StatusDonut
              applications={snapshot.applications}
              dao={snapshot.dao}
              nowSeconds={now}
            />
          )}
        </section>

        <section className="workspace-card p-5">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">Recent activity</h2>
            <Link
              href={`/dao/${daoAddress}/activity`}
              className="text-xs text-foreground-muted hover:text-primary-strong"
            >
              All activity →
            </Link>
          </header>
          <ActivityFeed
            entries={entries}
            isLoading={actLoading}
            limit={5}
            compact
          />
        </section>
      </div>
    </div>
  );
}
