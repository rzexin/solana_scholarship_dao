"use client";

import Link from "next/link";
import type { Address } from "@solana/kit";
import { useEffect, useState } from "react";
import { useSolanaClient } from "../../lib/solana-client-context";
import { getTreasuryPda } from "../../lib/dao/pdas";
import { decodeFixedString, readDaoName } from "../../lib/dao/strings";
import { lamportsToSolString } from "../../lib/lamports";
import { ellipsify } from "../../lib/explorer";
import { DaoAvatar } from "./dao-avatar";
import type { DaoSummary } from "../../lib/hooks/use-daos";

type Props = {
  dao: DaoSummary;
  myAddress?: Address | null;
};

export function DaoCard({ dao, myAddress }: Props) {
  const client = useSolanaClient();
  const [treasury, setTreasury] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tPda = await getTreasuryPda(dao.address);
        const info = await client.rpc
          .getAccountInfo(tPda, { encoding: "base64" })
          .send();
        if (cancelled) return;
        setTreasury(info.value ? BigInt(info.value.lamports) : 0n);
      } catch {
        if (!cancelled) setTreasury(0n);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, dao.address]);

  const name = readDaoName(dao.data.name, dao.address);
  const description = decodeFixedString(dao.data.description);
  const isMine = myAddress && dao.data.creator === myAddress;
  const treasurySol =
    treasury == null ? null : lamportsToSolString(treasury as never, 3);

  return (
    <Link
      href={`/dao/${dao.address}`}
      className="workspace-card group relative flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-glow"
    >
      <div className="flex items-start gap-3">
        <DaoAvatar
          address={dao.address}
          name={dao.data.name}
          iconUri={dao.data.iconUri}
          size={56}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg font-bold leading-tight">
              {name}
            </h3>
            {isMine && (
              <span className="badge badge-info shrink-0">Yours</span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-foreground-muted">
            {ellipsify(dao.address, 5)}
          </p>
        </div>
      </div>

      <p className="line-clamp-2 min-h-[2.4em] text-sm text-foreground-muted">
        {description || (
          <span className="italic">
            No description yet — open the workspace to take a look.
          </span>
        )}
      </p>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="compact-stat items-center">
          <span className="label">Treasury</span>
          <span className="value">
            {treasurySol == null ? "…" : `${treasurySol}`}
          </span>
        </div>
        <div className="compact-stat items-center">
          <span className="label">Members</span>
          <span className="value">{dao.data.memberCount}</span>
        </div>
        <div className="compact-stat items-center">
          <span className="label">Proposals</span>
          <span className="value">{dao.data.applicationCount.toString()}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-foreground-muted">
        <span>
          Quorum {dao.data.quorum} · Threshold {dao.data.voteThreshold}
        </span>
        <span className="font-display font-semibold text-primary-strong opacity-0 transition group-hover:opacity-100">
          Open →
        </span>
      </div>
    </Link>
  );
}
