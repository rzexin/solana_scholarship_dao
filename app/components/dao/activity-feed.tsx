"use client";

import { useCluster } from "../cluster-context";
import { ellipsify } from "../../lib/explorer";
import { Skeleton } from "../ui/skeleton";
import { EmptyState } from "../ui/empty-state";
import type { ActivityEntry } from "../../lib/hooks/use-activity";

type Props = {
  entries: ActivityEntry[];
  isLoading: boolean;
  limit?: number;
  compact?: boolean;
};

function formatTime(t: number | null): string {
  if (!t) return "";
  const date = new Date(t * 1000);
  const now = Date.now();
  const diff = (now - date.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  }
  if (diff < 86400 * 7) {
    const d = Math.floor(diff / 86400);
    return `${d} ${d === 1 ? "day" : "days"} ago`;
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityFeed({
  entries,
  isLoading,
  limit,
  compact = false,
}: Props) {
  const { getExplorerUrl } = useCluster();
  const list = limit ? entries.slice(0, limit) : entries;

  if (isLoading && entries.length === 0) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={compact ? 40 : 56} />
        ))}
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <EmptyState
        variant="activity"
        title="No activity yet"
        description="Donations, votes, and executions in this DAO will appear here."
      />
    );
  }

  return (
    <ol
      className={`space-y-3 ${compact ? "" : "border-l border-border-low pl-4"}`}
    >
      {list.map((e) => (
        <li
          key={e.signature}
          className={`relative flex gap-3 ${compact ? "" : "-ml-4 pl-4"}`}
        >
          {!compact && (
            <span
              className="absolute -left-1.5 top-2.5 h-3 w-3 rounded-full border-2 border-background"
              style={{
                background: `var(--color-${
                  e.kind === "donate"
                    ? "accent"
                    : e.kind === "execute"
                      ? "success"
                      : e.kind === "vote"
                        ? "primary"
                        : e.kind === "cancel"
                          ? "danger"
                          : e.kind === "apply"
                            ? "secondary"
                            : "warning"
                })`,
              }}
              aria-hidden="true"
            />
          )}
          {compact && <span data-kind={e.kind} className="event-dot" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-display text-sm font-semibold">
                {e.summary}
                {e.failed && (
                  <span className="ml-2 text-xs text-danger">Failed</span>
                )}
              </p>
              <span className="shrink-0 text-xs text-foreground-muted">
                {formatTime(e.blockTime)}
              </span>
            </div>
            <a
              href={getExplorerUrl(`/tx/${e.signature}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block truncate font-mono text-xs text-foreground-muted hover:text-primary-strong"
            >
              {ellipsify(e.signature, 8)} ↗
            </a>
          </div>
        </li>
      ))}
    </ol>
  );
}
