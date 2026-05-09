"use client";

import useSWR from "swr";
import { useCallback } from "react";
import {
  type Address,
  type Base58EncodedBytes,
  getBase58Decoder,
  getBase64Encoder,
} from "@solana/kit";
import {
  DAO_DISCRIMINATOR,
  decodeDao,
  getDaoSize,
  type Dao,
} from "../../generated/scholarship_dao";
import { useSolanaClient } from "../solana-client-context";
import { useCluster } from "../../components/cluster-context";
import { SCHOLARSHIP_DAO_PROGRAM_ID } from "../dao/program";

export type DaoSummary = {
  address: Address;
  data: Dao;
};

const base58Decoder = getBase58Decoder();
const base64Encoder = getBase64Encoder();

export function useDaos() {
  const client = useSolanaClient();
  const { cluster } = useCluster();

  const swr = useSWR<DaoSummary[]>(
    ["dao-list", cluster] as const,
    async () => {
      const discriminatorB58 = base58Decoder.decode(
        DAO_DISCRIMINATOR
      ) as Base58EncodedBytes;

      const accounts = await client.rpc
        .getProgramAccounts(SCHOLARSHIP_DAO_PROGRAM_ID, {
          encoding: "base64" as const,
          filters: [
            {
              memcmp: {
                offset: 0n,
                bytes: discriminatorB58,
                encoding: "base58" as const,
              },
            },
          ],
        })
        .send();

      return accounts
        .map((entry): DaoSummary | null => {
          const address = entry.pubkey as Address;
          const dataBytes = new Uint8Array(
            base64Encoder.encode(
              typeof entry.account.data === "string"
                ? entry.account.data
                : entry.account.data[0]
            )
          );
          // Skip stale on-chain accounts that don't match the current Dao
          // schema (e.g. pre-migration accounts created with older program
          // versions). Their byte length differs from the codec's fixed size,
          // so attempting to decode them throws INVALID_BYTE_LENGTH and would
          // otherwise reject the entire SWR fetcher → "Couldn't load DAOs".
          if (dataBytes.length !== getDaoSize()) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                `[useDaos] skipping ${address}: size ${dataBytes.length} != expected ${getDaoSize()} (likely a legacy DAO from a previous program version)`
              );
            }
            return null;
          }
          try {
            const decoded = decodeDao({
              address,
              data: dataBytes,
              executable: entry.account.executable,
              lamports: entry.account.lamports,
              programAddress: entry.account.owner,
              space: BigInt(entry.account.space ?? 0),
            });
            return { address, data: decoded.data };
          } catch (err) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(`[useDaos] failed to decode ${address}:`, err);
            }
            return null;
          }
        })
        .filter((x): x is DaoSummary => x !== null)
        .sort((a, b) =>
          Number(b.data.applicationCount - a.data.applicationCount)
        );
    },
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  const refresh = useCallback(() => swr.mutate(), [swr]);

  return {
    daos: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    refresh,
    mutate: swr.mutate,
  };
}
