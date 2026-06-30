# Operator Guide

## First Deployment

1. Register institutions, BICs, account plans and responsible operators.
2. Import historical accounts, balances and counterparties.
3. Run read-only IBAN and BIC validation against existing records.
4. Configure clearing-window schedules and escalation paths.
5. Publish a dry-run settlement and audit export.

## Minimum Production Controls

- IBAN mod-97 verification before any external transfer
- balanced-posting gate on every ledger entry
- BIC and MT-type validation before interbank dispatch
- audit export for every settlement and disclosure
- backup manual clearing process

## Certification

Certified operators must prove ledger integrity, balanced-posting
enforcement, evidence-backed reporting and human review for
settlement-affecting actions.
