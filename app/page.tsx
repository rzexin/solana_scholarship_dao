"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "./lib/wallet/context";
import { useDaos, type DaoSummary } from "./lib/hooks/use-daos";
import { DaoCard } from "./components/dao/dao-card";
import { CreateDaoCard } from "./components/dao/create-dao-card";
import { Skeleton } from "./components/ui/skeleton";
import { EmptyState } from "./components/ui/empty-state";
import { decodeFixedString, readDaoName } from "./lib/dao/strings";

type SortKey = "treasury" | "members" | "proposals" | "recent";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "proposals", label: "Most proposals" },
  { value: "members", label: "Most members" },
  { value: "treasury", label: "Treasury size" },
];

const PROTOCOL_RULES = [
  "votes_for > votes_against",
  "votes_for ≥ vote_threshold",
  "participation ≥ quorum",
  "→ executes at deadline",
];

const FEATURE_PILLS: {
  dot: string;
  label: string;
  detail: string;
}[] = [
  { dot: "bg-success", label: "For / against voting", detail: "Per-member" },
  { dot: "bg-secondary", label: "Quorum & deadline", detail: "On-chain" },
  { dot: "bg-primary", label: "Activity feed", detail: "Verifiable" },
  { dot: "bg-accent", label: "Editable metadata", detail: "Admin gated" },
];

