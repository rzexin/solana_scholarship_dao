import type { Address } from "@solana/kit";
import {
  findApplicationPda,
  findDaoPda,
  findMemberPda,
  findTreasuryPda,
  findVoteRecordPda,
} from "../../generated/scholarship_dao";

export async function getDaoPda(
  creator: Address,
  daoId: bigint,
): Promise<Address> {
  const [pda] = await findDaoPda({ creator, daoId });
  return pda;
}

export async function getTreasuryPda(dao: Address): Promise<Address> {
  const [pda] = await findTreasuryPda({ dao });
  return pda;
}

export async function getMemberPda(
  dao: Address,
  wallet: Address
): Promise<Address> {
  const [pda] = await findMemberPda({ dao, donor: wallet });
  return pda;
}

export async function getApplicationPda(
  dao: Address,
  id: bigint
): Promise<Address> {
  const [pda] = await findApplicationPda({ dao, applicationId: id });
  return pda;
}

export async function getVotePda(
  application: Address,
  member: Address
): Promise<Address> {
  const [pda] = await findVoteRecordPda({ application, member });
  return pda;
}
