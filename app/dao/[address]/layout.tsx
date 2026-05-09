import type { ReactNode } from "react";
import { address as toAddress } from "@solana/kit";
import { WorkspaceShell } from "../../components/layout/workspace-shell";
import { EmptyState } from "../../components/ui/empty-state";

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ address: string }>;
};

export default async function DaoLayout({ children, params }: LayoutProps) {
  const { address } = await params;
  let parsed;
  try {
    parsed = toAddress(address);
  } catch {
    return (
      <EmptyState
        variant="default"
        title="Invalid DAO address"
        description={`"${address}" is not a valid base58 public key. Check the URL and try again.`}
      />
    );
  }

  return <WorkspaceShell daoAddress={parsed}>{children}</WorkspaceShell>;
}
