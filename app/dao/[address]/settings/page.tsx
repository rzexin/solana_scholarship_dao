import { address as toAddress } from "@solana/kit";
import { SettingsTab } from "./settings-tab";

type Props = {
  params: Promise<{ address: string }>;
};

export default async function SettingsPage({ params }: Props) {
  const { address } = await params;
  return <SettingsTab daoAddress={toAddress(address)} />;
}
