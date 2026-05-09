"use client";

import { useState } from "react";
import type { Address } from "@solana/kit";
import { toast } from "sonner";
import { useDao } from "../../../lib/hooks/use-dao";
import { useWallet } from "../../../lib/wallet/context";
import { useSendTransaction } from "../../../lib/hooks/use-send-transaction";
import { useCluster } from "../../../components/cluster-context";
import { getUpdateDaoMetadataInstruction } from "../../../generated/scholarship_dao";
import {
  decodeFixedString,
  encodeName,
  encodeDescription,
  encodeIconUri,
  NAME_BYTES,
  DESCRIPTION_BYTES,
  ICON_URI_BYTES,
} from "../../../lib/dao/strings";
import { Skeleton } from "../../../components/ui/skeleton";
import { EmptyState } from "../../../components/ui/empty-state";
import { ellipsify } from "../../../lib/explorer";

type Props = { daoAddress: Address };

export function SettingsTab({ daoAddress }: Props) {
  const { snapshot, isLoading, refresh } = useDao(daoAddress);
  const { signer, wallet } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { getExplorerUrl } = useCluster();

  const dao = snapshot.dao;
  const isAdmin = dao && wallet ? dao.admin === wallet.account.address : false;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconUri, setIconUri] = useState("");
  // Reset the form back to on-chain values whenever the dao snapshot changes
  const [syncedDao, setSyncedDao] = useState<typeof dao>(null);
  if (dao && dao !== syncedDao) {
    setSyncedDao(dao);
    setName(decodeFixedString(dao.name));
    setDescription(decodeFixedString(dao.description));
    setIconUri(decodeFixedString(dao.iconUri));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer || !wallet || !dao) {
      toast.error("Connect the admin wallet first");
      return;
    }
    if (!isAdmin) {
      toast.error("Only the DAO admin can edit metadata");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }
    if (new TextEncoder().encode(trimmedName).length > NAME_BYTES) {
      toast.error(`Name must be at most ${NAME_BYTES} bytes`);
      return;
    }
    if (new TextEncoder().encode(description).length > DESCRIPTION_BYTES) {
      toast.error(
        `Description must be at most ${DESCRIPTION_BYTES} bytes`
      );
      return;
    }
    if (new TextEncoder().encode(iconUri).length > ICON_URI_BYTES) {
      toast.error(`Icon URL must be at most ${ICON_URI_BYTES} bytes`);
      return;
    }

    const currentName = decodeFixedString(dao.name);
    const currentDesc = decodeFixedString(dao.description);
    const currentIcon = decodeFixedString(dao.iconUri);

    const nameArg =
      trimmedName === currentName ? null : encodeName(trimmedName);
    const descArg =
      description === currentDesc ? null : encodeDescription(description);
    const iconArg = iconUri === currentIcon ? null : encodeIconUri(iconUri);

    if (!nameArg && !descArg && !iconArg) {
      toast.message("No changes to save");
      return;
    }

    try {
      const ix = getUpdateDaoMetadataInstruction({
        admin: signer,
        dao: daoAddress,
        name: nameArg,
        description: descArg,
        iconUri: iconArg,
      });
      const sig = await send({ instructions: [ix] });
      toast.success("DAO metadata updated", {
        action: {
          label: "Explorer",
          onClick: () => window.open(getExplorerUrl(`/tx/${sig}`), "_blank"),
        },
      });
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update DAO", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (isLoading && !dao) {
    return <Skeleton height={320} />;
  }
  if (!dao) {
    return (
      <EmptyState
        title="DAO not found"
        description="This DAO account couldn't be loaded on the current network."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section className="workspace-card p-5">
        <header className="mb-4">
          <h2 className="font-display text-lg font-bold">DAO metadata</h2>
          <p className="text-xs text-foreground-muted">
            {isAdmin
              ? "Only the admin can call update_dao_metadata. Empty fields are left unchanged."
              : "You are not the admin of this DAO, so this view is read-only."}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
              maxLength={48}
              className="input-soft"
            />
          </label>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              <span>Description</span>
              <span className="tabular-nums">
                {description.length}/{DESCRIPTION_BYTES}
              </span>
            </span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isAdmin}
              className="input-soft resize-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Icon URL
            </span>
            <input
              type="text"
              value={iconUri}
              onChange={(e) => setIconUri(e.target.value)}
              disabled={!isAdmin}
              placeholder="https://…/icon.png (leave empty to use the gradient default)"
              className="input-soft mono"
            />
          </label>

          <button
            type="submit"
            disabled={!isAdmin || isSending}
            className="btn-primary w-full"
          >
            {isSending ? "Submitting\u2026" : "Save"}
          </button>
        </form>
      </section>

      <aside className="space-y-4">
        <section className="workspace-card p-5">
          <h3 className="font-display text-base font-bold">
            Governance parameters
          </h3>
          <p className="mt-1 text-xs text-foreground-muted">
            Governance parameters (Quorum, vote threshold, voting period, and
            minimum donation) are immutable once the DAO is initialized.
            Changing them requires the community to restart with a new DAO.
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-foreground-muted">Vote threshold</dt>
              <dd className="mono font-semibold">{dao.voteThreshold}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground-muted">Quorum</dt>
              <dd className="mono font-semibold">{dao.quorum}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground-muted">Voting period</dt>
              <dd className="mono font-semibold">
                {(Number(dao.votingPeriod) / 86400).toFixed(2)} days
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-foreground-muted">Minimum donation</dt>
              <dd className="mono font-semibold">
                {(Number(dao.minDonation) / 1_000_000_000).toFixed(4)} SOL
              </dd>
            </div>
          </dl>
        </section>

        <section className="workspace-card p-5">
          <h3 className="font-display text-base font-bold">Key accounts</h3>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-foreground-muted">
                Creator
              </dt>
              <dd className="mt-1 font-mono text-xs">
                {ellipsify(dao.creator, 6)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-foreground-muted">
                Admin
              </dt>
              <dd className="mt-1 font-mono text-xs">
                {ellipsify(dao.admin, 6)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-foreground-muted">
                DAO PDA
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="font-mono text-xs">
                  {ellipsify(daoAddress, 6)}
                </span>
                <a
                  href={getExplorerUrl(`/address/${daoAddress}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary-strong hover:underline"
                >
                  Explorer ↗
                </a>
              </dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  );
}
