"use client";

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  type Address,
  type Base58EncodedBytes,
  getBase58Decoder,
  getBase64Encoder,
} from "@solana/kit";
import {
  APPLICATION_DISCRIMINATOR,
  MEMBER_DISCRIMINATOR,
  decodeApplication,
  decodeMember,
  getMemberSize,
  type Application,
  type Member,
} from "../generated/scholarship_dao";
import { useWallet } from "../lib/wallet/context";
import { useSolanaClient } from "../lib/solana-client-context";
import { useCluster } from "../components/cluster-context";
import { useDaos } from "../lib/hooks/use-daos";
import { SCHOLARSHIP_DAO_PROGRAM_ID } from "../lib/dao/program";
import { getMemberPda } from "../lib/dao/pdas";
import { DaoCard } from "../components/dao/dao-card";
import { ProposalRow } from "../components/dao/proposal-row";
import { Skeleton, SkeletonList } from "../components/ui/skeleton";
import { EmptyState } from "../components/ui/empty-state";
import { lamportsToSolString } from "../lib/lamports";

type ApplicationWithAddress = { address: Address; data: Application };
type MemberWithAddress = { address: Address; data: Member };

const base58Decoder = getBase58Decoder();
const base64Encoder = getBase64Encoder();

export function MeDashboard() {
  const { wallet, status } = useWallet();
  const client = useSolanaClient();
  const { cluster } = useCluster();
  const { daos, isLoading: daosLoading } = useDaos();
  const myAddress = wallet?.account.address ?? null;

  const swr = useSWR<{
    proposals: ApplicationWithAddress[];
    memberships: MemberWithAddress[];
  }>(
    myAddress ? (["me-snapshot", cluster, myAddress] as const) : null,
    async () => {
      if (!myAddress) return { proposals: [], memberships: [] };

      const appDiscB58 = base58Decoder.decode(
        APPLICATION_DISCRIMINATOR
      ) as Base58EncodedBytes;
      const memDiscB58 = base58Decoder.decode(
        MEMBER_DISCRIMINATOR
      ) as Base58EncodedBytes;
      const myAddressB58 = myAddress as unknown as Base58EncodedBytes;

      // proposer offset in Application = 8 disc + 8 id + 32 dao = 48
      const proposerOffset = 48n;
      // wallet offset in Member = 8 disc = 8 (Member has no `dao` field; the link is the PDA seed)
      const memberWalletOffset = 8n;

      const [appAccounts, memAccounts] = await Promise.all([
        client.rpc
          .getProgramAccounts(SCHOLARSHIP_DAO_PROGRAM_ID, {
            encoding: "base64" as const,
            filters: [
              {
                memcmp: {
                  offset: 0n,
                  bytes: appDiscB58,
                  encoding: "base58" as const,
                },
              },
              {
                memcmp: {
                  offset: proposerOffset,
                  bytes: myAddressB58,
                  encoding: "base58" as const,
                },
              },
            ],
          })
          .send(),
        client.rpc
          .getProgramAccounts(SCHOLARSHIP_DAO_PROGRAM_ID, {
            encoding: "base64" as const,
            filters: [
              {
                memcmp: {
                  offset: 0n,
                  bytes: memDiscB58,
                  encoding: "base58" as const,
                },
              },
              {
                memcmp: {
                  offset: memberWalletOffset,
                  bytes: myAddressB58,
                  encoding: "base58" as const,
                },
              },
            ],
          })
          .send(),
      ]);

      const proposals: ApplicationWithAddress[] = appAccounts
        .map((entry): ApplicationWithAddress | null => {
          const address = entry.pubkey as Address;
          const dataBytes = new Uint8Array(
            base64Encoder.encode(
              typeof entry.account.data === "string"
                ? entry.account.data
                : entry.account.data[0]
            )
          );
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
            // Stale on-chain account from a previous program version.
            return null;
          }
        })
        .filter((x): x is ApplicationWithAddress => x !== null)
        .sort((a, b) => Number(b.data.createdAt - a.data.createdAt));

      const memberships: MemberWithAddress[] = memAccounts
        .map((entry): MemberWithAddress | null => {
          const address = entry.pubkey as Address;
          const dataBytes = new Uint8Array(
            base64Encoder.encode(
              typeof entry.account.data === "string"
                ? entry.account.data
                : entry.account.data[0]
            )
          );
          if (dataBytes.length !== getMemberSize()) return null;
          try {
            const decoded = decodeMember({
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
        .filter((x): x is MemberWithAddress => x !== null)
        .sort((a, b) => Number(b.data.totalDonated - a.data.totalDonated));

      return { proposals, memberships };
    },
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  const myCreatedDaos = useMemo(
    () => (myAddress ? daos.filter((d) => d.data.creator === myAddress) : []),
    [daos, myAddress]
  );

  const memberAddrSet = useMemo(() => {
    const s = new Set<string>();
    swr.data?.memberships.forEach((m) => s.add(m.address));
    return s;
  }, [swr.data]);

  // Cross-reference each DAO's expected memberPda with the user's actual member accounts
  const joinedSwr = useSWR<Set<string>>(
    myAddress && daos.length > 0 && swr.data
      ? ([
          "me-joined",
          cluster,
          myAddress,
          daos.length,
          memberAddrSet.size,
        ] as const)
      : null,
    async () => {
      if (!myAddress) return new Set<string>();
      const pairs = await Promise.all(
        daos.map(async (d) => ({
          dao: d.address,
          mem: await getMemberPda(d.address, myAddress),
        }))
      );
      const matched = pairs
        .filter((p) => memberAddrSet.has(p.mem))
        .map((p) => p.dao as string);
      return new Set<string>(matched);
    }
  );

  const myJoinedDaos = useMemo(() => {
    const set = joinedSwr.data ?? new Set<string>();
    return daos.filter(
      (d) => set.has(d.address) && d.data.creator !== myAddress
    );
  }, [daos, joinedSwr.data, myAddress]);

  const totalDonated = useMemo(
    () =>
      swr.data?.memberships.reduce((acc, m) => acc + m.data.totalDonated, 0n) ??
      0n,
    [swr.data]
  );

  if (status !== "connected" || !myAddress) {
    return (
      <EmptyState
        title="No wallet connected"
        description="Connect a wallet to see the DAOs you created, the DAOs you joined, and the proposals you've submitted."
      />
    );
  }

  const isLoading = swr.isLoading || daosLoading;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-foreground-muted">
          My Workspace
        </p>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          Welcome back, {myAddress.slice(0, 4)}…{myAddress.slice(-4)}
        </h1>
        <p className="max-w-2xl text-sm text-foreground-muted">
          A consolidated view of your on-chain footprint: the DAOs you created,
          the DAOs you joined, and the proposals you&apos;ve submitted.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="workspace-card p-4">
          <p className="text-xs uppercase tracking-wider text-foreground-muted">
            DAOs created
          </p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            {myCreatedDaos.length}
          </p>
        </div>
        <div className="workspace-card p-4">
          <p className="text-xs uppercase tracking-wider text-foreground-muted">
            DAOs joined
          </p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            {memberAddrSet.size}
          </p>
        </div>
        <div className="workspace-card p-4">
          <p className="text-xs uppercase tracking-wider text-foreground-muted">
            Proposals submitted
          </p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            {swr.data?.proposals.length ?? 0}
          </p>
        </div>
        <div className="workspace-card p-4">
          <p className="text-xs uppercase tracking-wider text-foreground-muted">
            Total donated
          </p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums">
            {lamportsToSolString(totalDonated as never, 3)}
            <span className="ml-1 text-sm font-medium text-foreground-muted">
              SOL
            </span>
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">DAOs you created</h2>
          <Link
            href="/"
            className="text-xs text-primary-strong hover:underline"
          >
            Create a new DAO →
          </Link>
        </div>
        {isLoading && myCreatedDaos.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton height={210} />
            <Skeleton height={210} />
          </div>
        ) : myCreatedDaos.length === 0 ? (
          <EmptyState
            title="You haven't created a DAO yet"
            description="It takes one transaction to become a DAO's creator and admin."
            action={
              <Link href="/" className="btn-primary">
                Create one
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myCreatedDaos.map((d) => (
              <DaoCard key={d.address} dao={d} myAddress={myAddress} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">DAOs you joined</h2>
        {isLoading && myJoinedDaos.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton height={210} />
            <Skeleton height={210} />
          </div>
        ) : myJoinedDaos.length === 0 ? (
          <EmptyState
            title="You haven't joined any DAO"
            description="Donate to any DAO's treasury (≥ min_donation) to become a member."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myJoinedDaos.map((d) => (
              <DaoCard key={d.address} dao={d} myAddress={myAddress} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">
          Proposals you submitted
        </h2>
        {isLoading && (swr.data?.proposals.length ?? 0) === 0 ? (
          <SkeletonList rows={3} />
        ) : (swr.data?.proposals.length ?? 0) === 0 ? (
          <EmptyState
            variant="vote"
            title="No proposals submitted yet"
            description="Open any DAO workspace → Proposals → New Proposal."
          />
        ) : (
          <ul className="space-y-3">
            {swr.data!.proposals.map((p) => (
              <ProposalRow key={p.address} app={p} daoAddress={p.data.dao} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
