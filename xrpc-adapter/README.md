# open-banking XRPC Adapter

CF Worker that exposes the 5 kotoba commands as XRPC endpoints.

## Endpoints

- `POST /xrpc/com.etzhayyim.apps.openBanking.createAccount` — open account
- `GET /xrpc/com.etzhayyim.apps.openBanking.getAccount?accountId=...` — account + balance
- `GET /xrpc/com.etzhayyim.apps.openBanking.listAccounts?ownerDid=...` — paginated accounts
- `POST /xrpc/com.etzhayyim.apps.openBanking.transfer` — atomic double-entry transfer
- `GET /xrpc/com.etzhayyim.apps.openBanking.listTransactions?accountId=...` — ledger with running balance

## Setup

```bash
cd 60-apps/etzhayyim-project-open-banking/xrpc-adapter
npm install
```

## Development

```bash
npm run dev
# Worker listens on http://localhost:8787
```

## Example: Create Account

```bash
curl -X POST http://localhost:8787/xrpc/com.etzhayyim.apps.openBanking.createAccount \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "alice-checking",
    "ownerDid": "did:web:example.com:user:alice",
    "kind": "checking",
    "currency": "USD",
    "displayName": "Alice Checking"
  }'
# {"status":"created","accountUri":"...","did":"did:web:open-banking.etzhayyim.com:account:alice-checking"}
```

## Example: Transfer

```bash
curl -X POST http://localhost:8787/xrpc/com.etzhayyim.apps.openBanking.transfer \
  -H "Content-Type: application/json" \
  -d '{
    "transferId": "tx-001",
    "clientRequestId": "client-req-001",
    "fromAccountId": "alice-checking",
    "toAccountId": "bob-savings",
    "amountMinor": 10000,
    "currency": "USD",
    "memo": "coffee"
  }'
# {"status":"transferred","transferId":"tx-001",...}
```

## Deploy

```bash
wrangler deploy
# Deploys to open-banking.etzhayyim.com/xrpc/*
```

See ADR-2605210000 for design context.