function matches(query: string, dao: DaoSummary): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = readDaoName(dao.data.name, dao.address).toLowerCase();
  const desc = decodeFixedString(dao.data.description).toLowerCase();
  return (
    name.includes(q) ||
    desc.includes(q) ||
    dao.address.toLowerCase().includes(q) ||
    dao.data.creator.toLowerCase().includes(q)
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export default function HomePage() {
  const { wallet, status } = useWallet();
  const { daos, isLoading, error } = useDaos();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const myAddress = wallet?.account.address ?? null;
  const isConnected = status === "connected";

  const { totalMembers, totalProposals } = useMemo(() => {
    let members = 0;
    let proposals = 0;
    for (const d of daos) {
      members += d.data.memberCount;
      proposals += Number(d.data.applicationCount);
    }
    return { totalMembers: members, totalProposals: proposals };
  }, [daos]);

  const filtered = useMemo(() => {
    const list = daos.filter((d) => matches(search, d));
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "members") {
        return b.data.memberCount - a.data.memberCount;
      }
      if (sort === "proposals") {
        return Number(b.data.applicationCount - a.data.applicationCount);
      }
      // No direct field for treasury / recent — approximate with applicationCount + memberCount
      const score = (d: DaoSummary) =>
        Number(d.data.applicationCount) * 3 + d.data.memberCount;
      return score(b) - score(a);
    });
    return sorted;
  }, [daos, search, sort]);

  return (
    <div className="space-y-12 pb-24">
      <section className="relative pt-1">
        {/* Eyebrow rail: version stamp / cluster / system status */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
          <div className="flex items-center gap-2.5">
            <span className="rounded-[4px] border border-border-strong/70 bg-surface-1/60 px-1.5 py-px text-[10px] tabular-nums text-foreground">
              v1.0
            </span>
            <span className="opacity-90">Solana / Devnet</span>
            <span
              aria-hidden="true"
              className="hidden h-px w-7 bg-border-strong/60 md:inline-block"
            />
            <span className="hidden text-foreground/70 md:inline">
              Production-grade DAO infrastructure
            </span>
          </div>
          <div className="flex items-center gap-2 text-foreground/80">
            <span className="size-1.5 rounded-full bg-success animate-pulse-soft" />
            <span>
              <span className="text-success">Operational</span> ·{" "}
              <span className="tabular-nums text-foreground">
                {fmtNum(daos.length)}
              </span>{" "}
              DAOs live
            </span>
          </div>
        </div>
        <div className="mt-3 h-px w-full bg-linear-to-r from-transparent via-border-strong/60 to-transparent" />

        {/* Main hero */}
        <div className="relative mt-10 grid gap-10 md:grid-cols-12 md:items-end lg:gap-14">
          {/* Headline column */}
          <div className="relative md:col-span-7 lg:col-span-8">
            {/* Top-left crop mark */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-2 -top-4 size-7 rounded-tl-md border-l-2 border-t-2 border-primary/60"
            />
            {/* Bottom-right accent */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-3 right-2 hidden size-7 rounded-br-md border-b-2 border-r-2 border-secondary/40 md:block"
            />

            <h1 className="font-display font-bold leading-[0.95] tracking-tight text-[clamp(2.6rem,6.6vw,5.5rem)]">
              <span className="block">
                Pooled by <span className="gradient-text">donors</span>
                <span className="text-foreground/30">.</span>
              </span>
              <span className="block">
                Voted by <span className="gradient-text">members</span>
                <span className="text-foreground/30">.</span>
              </span>
              <span className="mt-3 block text-[clamp(0.95rem,1.6vw,1.35rem)] font-medium italic leading-snug tracking-tight text-foreground-muted">
                Settled on Solana — every state transition verifiable on-chain.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-[15px] leading-[1.65] text-foreground-muted md:text-[17px]">
              A full-stack protocol for community-funded scholarships. Donors
              pool SOL into a program-derived treasury, members deliberate in
              the open, and approved scholarships disburse automatically the
              moment voting ends — no admin key, no middleman, nothing off-chain
              to trust.
            </p>

            {/* Numbered protocol rules */}
            <ul className="mt-7 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              {PROTOCOL_RULES.map((rule, i) => (
                <li
                  key={rule}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-low bg-surface-2/70 px-2 py-1 text-foreground/85 transition hover:border-border-strong"
                >
                  <span className="tabular-nums text-foreground-muted/70">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="h-3 w-px bg-border-low" aria-hidden="true" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#dao-grid" className="btn-primary">
                Browse all DAOs
              </a>
              <Link href="/me" className="btn-ghost">
                My Workspace
              </Link>
              <span className="hidden items-center gap-1.5 text-xs text-foreground-muted md:inline-flex">
                or press <kbd className="kbd">/</kbd> to search
              </span>
            </div>
          </div>

          {/* Live on-chain panel */}
          <aside
            className="relative md:col-span-5 lg:col-span-4"
            aria-label="Live on-chain metrics"
          >
            {/* Vertical mono stamp */}
            <span
              aria-hidden="true"
              className="absolute -left-3 top-1 hidden origin-bottom-left -rotate-90 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.25em] text-foreground-muted/60 lg:block"
            >
              {"// LIVE FEED · RPC POLLED"}
            </span>

            <div className="relative rounded-3xl border border-border bg-surface-1/85 p-5 shadow-soft backdrop-blur-md">
              <div className="absolute -top-2 left-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
                <span className="size-1.5 rounded-full bg-success animate-pulse-soft" />
                Live · Refresh 30s
              </div>

              <div className="mt-3 grid grid-cols-3 divide-x divide-border-low">
                <Stat
                  label="DAOs"
                  value={isLoading && daos.length === 0 ? "—" : fmtNum(daos.length)}
                  accent="primary"
                />
                <Stat
                  label="Members"
                  value={isLoading && daos.length === 0 ? "—" : fmtNum(totalMembers)}
                  accent="accent"
                />
                <Stat
                  label="Proposals"
                  value={
                    isLoading && daos.length === 0 ? "—" : fmtNum(totalProposals)
                  }
                  accent="secondary"
                />
              </div>

              <div className="mt-5 h-px w-full bg-linear-to-r from-transparent via-border to-transparent" />

              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-foreground-muted">
                <span className="font-mono">
                  Live from Solana RPC · auto-refresh every 30s
                </span>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    Wallet ready
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                    Connect wallet to create
                    <span aria-hidden="true">→</span>
                  </span>
                )}
              </div>
            </div>

            {/* Feature pill grid */}
            <ul className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border-low bg-border-low/80 text-[11px]">
              {FEATURE_PILLS.map((f) => (
                <li
                  key={f.label}
                  className="flex items-center justify-between gap-2 bg-surface-1/95 px-3 py-2.5"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`size-1.5 rounded-full ${f.dot}`}
                      aria-hidden="true"
                    />
                    <span className="text-foreground/85">{f.label}</span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-foreground-muted/80">
                    {f.detail}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section id="dao-grid" className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">Explore DAOs</h2>
            <p className="text-sm text-foreground-muted">
              On-chain data refreshes every 30 seconds. Click any card to open
              its workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, description, or address"
                className="input-soft w-[260px] pr-9"
              />
              <span className="kbd absolute right-2 top-1/2 -translate-y-1/2">
                /
              </span>
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="input-soft h-[46px] w-auto py-0 text-sm"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        {isLoading && daos.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={240} />
            ))}
            <Skeleton height={240} />
          </div>
        ) : error && daos.length === 0 ? (
          <EmptyState
            variant="default"
            title="Couldn't load DAOs"
            description="Check your network or cluster, then try again."
          />
        ) : daos.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="md:col-span-2">
              <EmptyState
                variant="seed"
                title="No DAOs yet"
                description="Be the first creator: connect a wallet, fill in a name and description, set the voting rules, and ship it."
              />
            </div>
            <CreateDaoCard mode="compact" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="default"
            title="No matching DAOs"
            description={`Nothing matches "${search}". Try a different keyword.`}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((d) => (
              <DaoCard key={d.address} dao={d} myAddress={myAddress} />
            ))}
            <CreateDaoCard mode="compact" />
          </div>
        )}
      </section>
    </div>
  );
}

type StatAccent = "primary" | "accent" | "secondary";

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: StatAccent;
}) {
  const accentClass =
    accent === "primary"
      ? "text-primary-strong"
      : accent === "accent"
        ? "text-accent-strong"
        : "text-secondary-strong";
  return (
    <div className="flex flex-col gap-1.5 px-3 first:pl-0 last:pr-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
        {label}
      </span>
      <span
        className={`font-display text-[2rem] font-bold leading-none tabular-nums ${accentClass}`}
      >
        {value}
      </span>
    </div>
  );
}
