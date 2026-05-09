"use client";

import { useMemo, useState } from "react";
import type { Address } from "@solana/kit";
import { useMembers } from "../../../lib/hooks/use-members";
import { useDao } from "../../../lib/hooks/use-dao";
import { useWallet } from "../../../lib/wallet/context";
import { DonorLeaderboard } from "../../../components/dao/donor-leaderboard";
import { DonatePanel } from "../../../components/dao/donate-panel";
import { lamportsToSolString } from "../../../lib/lamports";

type Props = { daoAddress: Address };

export function MembersTab({ daoAddress }: Props) {
  const { members, isLoading } = useMembers(daoAddress);
  const { snapshot } = useDao(daoAddress);
  const { wallet } = useWallet();
  const [search, setSearch] = useState("");

  const myAddress = wallet?.account.address ?? null;

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.trim().toLowerCase();
    return members.filter((m) => m.data.wallet.toLowerCase().includes(q));
  }, [members, search]);

  const totalDonated = useMemo(() => {
    return members.reduce((acc, m) => acc + m.data.totalDonated, 0n);
  }, [members]);

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section className="workspace-card p-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Donor leaderboard</h2>
            <p className="text-xs text-foreground-muted">
              Sorted by total SOL donated. The top 3 are highlighted.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by address"
              className="input-soft mono h-[40px] w-[220px] py-0 text-xs"
            />
            <span className="text-xs text-foreground-muted">
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
        </header>
        <div className="mt-4">
          <DonorLeaderboard
            members={filtered}
            isLoading={isLoading}
            myAddress={myAddress}
          />
        </div>
      </section>

      <div className="space-y-4">
        <section className="workspace-card p-5">
          <h3 className="font-display text-base font-bold">Summary</h3>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-foreground-muted">Total donated</dt>
              <dd className="mono font-semibold tabular-nums">
                {lamportsToSolString(totalDonated as never, 4)} SOL
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground-muted">Members (on-chain)</dt>
              <dd className="mono font-semibold tabular-nums">
                {snapshot.dao?.memberCount ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground-muted">Members fetched</dt>
              <dd className="mono font-semibold tabular-nums">
                {members.length}
              </dd>
            </div>
          </dl>
        </section>

        <DonatePanel daoAddress={daoAddress} />
      </div>
    </div>
  );
}
