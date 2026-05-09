import type { ReactNode } from "react";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Decorative variant: seed / vote / treasury / activity / member */
  variant?: "seed" | "vote" | "treasury" | "activity" | "member" | "default";
  className?: string;
};

const ILLUSTRATIONS: Record<NonNullable<Props["variant"]>, string> = {
  seed: "🌱",
  vote: "🗳️",
  treasury: "🏦",
  activity: "📜",
  member: "🤝",
  default: "✨",
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "default",
  className = "",
}: Props) {
  return (
    <div
      className={`workspace-card flex flex-col items-center gap-3 px-6 py-12 text-center ${className}`}
    >
      <div className="flex size-14 items-center justify-center rounded-3xl bg-background-soft text-3xl">
        {icon ?? <span aria-hidden="true">{ILLUSTRATIONS[variant]}</span>}
      </div>
      <div>
        <p className="font-display text-lg font-bold">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-md text-sm text-foreground-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
