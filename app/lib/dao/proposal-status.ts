import type { Application } from "../../generated/scholarship_dao";

export type ProposalLifecycle =
  | "voting" // pending + before deadline + still accepting votes
  | "ready" // pending + threshold met + quorum reached + voting ended + for > against
  | "expired" // pending + voting ended but conditions not met (quorum / outvoted / below threshold)
  | "executed"
  | "cancelled";

export const STATUS_LABEL: Record<number, string> = {
  0: "Pending",
  1: "Executed",
  2: "Cancelled",
};

export type LifecycleSnapshot = {
  lifecycle: ProposalLifecycle;
  reason?: string;
};

/** Compute a finer-grained lifecycle from application + dao fields, beyond the raw status enum. */
export function getProposalLifecycle(
  app: Application,
  dao: { quorum: number; voteThreshold: number },
  nowSeconds: number
): LifecycleSnapshot {
  const status = Number(app.status);
  if (status === 1) return { lifecycle: "executed" };
  if (status === 2) return { lifecycle: "cancelled" };

  const deadline = Number(app.votingEndsAt);
  const totalVotes = app.votesFor + app.votesAgainst;

  if (nowSeconds < deadline) {
    return { lifecycle: "voting" };
  }

  // Voting period has ended
  if (totalVotes < dao.quorum) {
    return {
      lifecycle: "expired",
      reason: `Quorum not reached (${totalVotes}/${dao.quorum})`,
    };
  }
  if (app.votesFor <= app.votesAgainst) {
    return {
      lifecycle: "expired",
      reason: `Outvoted (${app.votesAgainst} against vs ${app.votesFor} for)`,
    };
  }
  if (app.votesFor < dao.voteThreshold) {
    return {
      lifecycle: "expired",
      reason: `Vote threshold not met (${app.votesFor}/${dao.voteThreshold})`,
    };
  }
  return { lifecycle: "ready" };
}

export const LIFECYCLE_BADGE: Record<
  ProposalLifecycle,
  { label: string; cls: string }
> = {
  voting: { label: "Voting", cls: "badge-pending" },
  ready: { label: "Executable", cls: "badge-success" },
  expired: { label: "Expired", cls: "badge-warning" },
  executed: { label: "Executed", cls: "badge-success" },
  cancelled: { label: "Canceled", cls: "badge-danger" },
};

export function formatRemaining(seconds: number): string {
  const abs = Math.abs(seconds);
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  const m = Math.floor((abs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${abs}s`;
}
