"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getInitializeDaoInstructionAsync } from "../../generated/scholarship_dao";
import { useWallet } from "../../lib/wallet/context";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import { useDaos } from "../../lib/hooks/use-daos";
import { useCluster } from "../cluster-context";
import { getDaoPda } from "../../lib/dao/pdas";
import {
  encodeName,
  encodeDescription,
  encodeIconUri,
  NAME_BYTES,
  DESCRIPTION_BYTES,
} from "../../lib/dao/strings";

const MIN_VOTING_PERIOD = 60; // Must stay in sync with MIN_VOTING_PERIOD on the on-chain program

const HINTS = [
  {
    label: "Name",
    desc: "Up to 32 bytes — e.g. \u201CSolana Builders Fund\u201D",
  },
  { label: "Description", desc: "Up to 128 bytes, optional" },
];

type Mode = "compact" | "full";
type TriggerVariant = "card" | "header";

type Props = {
  /** "compact" is the sidebar entry; "full" is the dedicated form page */
  mode?: Mode;
  /**
   * Visual style of the trigger that opens the dialog.
   * - "card": the default dashed workspace card (used in DAO grid)
   * - "header": a compact gradient pill suitable for the top navigation
   * Only meaningful when mode === "compact".
   */
  triggerVariant?: TriggerVariant;
  onCreated?: (daoAddress: string) => void;
};

