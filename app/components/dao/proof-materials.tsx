"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cidToGatewayUrl, shortCid, validateCid } from "../../lib/ipfs";

type Props = {
  proofCid: string;
};

const FALLBACK_GATEWAY = "https://w3s.link/ipfs/";

type PreviewKind = "image" | "pdf" | "unknown";

/**
 * Pick a preview strategy from the URL alone (the chain stores no mime).
 *
 * - We first ask the browser to render as an image (`<img onError>` falls back
 *   to the unknown branch when it fails).
 * - PDF is matched by extension because IPFS gateways don't reliably set
 *   Content-Type for `<embed>` to pick it up cross-browser.
 * - Anything else just renders the CID + open links.
 */
function pickPreview(cid: string): PreviewKind {
  const lower = cid.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")
  ) {
    return "image";
  }
  return "unknown";
}

export function ProofMaterials({ proofCid }: Props) {
  const cid = proofCid.trim();
  const [imageFailed, setImageFailed] = useState(false);

  if (cid.length === 0) {
    return (
      <section className="workspace-card p-5">
        <h3 className="font-display text-base font-bold">Proof material</h3>
        <p className="mt-2 text-sm text-foreground-muted">
          This proposal does not include a proof file.
        </p>
      </section>
    );
  }

  if (!validateCid(cid)) {
    return (
      <section className="workspace-card p-5">
        <h3 className="font-display text-base font-bold">Proof material</h3>
        <p className="mt-2 text-sm text-danger">
          On-chain CID is malformed and cannot be opened: <span className="mono">{cid}</span>
        </p>
      </section>
    );
  }

  const primary = cidToGatewayUrl(cid);
  const fallback = cidToGatewayUrl(cid, FALLBACK_GATEWAY);
  const kind = pickPreview(cid);

  const copyCid = async () => {
    try {
      await navigator.clipboard.writeText(cid);
      toast.success("CID copied");
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  return (
    <section className="workspace-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <span aria-hidden="true">📎</span>
            Proof material
          </h3>
          <p className="mt-1 break-all font-mono text-xs text-foreground-muted">
            {cid}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={copyCid}
            className="btn-ghost px-2 py-1 text-xs"
            title={`Copy ${shortCid(cid)}`}
          >
            Copy
          </button>
          <a
            href={primary}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost px-2 py-1 text-xs"
          >
            Open ↗
          </a>
        </div>
      </div>

      <div className="mt-4">
        {(kind === "image" || kind === "unknown") && !imageFailed && (
          <a
            href={primary}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-md border border-foreground-muted/15 bg-background-soft"
          >
            <img
              src={primary}
              alt="Proof material preview"
              loading="lazy"
              className="mx-auto max-h-72 w-auto object-contain"
              onError={() => setImageFailed(true)}
            />
          </a>
        )}

        {kind === "pdf" && (
          <div className="overflow-hidden rounded-md border border-foreground-muted/15 bg-background-soft">
            <embed
              src={primary}
              type="application/pdf"
              className="h-96 w-full"
            />
          </div>
        )}

        {imageFailed && kind !== "pdf" && (
          <p className="text-xs text-foreground-muted">
            Inline preview unavailable — open via{" "}
            <a
              href={primary}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-strong hover:underline"
            >
              primary gateway
            </a>{" "}
            or{" "}
            <a
              href={fallback}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-strong hover:underline"
            >
              w3s.link mirror
            </a>
            .
          </p>
        )}

        {kind === "pdf" && (
          <p className="mt-2 text-xs text-foreground-muted">
            Browser blocking the embed?{" "}
            <a
              href={primary}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-strong hover:underline"
            >
              Open as PDF
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
