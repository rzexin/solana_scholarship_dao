import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from "@solana/kit";
import {
  getScholarshipDaoErrorMessage,
  type ScholarshipDaoError,
  SCHOLARSHIP_DAO_ERROR__ALREADY_INITIALIZED,
  SCHOLARSHIP_DAO_ERROR__AMOUNT_MUST_BE_POSITIVE,
  SCHOLARSHIP_DAO_ERROR__AMOUNT_OVERFLOW,
  SCHOLARSHIP_DAO_ERROR__APPLICATION_NOT_PENDING,
  SCHOLARSHIP_DAO_ERROR__DONATION_TOO_SMALL,
  SCHOLARSHIP_DAO_ERROR__INSUFFICIENT_TREASURY,
  SCHOLARSHIP_DAO_ERROR__NOT_A_MEMBER,
  SCHOLARSHIP_DAO_ERROR__REASON_TOO_LONG,
  SCHOLARSHIP_DAO_ERROR__RECIPIENT_MISMATCH,
  SCHOLARSHIP_DAO_ERROR__THRESHOLD_NOT_MET,
} from "../generated/scholarship_dao";

const DAO_ERROR_CODES: Record<number, ScholarshipDaoError> = {
  [SCHOLARSHIP_DAO_ERROR__ALREADY_INITIALIZED]:
    SCHOLARSHIP_DAO_ERROR__ALREADY_INITIALIZED,
  [SCHOLARSHIP_DAO_ERROR__AMOUNT_MUST_BE_POSITIVE]:
    SCHOLARSHIP_DAO_ERROR__AMOUNT_MUST_BE_POSITIVE,
  [SCHOLARSHIP_DAO_ERROR__AMOUNT_OVERFLOW]:
    SCHOLARSHIP_DAO_ERROR__AMOUNT_OVERFLOW,
  [SCHOLARSHIP_DAO_ERROR__APPLICATION_NOT_PENDING]:
    SCHOLARSHIP_DAO_ERROR__APPLICATION_NOT_PENDING,
  [SCHOLARSHIP_DAO_ERROR__DONATION_TOO_SMALL]:
    SCHOLARSHIP_DAO_ERROR__DONATION_TOO_SMALL,
  [SCHOLARSHIP_DAO_ERROR__INSUFFICIENT_TREASURY]:
    SCHOLARSHIP_DAO_ERROR__INSUFFICIENT_TREASURY,
  [SCHOLARSHIP_DAO_ERROR__NOT_A_MEMBER]: SCHOLARSHIP_DAO_ERROR__NOT_A_MEMBER,
  [SCHOLARSHIP_DAO_ERROR__REASON_TOO_LONG]:
    SCHOLARSHIP_DAO_ERROR__REASON_TOO_LONG,
  [SCHOLARSHIP_DAO_ERROR__RECIPIENT_MISMATCH]:
    SCHOLARSHIP_DAO_ERROR__RECIPIENT_MISMATCH,
  [SCHOLARSHIP_DAO_ERROR__THRESHOLD_NOT_MET]:
    SCHOLARSHIP_DAO_ERROR__THRESHOLD_NOT_MET,
};

export function parseTransactionError(err: unknown): string {
  if (err instanceof Error && err.message.includes("User rejected")) {
    return "Wallet rejected the signature request.";
  }

  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  ) {
    const code = DAO_ERROR_CODES[err.context.code];
    if (code !== undefined) {
      return getScholarshipDaoErrorMessage(code);
    }
  }

  const message = getDeepestMessage(err);
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

function getDeepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;

  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error) {
      deepest = current.message;
    }
  }

  return deepest;
}
