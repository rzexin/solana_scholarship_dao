"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Address } from "@solana/kit";
import { toast } from "sonner";
import { useDao } from "../../lib/hooks/use-dao";
import { useCluster } from "../cluster-context";
import { DaoAvatar } from "../dao/dao-avatar";
import { decodeFixedString, readDaoName } from "../../lib/dao/strings";
import { ellipsify } from "../../lib/explorer";
import { lamportsToSolString } from "../../lib/lamports";
import { Skeleton } from "../ui/skeleton";

type Props = {
  daoAddress: Address;
};

function StatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="compact-stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

export function DaoHeader({ daoAddress }: Props) {
  const { snapshot, isLoading } = useDao(daoAddress);
  const { dao, treasuryLamports, applications, memberCount } = snapshot;
  const { getExplorerUrl } = useCluster();
  const [copied, setCopied] = useState(false);

  const name = dao ? readDaoName(dao.name, daoAddress) : null;
  const description = dao ? decodeFixedString(dao.description) : "";
  const treasurySol = lamportsToSolString(treasuryLamports as never, 4);
  const pending = applications.filter((a) => a.data.status === 0).length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(daoAddress);
    setCopied(true);
    toast.success("DAO address copied");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="workspace-card relative overflow-hidden">
      <div className="grid gap-5 px-5 py-5 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-6 md:px-7 md:py-6">
        <DaoAvatar
          address={daoAddress}
          name={dao?.name}
          iconUri={dao?.iconUri}
          size={64}
        />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold leading-tight md:text-[26px]">
              {isLoading && !name ? (
                <Skeleton width={180} height={28} />
              ) : (
                (name ?? "Unknown DAO")
              )}
            </h1>
            {dao && (
              <span className="badge badge-info">
                Quorum {dao.quorum} · Threshold {dao.voteThreshold}
              </span>
            )}
          </div>
          {description ? (
            <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm text-foreground-muted">
              {description}
            </p>
          ) : (
            !isLoading && (
              <p className="mt-1.5 max-w-2xl text-sm italic text-foreground-muted">
                No description yet — an admin can add one from the Settings tab.
              </p>
            )
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
            <button
              onClick={handleCopy}
              className="font-mono text-foreground transition hover:text-primary-strong"
              title="Copy the full DAO address"
            >
              {ellipsify(daoAddress, 5)}
              <span className="ml-1 text-foreground-muted">
                {copied ? "✓" : "⧉"}
              </span>
            </button>
            {dao && (
              <span>
                Creator{" "}
                <a
                  href={getExplorerUrl(`/address/${dao.creator}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-foreground hover:text-primary-strong"
                >
                  {ellipsify(dao.creator, 4)}
                </a>
              </span>
            )}
            <a
              href={getExplorerUrl(`/address/${daoAddress}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              View on Explorer ↗
            </a>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 md:items-end">
          <Link
            href={`/dao/${daoAddress}/proposals/new`}
            className="btn-primary text-sm"
          >
            New proposal
          </Link>
          <span className="text-xs text-foreground-muted">
            {pending} pending · {applications.length} total
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border-low bg-surface-2/40 px-5 py-3 md:grid-cols-4 md:gap-3 md:px-7">
        <StatPill label="Treasury" value={`${treasurySol} SOL`} />
        <StatPill label="Members" value={memberCount} />
        <StatPill label="Proposals" value={applications.length} />
        <StatPill label="Pending" value={pending} />
      </div>
    </section>
  );
}
