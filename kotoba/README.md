# open-banking kotoba

Phase E Option B reference implementation of open-banking (Core-Banking MVP) on the etzhayyim substrate.

Per [ADR-2605203000](../../../90-docs/adr/2605203000-kotoba-write-target-options.md), open-banking migrates from vendor's `D1 (SQLite) batch()` pattern to **Option B** — PDS XRPC writes via `@etzhayyim/sdk e.write()`.

Coverage: **5 of 5 (100%) canonical** open-banking commands ported.

| Tier | Commands | Slice |
|---|---|---|
| Banking | createAccount, getAccount, listAccounts, transfer, listTransactions | **1** |

## Double-entry invariant

Every `transfer` produces **exactly 2 LedgerEntry records** — one debit on `fromAccount`, one credit on `toAccount`, same `amountMinor`, same currency. Balance is **never stored**, always derived from `SUM(credit) − SUM(debit)` per account.

```
transfer(from=A, to=B, amount=100)
  ↓
  ledger-{transferId}-debit   { account=A, direction=debit,  amount=100 }
  ledger-{transferId}-credit  { account=B, direction=credit, amount=100 }
```

Idempotency: shared `clientRequestId` on both entries ensures replay safety. Duplicate transfer with same `transferId` returns `alreadyProcessed`.

## Authority-chain DIDs

```
did:web:open-banking.etzhayyim.com                              — controller
did:web:open-banking.etzhayyim.com:account:{accountId-slug}     — Account
did:web:open-banking.etzhayyim.com:ledger:{transferId}-{debit|credit} — LedgerEntry
did:web:open-banking.etzhayyim.com:transfer:{transferId-slug}   — Transfer (logical group)
```

## Substrate boundary (ADR-2605172000)

This package tracks **ledger metadata only**. Actual on-chain settlement (USDC on Base L2) is OUTSIDE this kotoba package — a separate Settlement function handles wire transfers via `@etzhayyim/sdk e.pay()` / ERC-4337 Smart Wallet.

Per the 3-axis OR-test (ADR-2605172400):
- **Liability**: vendor (banking ops compliance) — but ledger schema is open
- **Custody**: vendor (account balances are PII-adjacent)
- **Settlement**: etzhayyim (USDC on-chain only)

The kotoba reference impl supports both vendor (with fiat rails) and etzhayyim (USDC-only) deployments because the LedgerEntry is currency-code agnostic.

## Usage

```ts
import { Etzhayyim } from "@etzhayyim/sdk";
import { createAccount, transfer } from "@etzhayyim/open-banking-kotoba";

const e = new Etzhayyim({
  did: "did:web:open-banking.etzhayyim.com",
  pdsUrl: "https://pds.etzhayyim.com",
  l2RpcUrl: "https://mainnet.base.org",
});

// Open accounts
const alice = await createAccount(e, {
  accountId: "alice-checking-001",
  ownerDid: "did:plc:alice...",
  kind: "checking",
  currency: "USDC",
});

const bob = await createAccount(e, {
  accountId: "bob-checking-001",
  ownerDid: "did:plc:bob...",
  kind: "checking",
  currency: "USDC",
});

// Transfer (double-entry, idempotent)
const t = await transfer(e, {
  transferId: "tx-2026-05-21-0001",
  clientRequestId: "req-abc123",
  fromAccountId: "alice-checking-001",
  toAccountId: "bob-checking-001",
  amountMinor: 1000_000,   // 1.0 USDC (6 decimals → smallest unit)
  currency: "USDC",
  memo: "coffee",
});
// → { status: "transferred", debitUri: "...", creditUri: "..." }
```

## Why Option B for open-banking

Per ADR-2605203000 Phase E decision matrix:
- **Catalog**: account metadata + ledger entries (small, structured records)
- **Write cadence**: per-transfer (2 records per call) — low-mid rate
- **Query pattern**: by accountId (rkey-direct) + transaction history scan with running balance

Option A (vendor RW mirror) rejected — ADR-2605172000 mandates kotoba.

## Sibling reference impls

| Actor | Coverage | Status |
|---|---|---|
| hanrei | 31/31 (100%) | complete |
| ipaddress | 37/37 (100%) | complete |
| sbom | 17/N (canonical 4/4) | canonical complete |
| kiyo | 12/12 (100%) | complete |
| ki | 4/4 (100%) | complete |
| otakiage | 13 (10/10 canonical) | complete |
| houki | 9 (8/8 canonical) | complete |
| **open-banking** | **5/5 canonical** | **complete** |
