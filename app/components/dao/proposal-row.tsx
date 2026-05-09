"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { Address } from "@solana/kit";
import {
  getCancelApplicationInstructionAsync,
  getExecuteInstructionAsync,
  getVoteInstructionAsync,
} from "../../generated/scholarship_dao";
import type { ApplicationWithAddress } from "../../lib/hooks/use-dao";
import { useDao } from "../../lib/hooks/use-dao";
import { useDaos } from "../../lib/hooks/use-daos";
import { useWallet } from "../../lib/wallet/context";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import { useCluster } from "../cluster-context";
import { lamportsToSolString } from "../../lib/lamports";
import { ellipsify } from "../../lib/explorer";
import { VoteBar } from "../charts/vote-bar";
import {
  formatRemaining,
  getProposalLifecycle,
  LIFECYCLE_BADGE,
} from "../../lib/dao/proposal-status";
import { cidToGatewayUrl, shortCid, validateCid } from "../../lib/ipfs";

type Props = {
  app: ApplicationWithAddress;
  daoAddress: Address;
  /** "detail" renders an expanded version */
  variant?: "row" | "detail";
};

function useNowSeconds() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function ProposalRow({ app, daoAddress, variant = "row" }: Props) {
  const { signer, status, wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { snapshot, refresh } = useDao(daoAddress);
  const { refresh: refreshDaos } = useDaos();
  const { getExplorerUrl } = useCluster();
  const [busy, setBusy] = useState<
    "for" | "against" | "execute" | "cancel" | null
  >(null);
  const now = useNowSeconds();

  const dao = snapshot.dao;
  const isMember = snapshot.currentMember != null;
  const walletAddress = wallet?.account.address ?? null;
  const isProposer =
    walletAddress != null && walletAddress === app.data.proposer;
  const isAdmin = walletAddress != null && dao?.admin === walletAddress;
  const canCancel = Number(app.data.status) === 0 && (isProposer || isAdmin);

  // The connected wallet's vote on this proposal, or undefined if they haven't voted
  const myVote = snapshot.myVotes[app.data.id.toString()];
  const hasVoted = myVote != null;
  const votedFor = hasVoted && myVote.support === true;
  const votedAgainst = hasVoted && myVote.support === false;

  const lifecycle = dao
    ? getProposalLifecycle(app.data, dao, now)
    : { lifecycle: "voting" as const };

  const badge = LIFECYCLE_BADGE[lifecycle.lifecycle] ?? LIFECYCLE_BADGE.voting;
  const remaining = Number(app.data.votingEndsAt) - now;

  const amountSol = lamportsToSolString(app.data.amount as never, 4);
  const treasuryEnough =
    snapshot.treasuryLamports >= (app.data.amount as bigint);

  const doVote = async (support: boolean) => {
    if (!signer || !isMember) {
      toast.error("Only members can vote — donate to this DAO first to join");
      return;
    }
    // Pre-check: short-circuit if the wallet has already voted, so the user
    // gets a clear message instead of an "already in use" error from chain.
    if (hasVoted) {
      toast.info(
        myVote?.support
          ? `You already voted for proposal #${app.data.id}`
          : `You already voted against proposal #${app.data.id}`
      );
      return;
    }
    setBusy(support ? "for" : "against");
    try {
      const ix = await getVoteInstructionAsync({
        voter: signer,
        dao: daoAddress,
        applicationId: app.data.id,
        support,
      });
      const sig = await send({ instructions: [ix] });
      toast.success(
        support
          ? `Voted for proposal #${app.data.id}`
          : `Voted against proposal #${app.data.id}`,
        {
          action: {
            label: "Explorer",
            onClick: () => window.open(getExplorerUrl(`/tx/${sig}`), "_blank"),
          },
        }
      );
      await Promise.all([refresh(), refreshDaos()]);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      // The Vote PDA already exists (race condition / stale local state)
      if (/already in use/i.test(msg)) {
        toast.error("You've already voted on this proposal", {
          description: "Refreshing the page data now.",
        });
        await Promise.all([refresh(), refreshDaos()]);
      } else {
        toast.error("Vote failed", { description: msg });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleExecute = async () => {
    if (!signer) {
      toast.error("Connect a wallet first");
      return;
    }
    setBusy("execute");
    try {
      const ix = await getExecuteInstructionAsync({
        executor: signer,
        dao: daoAddress,
        applicationId: app.data.id,
        recipient: app.data.recipient,
      });
      const sig = await send({ instructions: [ix] });
      toast.success(`Proposal #${app.data.id} executed`, {
        description: `Transferred ${amountSol} SOL to the recipient.`,
        action: {
          label: "Explorer",
          onClick: () => window.open(getExplorerUrl(`/tx/${sig}`), "_blank"),
        },
      });
      await Promise.all([refresh(), refreshDaos()]);
    } catch (err) {
      console.error(err);
      toast.error("Execution failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (!signer) {
      toast.error("Connect a wallet first");
      return;
    }
    setBusy("cancel");
    try {
      const ix = await getCancelApplicationInstructionAsync({
        signer,
        dao: daoAddress,
        applicationId: app.data.id,
      });
      const sig = await send({ instructions: [ix] });
      toast.success(`Proposal #${app.data.id} canceled`, {
        action: {
          label: "Explorer",
          onClick: () => window.open(getExplorerUrl(`/tx/${sig}`), "_blank"),
        },
      });
      await Promise.all([refresh(), refreshDaos()]);
    } catch (err) {
      console.error(err);
      toast.error("Cancel failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const isPending = Number(app.data.status) === 0;
  const canVote = isPending && remaining > 0;

  return (
    <article
      className={`workspace-card p-5 ${variant === "detail" ? "space-y-5" : ""}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-foreground-muted">
              #{app.data.id.toString()}
            </span>
            <span className={`badge ${badge.cls}`}>{badge.label}</span>
            {lifecycle.lifecycle === "voting" && remaining > 0 && (
              <span className="badge badge-info">
                {formatRemaining(remaining)} left
              </span>
            )}
            {hasVoted && isPending && (
              <span
                className="badge"
                style={{
                  background: votedFor
                    ? "rgba(34,197,94,0.14)"
                    : "rgba(239,68,68,0.14)",
                  color: votedFor ? "#16a34a" : "#dc2626",
                }}
                title={votedFor ? "You voted for" : "You voted against"}
              >
                {votedFor ? "✓ Voted for" : "✓ Voted against"}
              </span>
            )}
            {lifecycle.lifecycle === "expired" && (
              <span className="text-xs text-foreground-muted">
                · {lifecycle.reason}
              </span>
            )}
            {variant === "row" && app.data.proofCid && validateCid(app.data.proofCid) && (
              <a
                href={cidToGatewayUrl(app.data.proofCid)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-foreground-muted hover:text-primary-strong"
                title={`Proof material: ${shortCid(app.data.proofCid)} — open in IPFS gateway`}
              >
                <span aria-hidden="true">📎</span>
                <span className="hidden sm:inline">Proof</span>
              </a>
            )}
          </div>
          <p
            className={`mt-2 break-words text-sm text-foreground ${
              variant === "row" ? "line-clamp-2" : ""
            }`}
          >
            {app.data.reason || (
              <span className="italic text-foreground-muted">
                (no reason provided)
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
            <span>
              Recipient:{" "}
              <a
                href={getExplorerUrl(`/address/${app.data.recipient}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-foreground hover:text-primary-strong"
              >
                {ellipsify(app.data.recipient, 4)}
              </a>
            </span>
            <span>
              Proposer:{" "}
              <span className="font-mono">
                {ellipsify(app.data.proposer, 4)}
              </span>
              {isProposer && (
                <span className="ml-1 text-foreground">(you)</span>
              )}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold tabular-nums text-primary-strong">
            {amountSol}
            <span className="ml-1 text-xs font-medium text-foreground-muted">
              SOL
            </span>
          </p>
          {variant === "row" && (
            <Link
              href={`/dao/${daoAddress}/proposals/${app.data.id.toString()}`}
              className="mt-1 inline-block text-xs text-foreground-muted hover:text-primary-strong"
            >
              View details →
            </Link>
          )}
        </div>
      </header>

      <VoteBar
        votesFor={app.data.votesFor}
        votesAgainst={app.data.votesAgainst}
        quorum={dao?.quorum}
        threshold={dao?.voteThreshold}
        className="mt-4"
      />

      {(canVote || lifecycle.lifecycle === "ready" || canCancel) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canVote && (
            <>
              {(() => {
                const forDisabled =
                  !signer ||
                  !isMember ||
                  isSending ||
                  status !== "connected" ||
                  busy != null ||
                  hasVoted;
                const forReason = !signer
                  ? "Connect a wallet first"
                  : !isMember
                    ? "Only DAO members can vote — donate to join first"
                    : hasVoted
                      ? votedFor
                        ? "You already voted for this proposal"
                        : "You already voted against this proposal"
                      : "Vote for";
                return (
                  // Wrap disabled buttons in a span so the tooltip still shows
                  <span
                    className="tooltip flex-1 min-w-[120px]"
                    data-tooltip={forReason}
                  >
                    <button
                      onClick={() => doVote(true)}
                      disabled={forDisabled}
                      aria-pressed={votedFor}
                      aria-label={forReason}
                      data-voted={votedFor ? "for" : undefined}
                      className={`w-full ${votedFor ? "btn-primary" : "btn-ghost"}`}
                    >
                      {busy === "for"
                        ? "Submitting\u2026"
                        : votedFor
                          ? "✓ Voted for"
                          : "Vote for"}
                    </button>
                  </span>
                );
              })()}
              {(() => {
                const againstDisabled =
                  !signer ||
                  !isMember ||
                  isSending ||
                  status !== "connected" ||
                  busy != null ||
                  hasVoted;
                const againstReason = !signer
                  ? "Connect a wallet first"
                  : !isMember
                    ? "Only DAO members can vote — donate to join first"
                    : hasVoted
                      ? votedAgainst
                        ? "You already voted against this proposal"
                        : "You already voted for this proposal"
                      : "Vote against";
                return (
                  <span
                    className="tooltip flex-1 min-w-[120px]"
                    data-tooltip={againstReason}
                  >
                    <button
                      onClick={() => doVote(false)}
                      disabled={againstDisabled}
                      aria-pressed={votedAgainst}
                      aria-label={againstReason}
                      data-voted={votedAgainst ? "against" : undefined}
                      className={`w-full ${votedAgainst ? "btn-primary" : "btn-ghost"}`}
                    >
                      {busy === "against"
                        ? "Submitting\u2026"
                        : votedAgainst
                          ? "✓ Voted against"
                          : "Vote against"}
                    </button>
                  </span>
                );
              })()}
            </>
          )}
          {lifecycle.lifecycle === "ready" && (
            <button
              onClick={handleExecute}
              disabled={!signer || !treasuryEnough || isSending || busy != null}
              className="btn-primary flex-1 min-w-[120px]"
              title={!treasuryEnough ? "Treasury balance is insufficient" : ""}
            >
              {busy === "execute"
                ? "Executing\u2026"
                : !treasuryEnough
                  ? "Treasury too low"
                  : "Execute"}
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={!signer || isSending || busy != null}
              className="btn-ghost"
              title={
                isAdmin
                  ? "Cancel as admin"
                  : "Cancel your proposal"
              }
            >
              {busy === "cancel" ? "Canceling\u2026" : "Cancel proposal"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
