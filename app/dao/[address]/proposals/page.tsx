import { address as toAddress } from "@solana/kit";
import { ProposalsTab } from "./proposals-tab";

type Props = {
  params: Promise<{ address: string }>;
};

export default async function ProposalsPage({ params }: Props) {
  const { address } = await params;
  return <ProposalsTab daoAddress={toAddress(address)} />;
}
