import type { ReactNode } from "react";
import type { Address } from "@solana/kit";
import { DaoHeader } from "./dao-header";
import { DaoTabBar } from "./dao-tab-bar";

type Props = {
  daoAddress: Address;
  children: ReactNode;
};

/**
 * Shared chrome for the DAO workspace: sticky DAO header + tab bar + main area.
 * Wraps every /dao/[address]/* subpage.
 */
export function WorkspaceShell({ daoAddress, children }: Props) {
  return (
    <div className="space-y-5">
      <DaoHeader daoAddress={daoAddress} />
      <DaoTabBar daoAddress={daoAddress} />
      <div className="space-y-4">{children}</div>
    </div>
  );
}
