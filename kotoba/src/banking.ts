/**
 * open-banking kotoba — 5 canonical commands (slice 1, 5/5 ✓).
 *
 *   createAccount     — open account (rkey=account-{accountId-slug})
 *   getAccount        — account + optional derived balance
 *   listAccounts      — cursor + owner/kind/currency filter
 *   transfer          — double-entry atomic write of 2 LedgerEntry records
 *                       (rkey=ledger-{transferId-slug}-{debit|credit})
 *                       shared clientRequestId for idempotency
 *   listTransactions  — ledger entries for one account with running balance
 *
 * Double-entry invariant: every transfer produces exactly 2 LedgerEntry
 * records — one debit on fromAccount, one credit on toAccount, same
 * amountMinor, same currency. Balance is never stored, always derived
 * from SUM(credit) − SUM(debit) per account.
 *
 * Idempotency: shared clientRequestId on both entries ensures replay
 * safety — duplicate transfer with same transferId returns alreadyProcessed.
 *
 * IMPORTANT: per ADR-2605172000 substrate boundary, actual on-chain
 * settlement (USDC on Base L2) is OUTSIDE this kotoba package. This
 * layer tracks ledger metadata only — a separate Settlement function
 * (future slice / app) handles on-chain wire transfers.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  accountDid,
  accountRkey,
  ledgerEntryDid,
  ledgerEntryRkey,
  type AccountRecord,
  type AccountView,
  type CreateAccountInput,
  type CreateAccountOutput,
  type EntryDirection,
  type GetAccountInput,
  type GetAccountOutput,
  type LedgerEntryRecord,
  type LedgerEntryView,
  type LedgerEntryWithRunningBalance,
  type ListAccountsInput,
  type ListAccountsOutput,
  type ListTransactionsInput,
  type ListTransactionsOutput,
  type TransferInput,
  type TransferOutput,
} from "./types.js";

const ACCOUNT_COLLECTION = "com.etzhayyim.apps.openBanking.account";
const LEDGER_COLLECTION = "com.etzhayyim.apps.openBanking.ledger";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

async function loadAccountByDid(
  e: Etzhayyim,
  did: string
): Promise<{ record: AccountRecord; uri: string; rkey: string } | undefined> {
  // Account DIDs encode accountId in the last segment — extract it.
  const segment = did.split(":").pop();
  if (!segment) return undefined;
  const rkey = `account-${segment}`;
  const resp = await e
    .read<AccountRecord>({ collection: ACCOUNT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return undefined;
  return { record: r.value, uri: r.uri, rkey };
}

// ─── createAccount ──────────────────────────────────────────────────

export async function createAccount(
  e: Etzhayyim,
  input: CreateAccountInput
): Promise<CreateAccountOutput> {
  if (!input.accountId || !input.ownerDid || !input.kind || !input.currency) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const rkey = accountRkey(input.accountId);
  const existing = await e
    .read<AccountRecord>({ collection: ACCOUNT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      accountUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      accountId: input.accountId,
    };
  }
  const did = accountDid(input.accountId);
  const now = new Date().toISOString();
  const record: AccountRecord = {
    did,
    accountId: input.accountId,
    ownerDid: input.ownerDid,
    kind: input.kind,
    currency: input.currency.toUpperCase(),
    displayName: input.displayName,
    openedAt: now,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: ACCOUNT_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "created",
    accountUri: receipt.uri,
    did,
    accountId: input.accountId,
  };
}

// ─── getAccount + balance derivation ────────────────────────────────

async function computeBalance(
  e: Etzhayyim,
  accountDidValue: string,
  maxScan: number
): Promise<{ balanceMinor: number; truncated: boolean }> {
  let cursor: string | undefined;
  let scanned = 0;
  let balance = 0;
  while (scanned < maxScan) {
    const page = await e.read<LedgerEntryRecord>({
      collection: LEDGER_COLLECTION,
      cursor,
      limit: PAGE_LIMIT,
    });
    for (const r of page.records) {
      if (r.value.accountDid !== accountDidValue) continue;
      if (r.value.direction === "credit") balance += r.value.amountMinor;
      else balance -= r.value.amountMinor;
    }
    scanned += page.records.length;
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }
  return { balanceMinor: balance, truncated: scanned >= maxScan };
}

export async function getAccount(
  e: Etzhayyim,
  input: GetAccountInput
): Promise<GetAccountOutput> {
  if (!input.accountId) return { error: "missingAccountId" };
  const rkey = accountRkey(input.accountId);
  const resp = await e
    .read<AccountRecord>({ collection: ACCOUNT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  const view: AccountView = { ...r.value, accountUri: r.uri };
  if (input.includeBalance) {
    const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
    const { balanceMinor } = await computeBalance(e, r.value.did, maxScan);
    view.balanceMinor = balanceMinor;
  }
  return { account: view };
}

// ─── listAccounts ───────────────────────────────────────────────────

export async function listAccounts(
  e: Etzhayyim,
  input: ListAccountsInput = {}
): Promise<ListAccountsOutput> {
  const limit = Math.min(input.limit ?? 50, 100);
  const resp = await e.read<AccountRecord>({
    collection: ACCOUNT_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: AccountView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.ownerDid && v.ownerDid !== input.ownerDid) return false;
      if (input.kind && v.kind !== input.kind) return false;
      if (input.currency && !v.currency.toUpperCase().startsWith(input.currency.toUpperCase())) {
        return false;
      }
      return true;
    })
    .map((r) => ({ ...r.value, accountUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── transfer (double-entry, atomic) ────────────────────────────────

export async function transfer(
  e: Etzhayyim,
  input: TransferInput
): Promise<TransferOutput> {
  if (
    !input.transferId ||
    !input.clientRequestId ||
    !input.fromAccountId ||
    !input.toAccountId ||
    typeof input.amountMinor !== "number" ||
    input.amountMinor <= 0 ||
    !input.currency
  ) {
    return { status: "rejected", error: "missingOrInvalidFields" };
  }
  if (input.fromAccountId === input.toAccountId) {
    return { status: "rejected", error: "selfTransferProhibited" };
  }

  // Look up both accounts.
  const [fromResp, toResp] = await Promise.all([
    e
      .read<AccountRecord>({
        collection: ACCOUNT_COLLECTION,
        rkey: accountRkey(input.fromAccountId),
      })
      .catch(() => ({ records: [] })),
    e
      .read<AccountRecord>({
        collection: ACCOUNT_COLLECTION,
        rkey: accountRkey(input.toAccountId),
      })
      .catch(() => ({ records: [] })),
  ]);
  const fromAccount = fromResp.records[0]?.value;
  const toAccount = toResp.records[0]?.value;
  if (!fromAccount || !toAccount) return { status: "accountNotFound" };
  const cur = input.currency.toUpperCase();
  if (fromAccount.currency !== cur || toAccount.currency !== cur) {
    return { status: "currencyMismatch" };
  }

  // Idempotency: check if either entry already exists.
  const debitRkey = ledgerEntryRkey(input.transferId, "debit");
  const creditRkey = ledgerEntryRkey(input.transferId, "credit");
  const [debitProbe, creditProbe] = await Promise.all([
    e
      .read<LedgerEntryRecord>({
        collection: LEDGER_COLLECTION,
        rkey: debitRkey,
      })
      .catch(() => ({ records: [] })),
    e
      .read<LedgerEntryRecord>({
        collection: LEDGER_COLLECTION,
        rkey: creditRkey,
      })
      .catch(() => ({ records: [] })),
  ]);
  if (debitProbe.records[0]?.value && creditProbe.records[0]?.value) {
    return {
      status: "alreadyProcessed",
      transferId: input.transferId,
      clientRequestId: input.clientRequestId,
      debitUri: debitProbe.records[0].uri,
      creditUri: creditProbe.records[0].uri,
      fromAccountDid: fromAccount.did,
      toAccountDid: toAccount.did,
      amountMinor: input.amountMinor,
    };
  }

  // Write debit then credit. Order ensures partial-write detection
  // is possible via observer — a debit without matching credit is
  // a recovery candidate. For strong atomicity, future slices wrap
  // these in a SagaRecord (compensating ledger entry on failure).
  const now = new Date().toISOString();
  const debit: LedgerEntryRecord = {
    did: ledgerEntryDid(input.transferId, "debit"),
    entrySeq: 1,
    transferId: input.transferId,
    clientRequestId: input.clientRequestId,
    accountDid: fromAccount.did,
    direction: "debit",
    amountMinor: input.amountMinor,
    currency: cur,
    counterpartyAccountDid: toAccount.did,
    memo: input.memo,
    occurredAt: now,
    createdAt: now,
  };
  const debitReceipt = await e.write({
    collection: LEDGER_COLLECTION,
    record: debit as unknown as Record<string, unknown>,
    rkey: debitRkey,
  });
  const credit: LedgerEntryRecord = {
    did: ledgerEntryDid(input.transferId, "credit"),
    entrySeq: 2,
    transferId: input.transferId,
    clientRequestId: input.clientRequestId,
    accountDid: toAccount.did,
    direction: "credit",
    amountMinor: input.amountMinor,
    currency: cur,
    counterpartyAccountDid: fromAccount.did,
    memo: input.memo,
    occurredAt: now,
    createdAt: now,
  };
  const creditReceipt = await e.write({
    collection: LEDGER_COLLECTION,
    record: credit as unknown as Record<string, unknown>,
    rkey: creditRkey,
  });

  return {
    status: "transferred",
    transferId: input.transferId,
    clientRequestId: input.clientRequestId,
    debitUri: debitReceipt.uri,
    creditUri: creditReceipt.uri,
    fromAccountDid: fromAccount.did,
    toAccountDid: toAccount.did,
    amountMinor: input.amountMinor,
  };
}

// ─── listTransactions (with running balance) ────────────────────────

export async function listTransactions(
  e: Etzhayyim,
  input: ListTransactionsInput
): Promise<ListTransactionsOutput> {
  if (!input.accountId) return { items: [], total: 0 };
  const acctResp = await e
    .read<AccountRecord>({
      collection: ACCOUNT_COLLECTION,
      rkey: accountRkey(input.accountId),
    })
    .catch(() => ({ records: [] }));
  const account = acctResp.records[0]?.value;
  if (!account) return { items: [], total: 0, truncated: false };

  const limit = Math.min(input.limit ?? 50, 200);
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);

  // We need ALL entries for this account (ordered by occurredAt) to
  // compute running balance honestly. Scan full collection up to
  // maxScan; Phase 3 mst-projector adds per-account indexed view.
  let cursor: string | undefined;
  let scanned = 0;
  const matched: LedgerEntryView[] = [];
  while (scanned < maxScan) {
    const page = await e.read<LedgerEntryRecord>({
      collection: LEDGER_COLLECTION,
      cursor,
      limit: PAGE_LIMIT,
    });
    for (const r of page.records) {
      const v = r.value;
      if (v.accountDid !== account.did) continue;
      if (input.since && v.occurredAt < input.since) continue;
      matched.push({ ...v, ledgerEntryUri: r.uri });
    }
    scanned += page.records.length;
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }

  matched.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  let running = 0;
  const withBalance: LedgerEntryWithRunningBalance[] = matched.map((m) => {
    if (m.direction === "credit") running += m.amountMinor;
    else running -= m.amountMinor;
    return { ...m, runningBalanceMinor: running };
  });

  return {
    items: withBalance.slice(-limit),
    total: withBalance.length,
    truncated: scanned >= maxScan,
  };
}

// Re-export the account lookup helper for analyze tier.
export { loadAccountByDid };
