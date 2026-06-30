# Business Model: Community Monetary Intermediation

## Classification

- Repository: `cloud-itonami-6419`
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
