/**
 * open-banking kotoba — record types.
 *
 * Per ADR-2605203000 Option B (PDS XRPC). Core-Banking MVP — DID-addressed
 * accounts + double-entry ledger; balance never stored, always derived
 * from SUM(credit) − SUM(debit) per account.
 *
 * Vendor's open-banking uses D1 (SQLite) with strongly-serialized
 * batch() transactions for atomic transfers. On the etzhayyim substrate
 * per ADR-2605172000:
 * - 2 LedgerEntry records (debit + credit) per transfer
 * - shared transferId in both entries
 * - shared clientRequestId for idempotency
 * - balance = SUM via listLedgerEntries client-side aggregation
 *
 * Per ADR-2605172000 substrate boundary: USDC on Base L2 only for
 * actual fund movement; this app is the kotoba metadata layer that
 * tracks balances in a unit-of-account agnostic manner (currency code
 * field per LedgerEntry). On-chain settlement is a separate function
 * outside this kotoba package.
 *
 * Identity hierarchy:
 *   did:web:open-banking.etzhayyim.com                            — controller
 *   did:web:open-banking.etzhayyim.com:account:{accountId-slug}   — Account
 *   did:web:open-banking.etzhayyim.com:ledger:{entrySeq}          — LedgerEntry
 *   did:web:open-banking.etzhayyim.com:transfer:{transferId-slug} — Transfer (logical group)
 */

export const OPEN_BANKING_DID_PREFIX =
  "did:web:open-banking.etzhayyim.com:" as const;

export type AccountKind = "checking" | "savings" | "escrow" | "system";

export type EntryDirection = "debit" | "credit";

// ─── Account tier ───────────────────────────────────────────────────

export interface AccountRecord {
  did: string;
  accountId: string;
  ownerDid: string;
  kind: AccountKind;
  currency: string;
  /** ISO-4217 3-letter code OR "USDC" / "USDT" / "ETH" etc. for crypto. */
  displayName?: string;
  openedAt: string;
  closedAt?: string;
  createdAt: string;
}

export interface AccountView extends AccountRecord {
  accountUri: string;
  /** Derived balance in smallest unit (e.g. cents). Set by callers
   *  after a SUM walk; not persisted. */
  balanceMinor?: number;
}

export interface CreateAccountInput {
  accountId: string;
  ownerDid: string;
  kind: AccountKind;
  currency: string;
  displayName?: string;
}

export interface CreateAccountOutput {
  status: "created" | "alreadyExists" | "rejected";
  accountUri?: string;
  did?: string;
  accountId?: string;
  error?: string;
}

export interface GetAccountInput {
  accountId?: string;
  /** When true, walks the ledger to compute current balance. */
  includeBalance?: boolean;
  /** Max ledger entries to scan when computing balance. */
  maxScan?: number;
}

export interface GetAccountOutput {
  account?: AccountView;
  error?: string;
}

export interface ListAccountsInput {
  ownerDid?: string;
  kind?: AccountKind;
  currency?: string;
  limit?: number;
  cursor?: string;
}

export interface ListAccountsOutput {
  items: AccountView[];
  cursor?: string;
  total: number;
}

// ─── Ledger tier ────────────────────────────────────────────────────

export interface LedgerEntryRecord {
  did: string;
  entrySeq: number;
  transferId: string;
  /** Idempotency token from the caller; identical for the 2 entries
   *  of one transfer; ensures replay safety. */
  clientRequestId: string;
  accountDid: string;
  direction: EntryDirection;
  /** Amount in smallest currency unit (e.g. cents, satoshi, wei). */
  amountMinor: number;
  currency: string;
  /** Counterparty account DID (the other side of this transfer). */
  counterpartyAccountDid: string;
  memo?: string;
  occurredAt: string;
  createdAt: string;
}

export interface LedgerEntryView extends LedgerEntryRecord {
  ledgerEntryUri: string;
}

export interface TransferInput {
  transferId: string;
  clientRequestId: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  currency: string;
  memo?: string;
}

export interface TransferOutput {
  status:
    | "transferred"
    | "alreadyProcessed"
    | "rejected"
    | "accountNotFound"
    | "currencyMismatch";
  transferId?: string;
  clientRequestId?: string;
  debitUri?: string;
  creditUri?: string;
  fromAccountDid?: string;
  toAccountDid?: string;
  amountMinor?: number;
  error?: string;
}

export interface ListTransactionsInput {
  accountId?: string;
  /** Filter to entries on or after this ISO date. */
  since?: string;
  limit?: number;
  cursor?: string;
  /** Max ledger entries to scan for running balance computation. */
  maxScan?: number;
}

export interface LedgerEntryWithRunningBalance extends LedgerEntryView {
  /** Running balance after this entry (in smallest currency unit). */
  runningBalanceMinor: number;
}

export interface ListTransactionsOutput {
  items: LedgerEntryWithRunningBalance[];
  cursor?: string;
  total: number;
  truncated?: boolean;
}

// ─── Slug helpers ───────────────────────────────────────────────────

export function idSlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

export function accountDid(accountId: string): string {
  return `${OPEN_BANKING_DID_PREFIX}account:${idSlug(accountId)}`;
}

export function accountRkey(accountId: string): string {
  return `account-${idSlug(accountId)}`;
}

export function transferDid(transferId: string): string {
  return `${OPEN_BANKING_DID_PREFIX}transfer:${idSlug(transferId)}`;
}

export function ledgerEntryRkey(transferId: string, direction: EntryDirection): string {
  return `ledger-${idSlug(transferId)}-${direction}`;
}

export function ledgerEntryDid(transferId: string, direction: EntryDirection): string {
  return `${OPEN_BANKING_DID_PREFIX}ledger:${idSlug(transferId)}-${direction}`;
}
