"use client";

import useSWR from "swr";
import { type Address, type Signature } from "@solana/kit";
import { useSolanaClient } from "../solana-client-context";
import { useCluster } from "../../components/cluster-context";

export type ActivityKind =
  | "init"
  | "metadata"
  | "donate"
  | "apply"
  | "vote"
  | "execute"
  | "cancel"
  | "unknown";

export type ActivityEntry = {
  signature: Signature;
  slot: bigint;
  blockTime: number | null;
  kind: ActivityKind;
  failed: boolean;
  /** Human-readable summary parsed from program logs */
  summary: string;
};

const KIND_KEYWORDS: Array<[ActivityKind, RegExp]> = [
  ["init", /Instruction:\s*InitializeDao/i],
  ["metadata", /Instruction:\s*UpdateDaoMetadata/i],
  ["donate", /Instruction:\s*Donate/i],
  ["apply", /Instruction:\s*CreateApplication/i],
  ["vote", /Instruction:\s*Vote/i],
  ["execute", /Instruction:\s*Execute/i],
  ["cancel", /Instruction:\s*CancelApplication/i],
];

const KIND_SUMMARY: Record<ActivityKind, string> = {
  init: "DAO initialized",
  metadata: "DAO metadata updated",
  donate: "Donated and joined",
  apply: "Proposal submitted",
  vote: "Vote cast",
  execute: "Proposal executed · funds disbursed",
  cancel: "Proposal canceled",
  unknown: "Other on-chain call",
};

function parseKind(logMessages: string[] | null | undefined): ActivityKind {
  if (!logMessages) return "unknown";
  for (const log of logMessages) {
    for (const [kind, re] of KIND_KEYWORDS) {
      if (re.test(log)) return kind;
    }
  }
  return "unknown";
}

export function useActivity(daoAddress: Address | null, limit = 20) {
  const client = useSolanaClient();
  const { cluster } = useCluster();

  const swr = useSWR<ActivityEntry[]>(
    daoAddress ? (["dao-activity", cluster, daoAddress, limit] as const) : null,
    async () => {
      if (!daoAddress) return [];

      const sigInfos = await client.rpc
        .getSignaturesForAddress(daoAddress, { limit })
        .send();

      const entries: ActivityEntry[] = await Promise.all(
        sigInfos.map(async (info) => {
          let kind: ActivityKind = "unknown";
          try {
            const tx = await client.rpc
              .getTransaction(info.signature, {
                maxSupportedTransactionVersion: 0,
                commitment: "confirmed",
                encoding: "json",
              })
              .send();
            const logs = (tx?.meta?.logMessages ?? []) as readonly string[];
            kind = parseKind([...logs]);
          } catch {
            // Swallow per-tx errors so one bad signature doesn't break the whole page
          }
          return {
            signature: info.signature,
            slot: BigInt(info.slot),
            blockTime: info.blockTime != null ? Number(info.blockTime) : null,
            kind,
            failed: info.err != null,
            summary: KIND_SUMMARY[kind],
          };
        })
      );

      return entries.sort((a, b) => {
        if (a.blockTime != null && b.blockTime != null) {
          return b.blockTime - a.blockTime;
        }
        return Number(b.slot - a.slot);
      });
    },
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  return {
    entries: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    refresh: swr.mutate,
  };
}
