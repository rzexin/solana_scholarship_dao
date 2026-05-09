import { address as toAddress } from "@solana/kit";
import { OverviewTab } from "./overview-tab";

type Props = {
  params: Promise<{ address: string }>;
};

export default async function DaoOverviewPage({ params }: Props) {
  const { address } = await params;
  const parsed = toAddress(address);
  return <OverviewTab daoAddress={parsed} />;
}
