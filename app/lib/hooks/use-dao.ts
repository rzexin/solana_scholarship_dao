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
  APPLICATION_DISCRIMINATOR,
  decodeApplication,
  fetchAllMaybeVoteRecord,
  fetchMaybeDao,
  fetchMaybeMember,
  type Application,
  type Dao,
  type Member,
} from "../../generated/scholarship_dao";
import { useSolanaClient } from "../solana-client-context";
import { useCluster } from "../../components/cluster-context";
import { useWallet } from "../wallet/context";
import { SCHOLARSHIP_DAO_PROGRAM_ID } from "../dao/program";
import {
  getApplicationPda,
  getMemberPda,
  getTreasuryPda,
  getVotePda,
} from "../dao/pdas";

export type ApplicationWithAddress = {
  address: Address;
  data: Application;
};

/**
 * The connected wallet's vote on a single proposal: support=true means "for",
 * false means "against". Proposals the wallet hasn't voted on are absent from
 * the map.
 */
export type VoteRecordState = { support: boolean };

export type DaoSnapshot = {
  dao: Dao | null;
  daoAddress: Address | null;
  treasuryAddress: Address | null;
  treasuryLamports: bigint;
  applications: ApplicationWithAddress[];
  memberCount: number;
  currentMember: Member | null;
  currentMemberAddress: Address | null;
  /** Connected wallet's votes on this DAO's proposals, keyed by applicationId.toString() */
  myVotes: Record<string, VoteRecordState>;
};

const EMPTY_SNAPSHOT: DaoSnapshot = {
  dao: null,
  daoAddress: null,
  treasuryAddress: null,
  treasuryLamports: 0n,
  applications: [],
  memberCount: 0,
  currentMember: null,
  currentMemberAddress: null,
  myVotes: {},
};

const base58Decoder = getBase58Decoder();
const base64Encoder = getBase64Encoder();

function discriminatorAsBase58(discriminator: Uint8Array): string {
  return base58Decoder.decode(discriminator);
}

export function useDao(daoAddress: Address | null) {
  const client = useSolanaClient();
  const { cluster } = useCluster();
  const { wallet } = useWallet();
  const walletAddress = wallet?.account.address;

  const swr = useSWR<DaoSnapshot>(
    daoAddress
      ? (["dao-snapshot", cluster, daoAddress, walletAddress ?? ""] as const)
      : null,
    async () => {
      if (!daoAddress) return EMPTY_SNAPSHOT;

      const treasuryAddress = await getTreasuryPda(daoAddress);
      const currentMemberAddress = walletAddress
        ? await getMemberPda(daoAddress, walletAddress)
        : null;

      const [maybeDao, treasuryInfo, maybeMember] = await Promise.all([
        fetchMaybeDao(client.rpc, daoAddress),
        client.rpc
          .getAccountInfo(treasuryAddress, { encoding: "base64" })
          .send(),
        currentMemberAddress
          ? fetchMaybeMember(client.rpc, currentMemberAddress)
          : Promise.resolve(null),
      ]);

      const dao = maybeDao.exists ? maybeDao.data : null;
      const treasuryLamports = treasuryInfo.value
        ? BigInt(treasuryInfo.value.lamports)
        : 0n;
      const currentMember =
        maybeMember && maybeMember.exists ? maybeMember.data : null;

      // Trust dao.memberCount as written by the program (initialize_dao starts at 0,
      // donate increments by 1 for each new member)
      const memberCount = dao ? Number(dao.memberCount) : 0;

      // Scan only applications and locate via the `dao` field
      // (offset = 8 discriminator bytes + 8 id bytes = 16)
      const applicationDiscriminatorB58 = discriminatorAsBase58(
        APPLICATION_DISCRIMINATOR
      ) as Base58EncodedBytes;

      const appAccounts = await client.rpc
        .getProgramAccounts(SCHOLARSHIP_DAO_PROGRAM_ID, {
          encoding: "base64" as const,
          filters: [
            {
              memcmp: {
                offset: 0n,
                bytes: applicationDiscriminatorB58,
                encoding: "base58" as const,
              },
            },
            {
              memcmp: {
                offset: 16n,
                bytes: daoAddress as unknown as Base58EncodedBytes,
                encoding: "base58" as const,
              },
            },
          ],
        })
        .send();

      const applicationsAll: ApplicationWithAddress[] = appAccounts
        .map((entry): ApplicationWithAddress | null => {
          const address = entry.pubkey as Address;
          const dataBytes = new Uint8Array(
            base64Encoder.encode(
              typeof entry.account.data === "string"
                ? entry.account.data
                : entry.account.data[0]
            )
          );
          // Applications have a variable byte layout (utf-8 reason / proofCid
          // with size prefix). Legacy on-chain accounts from previous program
          // versions may not decode under the current schema — guard so one
          // bad record doesn't reject the whole SWR fetch.
          try {
            const decoded = decodeApplication({
              address,
              data: dataBytes,
              executable: entry.account.executable,
              lamports: entry.account.lamports,
              programAddress: entry.account.owner,
              space: BigInt(entry.account.space ?? 0),
            });
            return { address, data: decoded.data };
          } catch {
            return null;
          }
        })
        .filter((x): x is ApplicationWithAddress => x !== null);

      // Re-derive each PDA and verify it matches, guarding against forged accounts
      const matchedApps = await Promise.all(
        applicationsAll.map(async (app) => {
          const expected = await getApplicationPda(daoAddress, app.data.id);
          return expected === app.address ? app : null;
        })
      );
      const applications = matchedApps
        .filter((x): x is ApplicationWithAddress => x !== null)
        .sort((a, b) => Number(b.data.id - a.data.id));

      // Batch-fetch the current wallet's VoteRecord for every proposal (only if they are a member)
      const myVotes: Record<string, VoteRecordState> = {};
      if (currentMemberAddress && applications.length > 0) {
        const voteRecordAddresses = await Promise.all(
          applications.map((app) =>
            getVotePda(app.address, currentMemberAddress)
          )
        );
        const voteRecords = await fetchAllMaybeVoteRecord(
          client.rpc,
          voteRecordAddresses
        );
        voteRecords.forEach((record, idx) => {
          if (record.exists) {
            const appId = applications[idx].data.id.toString();
            myVotes[appId] = { support: record.data.support };
          }
        });
      }

      return {
        dao,
        daoAddress,
        treasuryAddress,
        treasuryLamports,
        applications,
        memberCount,
        currentMember,
        currentMemberAddress,
        myVotes,
      };
    },
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  const refresh = useCallback(() => swr.mutate(), [swr]);

  return {
    snapshot: swr.data ?? EMPTY_SNAPSHOT,
    isLoading: swr.isLoading,
    error: swr.error,
    refresh,
    mutate: swr.mutate,
  };
}
