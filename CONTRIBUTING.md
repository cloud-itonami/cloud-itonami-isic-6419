# Contributing

`cloud-itonami-6419` accepts contributions to the OSS blueprint, capability
bindings, policy tests, documentation and operator model.

## Development

The capability layer lives in `kotoba-lang/banking` and `kotoba-lang/swift`.
This repo holds the business blueprint and operator contracts.

```bash
# in kotoba-lang/banking or kotoba-lang/swift:
clojure -X:test
clojure -M:lint
```

Keep changes small and include tests for posting balance, IBAN/BIC
validation, or interbank message structure.

## Rules

- Do not commit real account numbers, PANs, credentials or customer records.
- Keep ledger writes, settlements and interbank dispatch behind the
  Monetary Intermediation Governor.
- Treat monetary workflows as high-risk: add tests for balance, purpose,
  settlement, disclosure and audit logging.
- Document any new business-model or operator assumption in `docs/`.

## Pull Requests

PRs should describe:

- what behavior changed
- which policy invariant is affected
- how it was tested
- whether operator or certification docs need updates
