# Mercury provider profile

This profile maps Mercury account onboarding into the governed ISIC 6419
monetary-intermediation workflow. It is an integration profile, not a claim
that software in this repository is a bank or may approve a real account.

## Intake

- receive a human-approved formation handoff
- verify the legal name against formation documents
- collect the real physical operating address
- identify all required beneficial owners and the control person
- record the actual source of funds, customers, counterparties, transaction
  sizes, countries, and planned US activity
- keep identity, tax, and banking evidence outside Git

Registered-agent, mailbox, and virtual-office addresses must not be substituted
for a physical operating address unless the provider explicitly permits that
use for the field in question.

## Decision boundary

The integration may prepare, validate, and track an application. Only an
authorized human submits it, and only Mercury decides whether to approve it.

## Activation controls

- confirm the account legal name matches the intended entity
- enable MFA and least-privilege user access
- define approval roles for wires and new payees
- verify a payment processor belongs to the same intended seller entity
- validate one low-value funding, payout, refund, and ledger reconciliation
- retain tax and accounting advice for every relevant jurisdiction

Mercury-specific API and adapter contracts belong in
`kotoba-lang/com-mercury`.
