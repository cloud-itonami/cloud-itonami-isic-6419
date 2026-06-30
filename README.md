# cloud-itonami-6419

Open Business Blueprint for **ISIC Rev.5 6419**: other monetary intermediation
(receiving deposits and extending credit — banks, savings banks, credit
unions, postal giro).

This repository designs a forkable OSS business for community banking:
deposit and account operations, lending, interbank messaging, clearing and
settlement — run by a qualified operator so a community never surrenders its
money and ledgers to a closed SaaS.

## Core Contract

```text
intake + identity + IBAN/account records
        |
        v
Banking Advisor -> Monetary Intermediation Governor -> hold, post, or human approval
        |
        v
double-entry ledger + SWIFT/ISO 20022 envelope + clearing batch + audit
```

No automated advice can post an unbalanced entry, release a settlement, or
send an interbank message without governor approval and audit evidence.

## Capability layer

This blueprint resolves its technology stack via
[`kotoba-lang/industry`](https://github.com/kotoba-lang/industry) (ISIC
`6419`). Required capabilities are implemented by:

- [`kotoba-lang/banking`](https://github.com/kotoba-lang/banking) — accounts, IBAN, double-entry ledger, clearing
- [`kotoba-lang/swift`](https://github.com/kotoba-lang/swift) — SWIFT MT / ISO 20022, BIC

See [`docs/business-model.md`](docs/business-model.md) and
[`docs/operator-guide.md`](docs/operator-guide.md).

## License

Code and implementation templates are AGPL-3.0-or-later.
