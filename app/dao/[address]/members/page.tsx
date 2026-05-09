import { address as toAddress } from "@solana/kit";
import { MembersTab } from "./members-tab";

type Props = {
  params: Promise<{ address: string }>;
};

export default async function MembersPage({ params }: Props) {
  const { address } = await params;
  return <MembersTab daoAddress={toAddress(address)} />;
}
