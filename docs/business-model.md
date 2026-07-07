# Business Model: Community Monetary Intermediation

## Classification

- Repository: `cloud-itonami-isic-6419`
- ISIC Rev.5: `6419`
- Activity: other monetary intermediation — receiving deposits and extending credit
- Social impact: financial inclusion, monetary data sovereignty, transparent audit

## Customer

- credit unions, savings banks, postal savings operators
- cooperatives and local community banks
- municipalities running local giro services
- migrant and remittance-focused operators
- organizations that cannot accept closed-core banking SaaS lock-in

## Offer

- deposit and account management with verifiable IBAN
- double-entry ledger with balanced-posting enforcement
- lending and credit workflows with governor gates
- interbank messaging (SWIFT MT / ISO 20022) structural validation
- clearing and settlement batches
- role-based access and purpose limitation
- immutable audit ledger
- migration and managed operations

## Revenue

- self-host setup: one-time implementation fee
- managed hosting: monthly subscription per tenant
- support: monthly retainer with SLA
- migration: import from incumbent core-banking or spreadsheets
- clearing/network access brokerage

## Trust Controls

- unbalanced postings can never reach the ledger
- settlements and interbank messages require governor approval
- PAN-adjacent and personal financial data stays outside Git
- every hold, post, approve and disclose path is auditable
- emergency manual override paths remain outside LLM control
- a fabricated jurisdiction citation, incomplete KYC/AML evidence, an IBAN
  that fails its own ISO 7064 MOD 97-10 checksum, or an unresolved
  sanctions flag -- each forces a hold, not an override
- settlement posting and interbank-message dispatch are logged and
  escalated, and neither can be finalized twice for the same account: a
  double-posting or double-dispatch attempt is held off this actor's own
  account facts alone, with no upstream comparison needed

## Monetary Intermediation Governor: decision rule

`blueprint.edn` fixes `:itonami.blueprint/governor` to `:monetary-
intermediation-governor` -- this is not a generic "review step," it is
the one gate every proposed action in this business must pass before a
settlement is posted or an interbank message is dispatched. The
governor sits between the Banking Advisor and execution, per the
README's Core Contract:

```text
Banking Advisor -> Monetary Intermediation Governor -> hold, post, or human approval
```

**Approves**: routine banking actions proposed against an account that
already has a consented compliance record on file, a checksum-valid
IBAN, and no unresolved sanctions flag. These proceed straight to the
double-entry ledger / clearing batch.

**Rejects or escalates**: the governor refuses to let the advisor post
a settlement or dispatch an interbank message on its own authority
when any of the following hold -- a fabricated jurisdiction spec-
basis; incomplete KYC/AML evidence; an IBAN that fails its own ISO
7064 MOD 97-10 checksum; an unresolved sanctions flag. A clean
settlement/dispatch proposal still always routes to a human -- neither
`:actuation/post-settlement` nor `:actuation/dispatch-interbank-
message` is ever auto-committed, at any rollout phase.
