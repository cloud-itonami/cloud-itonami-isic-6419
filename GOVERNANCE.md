# Governance

`cloud-itonami-6419` is an OSS open-business blueprint for community monetary
intermediation. Governance covers both the capability layer and the operator
model.

## Maintainers

Maintainers may merge changes that preserve these invariants:

- unbalanced postings can never be committed to the ledger.
- the Monetary Intermediation Governor remains independent of the advisor.
- hard policy violations (settlement, disclosure, sanction) cannot be
  overridden by human approval.
- every commit, hold, posting and approval path is auditable.
- personal financial data and credentials stay outside Git.

## Decision Records

Architecture decisions live in `docs/adr/`. Changes to the trust model,
storage contract, public business model, operator certification or license
should add or update an ADR.

## Operator Governance

Anyone may fork and operate independently. itonami.cloud certification is a
separate trust mark and should require security, audit, clearing-access and
data-flow review.

Certified operators can lose certification for:

- bypassing posting or settlement policy checks
- mishandling customer financial data
- misrepresenting certification status
- failing to respond to security incidents
- hiding material changes to customer-facing operation
