"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { type Address, type Signature } from "@solana/kit";
import { useSolanaClient } from "../solana-client-context";
import { useCluster } from "../../components/cluster-context";

export type TreasuryPoint = {
  /** Unix ms (may be nudged by ±a few ms to keep X strictly increasing) */
  t: number;
  /** Treasury balance in lamports right after this transaction */
  lamports: bigint;
  signature: Signature;
  slot: bigint;
};

const HISTORY_LIMIT = 50;
const CONCURRENCY = 4; // public RPC endpoints rate-limit aggressively
const RETRY_BASE_MS = 350;
const MAX_RETRIES = 4;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Cached transaction → balance lookup. Confirmed transactions are immutable,
 * so we cache them in localStorage forever and never re-fetch the same sig.
 */
type CachedRow = {
  t: number;
  lamports: string; // bigint serialized
  slot: string; // bigint serialized
};

const CACHE_VERSION = "v1";
const cacheKey = (cluster: string, treasury: string) =>
  `treasury-history:${CACHE_VERSION}:${cluster}:${treasury}`;

function loadCache(cluster: string, treasury: string) {
  if (typeof window === "undefined") return new Map<string, CachedRow>();
  try {
    const raw = window.localStorage.getItem(cacheKey(cluster, treasury));
    if (!raw) return new Map<string, CachedRow>();
    const obj = JSON.parse(raw) as Record<string, CachedRow>;
    return new Map<string, CachedRow>(Object.entries(obj));
  } catch {
    return new Map<string, CachedRow>();
  }
}

function saveCache(
  cluster: string,
  treasury: string,
  cache: Map<string, CachedRow>
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      cacheKey(cluster, treasury),
      JSON.stringify(Object.fromEntries(cache))
    );
  } catch {
    // ignore quota / private mode errors
  }
}

/**
 * Reconstructs the treasury balance over time by replaying the post-balance of
 * the treasury PDA across recent signatures that touched it.
 *
 * Optimizations:
 * - Bounded concurrency (CONCURRENCY at a time) to avoid 429s
 * - Exponential backoff retry on rate-limit / network failures
 * - localStorage cache of confirmed (signature → row) so refreshes only fetch
 *   the new tail
 * - `transactionDetails: "accounts"` keeps RPC payloads tiny
 */
export function useTreasuryHistory(treasuryAddress: Address | null) {
  const client = useSolanaClient();
  const { cluster } = useCluster();
  // Cache lives in module-stable state per (cluster, treasury). We don't need
  // it to drive renders; it's a side store.
  const [, forceTick] = useState(0);

  useEffect(() => {
    // Hydrate / no-op; this just guarantees the effect re-runs on mount so
    // we read from localStorage in the browser, not in SSR.
    forceTick((x) => x + 1);
  }, []);

  const swr = useSWR<TreasuryPoint[]>(
    treasuryAddress
      ? (["treasury-history", cluster, treasuryAddress] as const)
      : null,
    async () => {
      if (!treasuryAddress) return [];
      const treasuryStr = treasuryAddress as unknown as string;
      const cache = loadCache(cluster, treasuryStr);

      const sigInfos = await client.rpc
        .getSignaturesForAddress(treasuryAddress, { limit: HISTORY_LIMIT })
        .send();
      if (sigInfos.length === 0) return [];

      // Partition: which signatures we already know about, which ones need
      // a network round-trip.
      const toFetch = sigInfos.filter(
        (info) =>
          info.err == null &&
          info.blockTime != null &&
          !cache.has(info.signature as unknown as string)
      );

      // Bounded-concurrency worker pool with retry on transient failures
      // (HTTP 429, network errors, etc).
      const queue = [...toFetch];
      const fetchOne = async (
        info: (typeof toFetch)[number]
      ): Promise<void> => {
        let attempt = 0;
        while (attempt <= MAX_RETRIES) {
          try {
            const tx = await client.rpc
              .getTransaction(info.signature, {
                maxSupportedTransactionVersion: 0,
                commitment: "confirmed",
                encoding: "json",
              })
              .send();

            if (!tx?.meta) return;

            const message = tx.transaction.message;
            const staticKeys = (message.accountKeys ?? []) as readonly string[];
            const loadedWritable = (tx.meta.loadedAddresses?.writable ??
              []) as readonly string[];
            const loadedReadonly = (tx.meta.loadedAddresses?.readonly ??
              []) as readonly string[];
            const allKeys = [
              ...staticKeys,
              ...loadedWritable,
              ...loadedReadonly,
            ];

            const idx = allKeys.indexOf(treasuryStr);
            if (idx < 0) return;

            const post = tx.meta.postBalances?.[idx];
            if (post == null) return;

            cache.set(info.signature as unknown as string, {
              t: Number(info.blockTime) * 1000,
              lamports: String(post),
              slot: String(info.slot),
            });
            return;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const isRateLimit =
              msg.includes("429") ||
              msg.toLowerCase().includes("rate") ||
              msg.toLowerCase().includes("too many");
            if (attempt >= MAX_RETRIES) return; // give up silently
            const wait =
              RETRY_BASE_MS * Math.pow(2, attempt) +
              Math.floor(Math.random() * 200);
            await sleep(isRateLimit ? wait * 2 : wait);
            attempt++;
          }
        }
      };

      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
          const next = queue.shift();
          if (!next) break;
          await fetchOne(next);
          // Polite spacing between successive requests on the same worker
          await sleep(80);
        }
      });
      await Promise.all(workers);

      saveCache(cluster, treasuryStr, cache);

      // Materialize points from cache, restricted to the signatures we just
      // saw on-chain (so very old, possibly-evicted ones still get filtered).
      const onChainSigs = new Set(
        sigInfos.map((i) => i.signature as unknown as string)
      );
      const rows: TreasuryPoint[] = [];
      for (const [sig, row] of cache) {
        if (!onChainSigs.has(sig)) continue;
        rows.push({
          t: row.t,
          lamports: BigInt(row.lamports),
          slot: BigInt(row.slot),
          signature: sig as unknown as Signature,
        });
      }

      // Sort by (blockTime asc, slot asc) so multiple txs sharing a second
      // land in the actual on-chain order.
      rows.sort((a, b) => {
        if (a.t !== b.t) return a.t - b.t;
        if (a.slot < b.slot) return -1;
        if (a.slot > b.slot) return 1;
        return 0;
      });

      // Nudge points that share the exact same `t` so the X axis is strictly
      // monotonic; otherwise recharts can render visual ghosting.
      const nudged: TreasuryPoint[] = [];
      let lastT = -Infinity;
      for (const p of rows) {
        const t = p.t > lastT ? p.t : lastT + 1;
        nudged.push({ ...p, t });
        lastT = t;
      }
      return nudged;
    },
    {
      // Slow refresh: confirmed history barely changes; we mostly care about
      // the live "now" anchor in the chart, which is reconciled separately
      // from `currentTreasuryLamports` without an RPC call.
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
      revalidateIfStale: false,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  );

  return {
    points: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    refresh: swr.mutate,
  };
}
