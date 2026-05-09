import { address as toAddress } from "@solana/kit";
import { ProposalDetail } from "./proposal-detail";

type Props = {
  params: Promise<{ address: string; id: string }>;
};

export default async function ProposalPage({ params }: Props) {
  const { address, id } = await params;
  return <ProposalDetail daoAddress={toAddress(address)} idStr={id} />;
}
