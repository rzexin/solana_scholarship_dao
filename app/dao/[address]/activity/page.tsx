import { address as toAddress } from "@solana/kit";
import { ActivityTab } from "./activity-tab";

type Props = {
  params: Promise<{ address: string }>;
};

export default async function ActivityPage({ params }: Props) {
  const { address } = await params;
  return <ActivityTab daoAddress={toAddress(address)} />;
}
