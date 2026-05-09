"use client";

import useSWR from "swr";
import {
  type Address,
  type Base58EncodedBytes,
  getBase58Decoder,
  getBase64Encoder,
} from "@solana/kit";
import {
  MEMBER_DISCRIMINATOR,
  decodeMember,
  getMemberSize,
  type Member,
} from "../../generated/scholarship_dao";
import { useSolanaClient } from "../solana-client-context";
import { useCluster } from "../../components/cluster-context";
import { SCHOLARSHIP_DAO_PROGRAM_ID } from "../dao/program";
import { getMemberPda } from "../dao/pdas";

export type MemberWithAddress = {
  address: Address;
  data: Member;
};

const base58Decoder = getBase58Decoder();
const base64Encoder = getBase64Encoder();

export function useMembers(daoAddress: Address | null) {
  const client = useSolanaClient();
  const { cluster } = useCluster();

  const swr = useSWR<MemberWithAddress[]>(
    daoAddress ? (["dao-members", cluster, daoAddress] as const) : null,
    async () => {
      if (!daoAddress) return [];
      const discB58 = base58Decoder.decode(
        MEMBER_DISCRIMINATOR
      ) as Base58EncodedBytes;

      const accounts = await client.rpc
        .getProgramAccounts(SCHOLARSHIP_DAO_PROGRAM_ID, {
          encoding: "base64" as const,
          filters: [
            {
              memcmp: {
                offset: 0n,
                bytes: discB58,
                encoding: "base58" as const,
              },
            },
          ],
        })
        .send();

      const matches = await Promise.all(
        accounts.map(async (entry) => {
          const address = entry.pubkey as Address;
          const dataBytes = new Uint8Array(
            base64Encoder.encode(
              typeof entry.account.data === "string"
                ? entry.account.data
                : entry.account.data[0]
            )
          );
          // Defensive: skip accounts whose byte layout doesn't match the
          // current Member schema (e.g. stale accounts from older program
          // deployments). Otherwise a single malformed account would crash
          // the whole list.
          if (dataBytes.length !== getMemberSize()) {
            return null;
          }
          try {
            const decoded = decodeMember({
              address,
              data: dataBytes,
              executable: entry.account.executable,
              lamports: entry.account.lamports,
              programAddress: entry.account.owner,
              space: BigInt(entry.account.space ?? 0),
            });
            const expected = await getMemberPda(daoAddress, decoded.data.wallet);
            if (expected !== address) return null;
            return { address, data: decoded.data };
          } catch {
            return null;
          }
        })
      );

      return matches
        .filter((x): x is MemberWithAddress => x !== null)
        .sort((a, b) => Number(b.data.totalDonated - a.data.totalDonated));
    },
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  return {
    members: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    refresh: swr.mutate,
  };
}
