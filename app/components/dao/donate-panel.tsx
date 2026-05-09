"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Address } from "@solana/kit";
import { getDonateInstructionAsync } from "../../generated/scholarship_dao";
import { useWallet } from "../../lib/wallet/context";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import { useDao } from "../../lib/hooks/use-dao";
import { useDaos } from "../../lib/hooks/use-daos";
import { useCluster } from "../cluster-context";
import { lamportsToSolString } from "../../lib/lamports";

type Props = {
  daoAddress: Address;
  variant?: "card" | "inline";
};

export function DonatePanel({ daoAddress, variant = "card" }: Props) {
  const { signer, status } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { snapshot, refresh } = useDao(daoAddress);
  const { refresh: refreshDaos } = useDaos();
  const { getExplorerUrl } = useCluster();
  const [amount, setAmount] = useState("0.5");

  const dao = snapshot.dao;
  const minDonation = dao ? Number(dao.minDonation) / 1_000_000_000 : 0;
  const totalDonated = snapshot.currentMember
    ? lamportsToSolString(snapshot.currentMember.totalDonated as never, 4)
    : "0";
  const isMember = snapshot.currentMember != null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer) {
      toast.error("Connect a wallet first");
      return;
    }
    if (!dao) {
      toast.error("DAO data is still loading");
      return;
    }
    const sol = Number(amount);
    if (!Number.isFinite(sol) || sol <= 0) {
      toast.error("Donation amount must be a positive number");
      return;
    }
    if (sol < minDonation) {
      toast.error(`Donation must be at least ${minDonation} SOL`);
      return;
    }

    try {
      const ix = await getDonateInstructionAsync({
        donor: signer,
        dao: daoAddress,
        amount: BigInt(Math.round(sol * 1_000_000_000)),
      });
      const sig = await send({ instructions: [ix] });
      toast.success("Donation confirmed", {
        description: isMember
          ? `Added ${sol} SOL to your contribution.`
          : `You donated ${sol} SOL and joined the DAO.`,
        action: {
          label: "Explorer",
          onClick: () => window.open(getExplorerUrl(`/tx/${sig}`), "_blank"),
        },
      });
      await Promise.all([refresh(), refreshDaos()]);
    } catch (err) {
      console.error(err);
      toast.error("Donation failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const disabled = isSending || status !== "connected" || !dao;

  return (
    <div
      className={
        variant === "card" ? "workspace-card p-6" : "workspace-card p-4"
      }
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold">Donate SOL</h3>
          <p className="text-xs text-foreground-muted">
            Your first donation registers you as a member and unlocks voting.
          </p>
        </div>
        <span className="badge badge-info">
          {isMember ? "Joined" : "Not joined"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Amount (SOL)
          </span>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.5"
              className="input-soft mono pr-14"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-foreground-muted">
              SOL
            </span>
          </div>
          {dao && (
            <p className="mt-1 text-xs text-foreground-muted">
              Minimum donation: {minDonation} SOL · Your total: {totalDonated}{" "}
              SOL
            </p>
          )}
        </label>
        <button
          type="submit"
          disabled={disabled}
          className="btn-primary w-full"
        >
          {isSending
            ? "Submitting\u2026"
            : isMember
              ? "Donate again"
              : "Donate & join"}
        </button>
      </form>
    </div>
  );
}
