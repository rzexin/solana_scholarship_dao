"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Address } from "@solana/kit";
import { useDao } from "../../../lib/hooks/use-dao";
import { ProposalRow } from "../../../components/dao/proposal-row";
import { Skeleton } from "../../../components/ui/skeleton";
import { EmptyState } from "../../../components/ui/empty-state";
import {
  getProposalLifecycle,
  type ProposalLifecycle,
} from "../../../lib/dao/proposal-status";

type Props = {
  daoAddress: Address;
};

type Sort = "id-desc" | "id-asc" | "votes-desc" | "amount-desc";
type Filter = ProposalLifecycle | "all";

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "id-desc", label: "Newest first" },
  { value: "id-asc", label: "Oldest first" },
  { value: "votes-desc", label: "Most votes" },
  { value: "amount-desc", label: "Largest amount" },
];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "voting", label: "Voting" },
  { value: "ready", label: "Executable" },
  { value: "expired", label: "Expired" },
  { value: "executed", label: "Executed" },
  { value: "cancelled", label: "Canceled" },
];

const PAGE_SIZE = 6;

export function ProposalsTab({ daoAddress }: Props) {
  const { snapshot, isLoading } = useDao(daoAddress);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("id-desc");
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  // Reset to the first page whenever the filter or sort key changes
  const [prevKey, setPrevKey] = useState<string>("");
  const filterKey = `${search}::${filter}::${sort}`;
  if (filterKey !== prevKey) {
    setPrevKey(filterKey);
    if (page !== 0) setPage(0);
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (!snapshot.dao) return [];
    const q = search.trim().toLowerCase();
    const list = snapshot.applications.filter((a) => {
      if (q) {
        const reasonMatch = a.data.reason.toLowerCase().includes(q);
        const recipientMatch = a.data.recipient.toLowerCase().includes(q);
        const proposerMatch = a.data.proposer.toLowerCase().includes(q);
        const idMatch = a.data.id.toString().includes(q);
        if (!reasonMatch && !recipientMatch && !proposerMatch && !idMatch) {
          return false;
        }
      }
      if (filter !== "all") {
        const lc = getProposalLifecycle(a.data, snapshot.dao!, now);
        if (lc.lifecycle !== filter) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      switch (sort) {
        case "id-asc":
          return Number(a.data.id - b.data.id);
        case "votes-desc":
          return (
            b.data.votesFor +
            b.data.votesAgainst -
            (a.data.votesFor + a.data.votesAgainst)
          );
        case "amount-desc":
          return Number((b.data.amount as bigint) - (a.data.amount as bigint));
        default:
          return Number(b.data.id - a.data.id);
      }
    });
    return list;
  }, [snapshot, search, filter, sort, now]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div
        className="workspace-card flex flex-wrap items-center gap-3 p-3"
        data-tone="cool"
      >
        <div className="relative min-w-[220px] flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reason, recipient, proposer, or id"
            className="input-soft pr-10"
          />
          <span className="kbd absolute right-2 top-1/2 -translate-y-1/2">
            /
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              data-active={filter === f.value}
              className="tab-bar-item"
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="input-soft h-[42px] w-auto py-0 text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Link
          href={`/dao/${daoAddress}/proposals/new`}
          className="btn-primary text-sm"
        >
          + New proposal
        </Link>
      </div>

      {isLoading && snapshot.applications.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={180} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          variant={search || filter !== "all" ? "default" : "seed"}
          title={
            search || filter !== "all"
              ? "No matching proposals"
              : "No proposals yet"
          }
          description={
            search || filter !== "all"
              ? "Try a different keyword or filter."
              : "Be the first to submit a proposal and rally votes from the community."
          }
          action={
            !search && filter === "all" ? (
              <Link
                href={`/dao/${daoAddress}/proposals/new`}
                className="btn-primary text-sm"
              >
                New proposal
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <p className="text-xs text-foreground-muted">
            {filtered.length} {filtered.length === 1 ? "proposal" : "proposals"}
            {" · "}page {page + 1} of {totalPages}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((a) => (
              <ProposalRow key={a.address} app={a} daoAddress={daoAddress} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="btn-ghost text-xs"
              >
                Previous
              </button>
              <span className="text-xs text-foreground-muted">
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="btn-ghost text-xs"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
