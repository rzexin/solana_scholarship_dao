import { address as toAddress } from "@solana/kit";
import { TreasuryTab } from "./treasury-tab";

type Props = {
  params: Promise<{ address: string }>;
};

export default async function TreasuryPage({ params }: Props) {
  const { address } = await params;
  return <TreasuryTab daoAddress={toAddress(address)} />;
}
