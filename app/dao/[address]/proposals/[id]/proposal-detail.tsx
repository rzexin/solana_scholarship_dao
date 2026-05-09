"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Address } from "@solana/kit";
import { useDao } from "../../../../lib/hooks/use-dao";
import { useCluster } from "../../../../components/cluster-context";
import { ProposalRow } from "../../../../components/dao/proposal-row";
import { ProofMaterials } from "../../../../components/dao/proof-materials";
import { Skeleton } from "../../../../components/ui/skeleton";
import { EmptyState } from "../../../../components/ui/empty-state";
import { ellipsify } from "../../../../lib/explorer";
import {
  formatRemaining,
  getProposalLifecycle,
  LIFECYCLE_BADGE,
} from "../../../../lib/dao/proposal-status";
import { lamportsToSolString } from "../../../../lib/lamports";

type Props = {
  daoAddress: Address;
  idStr: string;
};

export function ProposalDetail({ daoAddress, idStr }: Props) {
  const { snapshot, isLoading } = useDao(daoAddress);
  const { getExplorerUrl } = useCluster();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  let id: bigint;
  try {
    id = BigInt(idStr);
  } catch {
    return (
      <EmptyState
        variant="default"
        title="Invalid proposal id"
        description={`"${idStr}" is not a valid integer id`}
      />
    );
  }

  const found = snapshot.applications.find((a) => a.data.id === id);

  if (isLoading && !found) {
    return (
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton height={300} />
        <Skeleton height={300} />
      </div>
    );
  }

  if (!found) {
    return (
      <EmptyState
        variant="default"
        title={`Proposal #${idStr} not found`}
        description="This proposal hasn't been indexed on the current cluster, or the id is wrong."
        action={
          <Link
            href={`/dao/${daoAddress}/proposals`}
            className="btn-ghost text-sm"
          >
            Back to proposals
          </Link>
        }
      />
    );
  }

  const dao = snapshot.dao;
  const lifecycle = dao
    ? getProposalLifecycle(found.data, dao, now)
    : { lifecycle: "voting" as const };
  const badge = LIFECYCLE_BADGE[lifecycle.lifecycle] ?? LIFECYCLE_BADGE.voting;
  const remaining = Number(found.data.votingEndsAt) - now;
  const created = Number(found.data.createdAt);
  const endsAt = Number(found.data.votingEndsAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={`/dao/${daoAddress}/proposals`}
          className="text-foreground-muted hover:text-primary-strong"
        >
          ← All proposals
        </Link>
        <span className="text-foreground-muted">/</span>
        <span className="font-display font-semibold">
          Proposal #{found.data.id.toString()}
        </span>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <ProposalRow app={found} daoAddress={daoAddress} variant="detail" />
          <ProofMaterials proofCid={found.data.proofCid ?? ""} />
        </div>

        <aside className="space-y-3">
          <section className="workspace-card p-5">
            <h3 className="font-display text-base font-bold">Details</h3>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-foreground-muted">Amount</dt>
                <dd className="mono font-semibold tabular-nums">
                  {lamportsToSolString(found.data.amount as never, 6)} SOL
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-foreground-muted">Recipient</dt>
                <dd>
                  <a
                    href={getExplorerUrl(`/address/${found.data.recipient}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-foreground hover:text-primary-strong"
                  >
                    {ellipsify(found.data.recipient, 5)}
                  </a>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-foreground-muted">Proposer</dt>
                <dd>
                  <a
                    href={getExplorerUrl(`/address/${found.data.proposer}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-foreground hover:text-primary-strong"
                  >
                    {ellipsify(found.data.proposer, 5)}
                  </a>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-foreground-muted">Created</dt>
                <dd>
                  {created > 0
                    ? new Date(created * 1000).toLocaleString("en-US")
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-foreground-muted">Voting ends</dt>
                <dd>
                  {endsAt > 0
                    ? new Date(endsAt * 1000).toLocaleString("en-US")
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-foreground-muted">Time remaining</dt>
                <dd>
                  {remaining > 0 ? formatRemaining(remaining) : "Ended"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="workspace-card p-5">
            <h3 className="font-display text-base font-bold">On-chain account</h3>
            <p className="mt-2 break-all font-mono text-xs text-foreground-muted">
              {found.address}
            </p>
            <a
              href={getExplorerUrl(`/address/${found.address}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-primary-strong hover:underline"
            >
              View on Explorer ↗
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}
