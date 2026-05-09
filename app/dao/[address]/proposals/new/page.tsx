import { address as toAddress } from "@solana/kit";
import { CreateProposalForm } from "./create-proposal-form";

type Props = {
  params: Promise<{ address: string }>;
};

export default async function NewProposalPage({ params }: Props) {
  const { address } = await params;
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div>
        <CreateProposalForm daoAddress={toAddress(address)} />
      </div>
      <aside className="workspace-card space-y-3 p-5 text-sm" data-tone="cool">
        <h3 className="font-display text-base font-bold">Tips</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-foreground-muted">
          <li>The proposal id auto-increments on-chain — no need to fill it in.</li>
          <li>
            Amount must be ≤ the treasury balance. The check runs again at
            execution time and the call will fail otherwise.
          </li>
          <li>
            The voting period is set on the DAO. Once a proposal is created,{" "}
            <span className="font-mono">voting_ends_at</span> is locked in.
          </li>
          <li>
            After submission you can cancel the proposal from the Proposals tab
            (only while it is{" "}
            <span className="font-mono">Pending</span>).
          </li>
        </ul>
      </aside>
    </div>
  );
}
