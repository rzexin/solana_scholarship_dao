type Props = {
  votesFor: number;
  votesAgainst: number;
  quorum?: number;
  threshold?: number;
  /** Hide the bottom legend and just show the bar */
  compact?: boolean;
  className?: string;
};

export function VoteBar({
  votesFor,
  votesAgainst,
  quorum,
  threshold,
  compact = false,
  className = "",
}: Props) {
  const total = votesFor + votesAgainst;
  const denom = Math.max(total, quorum ?? 0, threshold ?? 0, 1);
  const forPct = (votesFor / denom) * 100;
  const againstPct = (votesAgainst / denom) * 100;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="vote-bar" role="img" aria-label="Vote progress">
        <div className="vote-bar-for" style={{ width: `${forPct}%` }} />
        <div className="vote-bar-against" style={{ width: `${againstPct}%` }} />
      </div>
      {!compact && (
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-foreground-muted">
            <span className="inline-block size-2 rounded-full bg-success" />
            For{" "}
            <span className="mono font-semibold tabular-nums text-foreground">
              {votesFor}
            </span>
          </span>
          <span className="flex items-center gap-1 text-foreground-muted">
            <span className="inline-block size-2 rounded-full bg-danger" />
            Against{" "}
            <span className="mono font-semibold tabular-nums text-foreground">
              {votesAgainst}
            </span>
          </span>
          {threshold !== undefined && (
            <span className="text-foreground-muted">
              Threshold{" "}
              <span className="mono font-semibold tabular-nums text-foreground">
                {threshold}
              </span>
            </span>
          )}
          {quorum !== undefined && (
            <span className="text-foreground-muted">
              Quorum{" "}
              <span className="mono font-semibold tabular-nums text-foreground">
                {total}/{quorum}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