export function CreateDaoCard({
  mode = "full",
  triggerVariant = "card",
  onCreated,
}: Props) {
  const { signer, wallet, status } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { refresh: refreshDaos } = useDaos();
  const { getExplorerUrl } = useCluster();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [voteThreshold, setVoteThreshold] = useState("2");
  const [quorum, setQuorum] = useState("3");
  const [votingDays, setVotingDays] = useState("3");
  const [minDonation, setMinDonation] = useState("0.05");
  const [open, setOpen] = useState(mode === "full");
  // Tracks whether each field has been touched, so errors don't appear on first render
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  const walletAddress = wallet?.account.address;

  const nameBytes = new TextEncoder().encode(name.trim()).length;
  const descBytes = new TextEncoder().encode(description).length;
  const tNum = Number(voteThreshold);
  const qNum = Number(quorum);
  const daysNum = Number(votingDays);
  const minSolNum = Number(minDonation);
  const periodSecs = Math.round(daysNum * 24 * 60 * 60);

  const errors = {
    name: !name.trim()
      ? "DAO name is required"
      : nameBytes > NAME_BYTES
        ? `Name must be at most ${NAME_BYTES} bytes (currently ${nameBytes})`
        : null,
    description:
      descBytes > DESCRIPTION_BYTES
        ? `Description must be at most ${DESCRIPTION_BYTES} bytes (currently ${descBytes})`
        : null,
    voteThreshold:
      voteThreshold.trim() === ""
        ? "Enter a vote threshold"
        : !Number.isInteger(tNum) || tNum <= 0 || tNum > 65535
          ? "Vote threshold must be an integer between 1 and 65535"
          : Number.isInteger(qNum) && qNum >= 1 && tNum > qNum
            ? `Vote threshold cannot exceed Quorum (currently ${tNum} > ${qNum}); otherwise proposals could never pass`
            : null,
    quorum:
      quorum.trim() === ""
        ? "Enter a Quorum"
        : !Number.isInteger(qNum) || qNum <= 0 || qNum > 65535
          ? "Quorum must be an integer between 1 and 65535"
          : null,
    votingDays:
      votingDays.trim() === ""
        ? "Enter a voting period"
        : !Number.isFinite(daysNum) || daysNum <= 0
          ? "Voting period must be a positive number"
          : periodSecs < MIN_VOTING_PERIOD
            ? `Voting period must be at least ${MIN_VOTING_PERIOD} seconds (about 1 minute)`
            : null,
    minDonation:
      minDonation.trim() === ""
        ? "Enter a minimum donation"
        : !Number.isFinite(minSolNum) || minSolNum < 0
          ? "Minimum donation must be greater than or equal to 0"
          : null,
  } as const;

  const hasError = Object.values(errors).some((e) => e != null);
  const disabled = isSending || !signer || status !== "connected" || hasError;

  const disabledReason = hasError
    ? (Object.values(errors).find((e) => e != null) ?? null)
    : null;

  // In compact mode, lock body scroll while open and close on Escape
  useEffect(() => {
    if (mode !== "compact" || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSending) setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mode, open, isSending]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer || !walletAddress) {
      toast.error("Connect a wallet first");
      return;
    }

    setTouched({
      name: true,
      description: true,
      voteThreshold: true,
      quorum: true,
      votingDays: true,
      minDonation: true,
    });

    const firstError =
      errors.name ||
      errors.description ||
      errors.voteThreshold ||
      errors.quorum ||
      errors.votingDays ||
      errors.minDonation;
    if (firstError) {
      toast.error(firstError);
      return;
    }

    const trimmedName = name.trim();
    const t = tNum;
    const q = qNum;
    const period = periodSecs;
    const minSol = minSolNum;

    try {
      // Each (creator, daoId) pair yields a distinct DAO PDA on-chain.
      // Use the current epoch ms as a nonce so the same wallet can create
      // multiple DAOs without colliding with prior ones.
      const daoId = BigInt(Date.now());
      const daoPda = await getDaoPda(walletAddress, daoId);
      const ix = await getInitializeDaoInstructionAsync({
        creator: signer,
        dao: daoPda,
        daoId,
        name: encodeName(trimmedName),
        description: encodeDescription(description),
        iconUri: encodeIconUri(""),
        voteThreshold: t,
        quorum: q,
        votingPeriod: BigInt(period),
        minDonation: BigInt(Math.round(minSol * 1_000_000_000)),
      });
      const sig = await send({ instructions: [ix] });
      toast.success(`DAO \u201C${trimmedName}\u201D created`, {
        action: {
          label: "Explorer",
          onClick: () => window.open(getExplorerUrl(`/tx/${sig}`), "_blank"),
        },
      });
      await refreshDaos();
      onCreated?.(daoPda);
      if (mode === "compact") setOpen(false);
      router.push(`/dao/${daoPda}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create DAO", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const renderTrigger = () => {
    if (triggerVariant === "header") {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Create DAO"
          className="nav-item group"
        >
          <span
            aria-hidden="true"
            className="grid size-4 place-items-center rounded-full border border-border-strong/60 text-[12px] leading-none text-foreground-muted transition group-hover:rotate-90 group-hover:border-primary-strong/60 group-hover:text-primary-strong"
          >
            +
          </span>
          <span>Create&nbsp;DAO</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="workspace-card group flex h-full min-h-[230px] w-full flex-col items-center justify-center gap-3 border-dashed p-6 text-center transition hover:-translate-y-0.5 hover:shadow-glow"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary-strong transition group-hover:scale-110">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </span>
        <div>
          <p className="font-display text-lg font-bold">Create your DAO</p>
          <p className="mt-1 text-xs text-foreground-muted">
            Customize name, description, voting period, and thresholds
          </p>
        </div>
      </button>
    );
  };

  if (!open) {
    return renderTrigger();
  }

  const formBody = (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {HINTS[0].label}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            markTouched("name");
          }}
          onBlur={() => markTouched("name")}
          maxLength={48}
          placeholder="e.g. Solana Builders Fund"
          aria-invalid={touched.name && errors.name ? true : undefined}
          aria-describedby="dao-name-hint"
          className={`input-soft ${touched.name && errors.name ? "input-error" : ""}`}
        />
        {touched.name && errors.name ? (
          <p id="dao-name-hint" className="mt-1 text-xs text-danger">
            {errors.name}
          </p>
        ) : (
          <p id="dao-name-hint" className="mt-1 text-xs text-foreground-muted">
            {HINTS[0].desc}
          </p>
        )}
      </label>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          <span>{HINTS[1].label}</span>
          <span className="tabular-nums">
            {descBytes}/{DESCRIPTION_BYTES}
          </span>
        </span>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            markTouched("description");
          }}
          onBlur={() => markTouched("description")}
          placeholder="One-sentence DAO mission — e.g. Fund student developers attending Solana hackathons."
          aria-invalid={
            touched.description && errors.description ? true : undefined
          }
          className={`input-soft resize-none ${touched.description && errors.description ? "input-error" : ""}`}
        />
        {touched.description && errors.description && (
          <p className="mt-1 text-xs text-danger">{errors.description}</p>
        )}
      </label>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 flex min-h-9 items-end whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Vote threshold
          </span>
          <input
            type="number"
            min="1"
            step="1"
            value={voteThreshold}
            onChange={(e) => {
              setVoteThreshold(e.target.value);
              markTouched("voteThreshold");
            }}
            onBlur={() => markTouched("voteThreshold")}
            aria-invalid={
              touched.voteThreshold && errors.voteThreshold ? true : undefined
            }
            className={`input-soft mono ${touched.voteThreshold && errors.voteThreshold ? "input-error" : ""}`}
          />
          <p
            className={`mt-1 min-h-9 text-xs ${touched.voteThreshold && errors.voteThreshold ? "text-danger" : "text-foreground-muted"}`}
          >
            {touched.voteThreshold && errors.voteThreshold
              ? errors.voteThreshold
              : "Min. for-votes to pass"}
          </p>
        </label>
        <label className="block">
          <span className="mb-1 flex min-h-9 items-end whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Quorum
          </span>
          <input
            type="number"
            min="1"
            step="1"
            value={quorum}
            onChange={(e) => {
              setQuorum(e.target.value);
              markTouched("quorum");
              // Changing Quorum re-evaluates the threshold cross-field rule
              markTouched("voteThreshold");
            }}
            onBlur={() => markTouched("quorum")}
            aria-invalid={touched.quorum && errors.quorum ? true : undefined}
            className={`input-soft mono ${touched.quorum && errors.quorum ? "input-error" : ""}`}
          />
          <p
            className={`mt-1 min-h-9 text-xs ${touched.quorum && errors.quorum ? "text-danger" : "text-foreground-muted"}`}
          >
            {touched.quorum && errors.quorum
              ? errors.quorum
              : "Min. total voters"}
          </p>
        </label>
        <label className="block">
          <span className="mb-1 flex min-h-9 items-end whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Voting period
          </span>
          <div className="relative">
            <input
              type="number"
              min="0.001"
              step="any"
              value={votingDays}
              onChange={(e) => {
                setVotingDays(e.target.value);
                markTouched("votingDays");
              }}
              onBlur={() => markTouched("votingDays")}
              aria-invalid={
                touched.votingDays && errors.votingDays ? true : undefined
              }
              className={`input-soft mono pr-14 ${touched.votingDays && errors.votingDays ? "input-error" : ""}`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-foreground-muted">
              days
            </span>
          </div>
          <p
            className={`mt-1 min-h-9 text-xs ${touched.votingDays && errors.votingDays ? "text-danger" : "text-foreground-muted"}`}
          >
            {touched.votingDays && errors.votingDays
              ? errors.votingDays
              : "Voting window length"}
          </p>
        </label>
        <label className="block">
          <span className="mb-1 flex min-h-9 items-end whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Min. donation
          </span>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="any"
              value={minDonation}
              onChange={(e) => {
                setMinDonation(e.target.value);
                markTouched("minDonation");
              }}
              onBlur={() => markTouched("minDonation")}
              aria-invalid={
                touched.minDonation && errors.minDonation ? true : undefined
              }
              className={`input-soft mono pr-12 ${touched.minDonation && errors.minDonation ? "input-error" : ""}`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-foreground-muted">
              SOL
            </span>
          </div>
          <p
            className={`mt-1 min-h-9 text-xs ${touched.minDonation && errors.minDonation ? "text-danger" : "text-foreground-muted"}`}
          >
            {touched.minDonation && errors.minDonation
              ? errors.minDonation
              : "Min. to join as a member"}
          </p>
        </label>
      </div>

      <div className="rounded-2xl bg-surface-2 px-4 py-3 text-xs text-foreground-muted">
        <p>
          <span className="font-semibold text-foreground">Heads up:</span> a
          proposal can execute only when{" "}
          <span className="font-mono">votes_for &gt; votes_against</span>,{" "}
          <span className="font-mono">votes_for ≥ vote_threshold</span>,
          participation
          <span className="font-mono"> ≥ quorum</span>, and the voting period
          has ended.
          <span className="ml-1">
            Keep <span className="font-mono">vote_threshold ≤ quorum</span> —
            otherwise no proposal can ever pass.
          </span>
        </p>
      </div>

      {disabled && !isSending && (
        <div
          role="alert"
          className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs text-danger"
        >
          <p className="mb-1 font-semibold">
            {(!signer || status !== "connected") && !hasError
              ? "Can't create the DAO yet"
              : "Fix the following before submitting"}
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {(!signer || status !== "connected") && (
              <li>Connect a wallet first</li>
            )}
            {errors.name && <li>Name: {errors.name}</li>}
            {errors.description && <li>Description: {errors.description}</li>}
            {errors.voteThreshold && (
              <li>Vote threshold: {errors.voteThreshold}</li>
            )}
            {errors.quorum && <li>Quorum: {errors.quorum}</li>}
            {errors.votingDays && <li>Voting period: {errors.votingDays}</li>}
            {errors.minDonation && (
              <li>Minimum donation: {errors.minDonation}</li>
            )}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        title={
          isSending
            ? "Submitting\u2026"
            : !signer || status !== "connected"
              ? "Connect a wallet first"
              : (disabledReason ?? "Create DAO")
        }
        className="btn-primary w-full"
      >
        {isSending ? "Submitting\u2026" : "Create DAO"}
      </button>
    </form>
  );

  // Compact mode: render as a centered Portal dialog instead of expanding inline
  if (mode === "compact") {
    // Keep a placeholder trigger in the original slot so layout stays consistent
    const placeholder = renderTrigger();

    const modal =
      typeof window !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-dao-dialog-title"
            >
              <div
                className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
                onClick={() => {
                  if (!isSending) setOpen(false);
                }}
              />
              <div className="workspace-card relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 shadow-glow">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3
                      id="create-dao-dialog-title"
                      className="font-display text-xl font-bold"
                    >
                      Create DAO
                    </h3>
                    <p className="text-sm text-foreground-muted">
                      The caller becomes the creator and admin. Each wallet can
                      create one DAO.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={isSending}
                    aria-label="Close"
                    className="-m-2 rounded-full p-2 text-foreground-muted transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
                {formBody}
              </div>
            </div>,
            document.body
          )
        : null;

    return (
      <>
        {placeholder}
        {modal}
      </>
    );
  }

  // Full mode: render in place
  return (
    <div className="workspace-card p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold">Create DAO</h3>
          <p className="text-sm text-foreground-muted">
            The caller becomes the creator and admin. Each wallet can create one
            DAO.
          </p>
        </div>
      </div>
      {formBody}
    </div>
  );
}
