# open-banking.etzhayyim.com — Core-Banking MVP (OSS)

**Status**: MVP scaffold (2026-04-15). Published as OSS at
`https://github.com/etzhayyim/etzhayyim-project-open-banking` (Apache-2.0).

## Scope (MVP)

| NSID | Type | Description |
|---|---|---|
| `com.etzhayyim.apps.openBanking.createAccount` | procedure | open account (DID-addressed) |
| `com.etzhayyim.apps.openBanking.getAccount` | query | account + derived balance |
| `com.etzhayyim.apps.openBanking.listAccounts` | query | owner → accounts, paginated |
| `com.etzhayyim.apps.openBanking.transfer` | procedure | atomic double-entry, idempotent |
| `com.etzhayyim.apps.openBanking.listTransactions` | query | ledger view w/ running balance |

## Architecture

- **Runtime**: Single CF Worker (`src/app.ts`, single-file principle)
- **Storage**: D1 (SQLite). Tables: `accounts`, `ledger_entries`, `idempotency`
- **Ledger**: double-entry — every transfer = 2 ledger rows (debit + credit)
  in a single `batch()` transaction. **Balance is never stored** — always
  derived from `SUM(credit) − SUM(debit)` per account. Ledger = SSoT,
  tamper-evident
- **Identity**: accounts are path-based DIDs
  `did:web:open-banking.etzhayyim.com:account:{id}`. Owner = any DID
- **Idempotency**: `transfer` accepts `clientRequestId`; response cached for replay
- **Concurrency**: D1 is strongly serialized per-shard → no race on balance
  (read-check-write within single `batch()` is atomic)

## Not in MVP (future)

- PSD2 SCA (Strong Customer Auth) — today the caller is trusted via
  `AUTH_SERVICE`. Future: step-up WebAuthn on transfer
- Interest accrual, holds, card/wire rails, FX, reserves, statements
- AML/sanctions screening
- Federation with other PDS-bound banks (AT Protocol `follow` + `transferIntent`)
- PDS pipethrough for `app.bsky.feed.post` on large transfers (Design E Tier 1)

## Local Dev

```bash
cd 60-apps/etzhayyim-project-open-banking/worker
npm i -g wrangler
wrangler d1 create etzhayyim-open-banking   # copy id into wrangler.jsonc
wrangler dev --local
```

## Deploy

```bash
cd 60-apps/etzhayyim-project-open-banking/worker
# ensure AUTH_SERVICE + PDS service bindings exist, D1 id set
e7m actor deploy .   # standard monorepo deploy
# or: wrangler deploy (standalone OSS mode)
```

## OSS Split

Source of truth lives in the monorepo. A subtree-split copy is published to
`etzhayyim/etzhayyim-project-open-banking` on GitHub (Apache-2.0). Keep the two
in sync via `git subtree push` or a CI mirror job (future work).
