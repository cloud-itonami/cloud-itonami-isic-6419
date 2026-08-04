/**
 * open-banking kotoba — barrel.
 *
 * Per ADR-2605203000 Option B Phase E reference impl. Core-banking MVP
 * with double-entry ledger; balance derived from SUM(credit) − SUM(debit).
 *
 * Slice 1: 5 of 5 canonical commands ported.
 *   createAccount + getAccount + listAccounts + transfer + listTransactions
 *
 * Note (per ADR-2605172000 substrate boundary): actual on-chain settlement
 * (USDC on Base L2) is OUTSIDE this package. This layer tracks ledger
 * metadata only — a separate Settlement function (future) handles
 * on-chain wire transfers.
 */

export * from "./types.js";
export {
  createAccount,
  getAccount,
  listAccounts,
  transfer,
  listTransactions,
} from "./banking.js";
