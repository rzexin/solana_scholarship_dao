"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type Address, address as toAddress } from "@solana/kit";
import { getCreateApplicationInstruction } from "../../../../generated/scholarship_dao";
import { useWallet } from "../../../../lib/wallet/context";
import { useSendTransaction } from "../../../../lib/hooks/use-send-transaction";
import { useDao } from "../../../../lib/hooks/use-dao";
import { useDaos } from "../../../../lib/hooks/use-daos";
import { useCluster } from "../../../../components/cluster-context";
import { getApplicationPda } from "../../../../lib/dao/pdas";
import {
  cidToGatewayUrl,
  shortCid,
  validateCid,
} from "../../../../lib/ipfs";

const REASON_MAX = 200;
const ACCEPT_MIME = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
].join(",");

type Props = { daoAddress: Address };

type UploadedProof = {
  cid: string;
  name: string;
  size: number;
  mimeType: string;
};

function tryParseAddress(input: string): Address | null {
  try {
    return toAddress(input);
  } catch {
    return null;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function CreateProposalForm({ daoAddress }: Props) {
  const { signer, status } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { snapshot, refresh } = useDao(daoAddress);
  const { refresh: refreshDaos } = useDaos();
  const { getExplorerUrl } = useCluster();
  const router = useRouter();

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState<UploadedProof | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dao = snapshot.dao;
  const recipientValid =
    recipient.trim().length === 0 ? null : tryParseAddress(recipient.trim());

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ipfs-upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const json = (await res.json()) as UploadedProof;
      if (!validateCid(json.cid)) {
        throw new Error(`Pinata returned an invalid CID: ${json.cid}`);
      }
      setProof(json);
      toast.success("Proof uploaded to IPFS", {
        description: shortCid(json.cid),
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload proof", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUpload(file);
  };

  const removeProof = () => {
    setProof(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
    if (isUploading) {
      toast.error("Wait for the proof upload to finish");
      return;
    }
    const recipientAddr = tryParseAddress(recipient.trim());
    if (!recipientAddr) {
      toast.error("Enter a valid Solana address");
      return;
    }
    const sol = Number(amount);
    if (!Number.isFinite(sol) || sol <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }
    if (reason.length > REASON_MAX) {
      toast.error(`Reason must be at most ${REASON_MAX} characters`);
      return;
    }

    try {
      const id = dao.applicationCount;
      const applicationPda = await getApplicationPda(daoAddress, id);
      const ix = getCreateApplicationInstruction({
        proposer: signer,
        dao: daoAddress,
        application: applicationPda,
        amount: BigInt(Math.round(sol * 1_000_000_000)),
        recipient: recipientAddr,
        reason,
        proofCid: proof?.cid ?? "",
      });
      const sig = await send({ instructions: [ix] });
      toast.success("Proposal published", {
        description: `Proposal #${id}`,
        action: {
          label: "Explorer",
          onClick: () => window.open(getExplorerUrl(`/tx/${sig}`), "_blank"),
        },
      });
      await Promise.all([refresh(), refreshDaos()]);
      router.push(`/dao/${daoAddress}/proposals/${id.toString()}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit proposal", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const disabled =
    isSending || isUploading || status !== "connected" || !dao;

  return (
    <div className="workspace-card p-6">
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold">New scholarship proposal</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Request a treasury payout to a specific recipient. Attach a proof
          file (PDF, image, etc.) — it will be pinned to IPFS and only the CID
          is recorded on chain.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Recipient address (base58)
          </span>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g. 4Nd1m..."
            className={`input-soft mono ${
              recipientValid === null
                ? ""
                : recipientValid
                  ? "border-success/60 focus:border-success"
                  : "border-danger/60 focus:border-danger"
            }`}
          />
          {recipient && recipientValid === null && (
            <p className="mt-1 text-xs text-danger">
              Enter a valid Solana address
            </p>
          )}
        </label>

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
              placeholder="0.1"
              className="input-soft mono pr-14"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-foreground-muted">
              SOL
            </span>
          </div>
        </label>

        <div className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            <span>Proof material (optional)</span>
            <span className="text-foreground-muted/80">
              max 10 MB · PDF / image / text
            </span>
          </span>

          {!proof && (
            <div className="rounded-md border border-dashed border-foreground-muted/40 bg-surface-2/40 p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_MIME}
                onChange={onPickFile}
                disabled={isUploading}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-strong hover:file:bg-primary/25 disabled:opacity-60"
              />
              <p className="mt-2 text-xs text-foreground-muted">
                {isUploading
                  ? "Uploading to IPFS via Pinata…"
                  : "File is pinned to IPFS; only the CID is written on-chain."}
              </p>
            </div>
          )}

          {proof && (
            <div className="rounded-md border border-success/40 bg-success/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {proof.name}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {proof.mimeType} · {formatBytes(proof.size)}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground-muted">
                    CID: {proof.cid}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <a
                    href={cidToGatewayUrl(proof.cid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    Open ↗
                  </a>
                  <button
                    type="button"
                    onClick={removeProof}
                    className="btn-ghost px-2 py-1 text-xs text-danger"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            <span>Reason</span>
            <span
              className={`tabular-nums ${
                reason.length > REASON_MAX ? "text-danger" : ""
              }`}
            >
              {reason.length}/{REASON_MAX}
            </span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Cover travel costs for student X attending Solana Hackathon"
            className="input-soft resize-none"
          />
        </label>

        <button
          type="submit"
          disabled={disabled}
          className="btn-primary w-full"
        >
          {isSending
            ? "Submitting\u2026"
            : isUploading
              ? "Waiting for upload\u2026"
              : "Submit proposal"}
        </button>
      </form>
    </div>
  );
}
