# ADR-0001: Banking Advisor ⊣ Monetary Intermediation Governor architecture

## Status

Accepted. `cloud-itonami-isic-6419` promoted from `:blueprint` to
`:implemented` in the `kotoba-lang/industry` registry.

## Context

`cloud-itonami-isic-6419` publishes an OSS business blueprint for
community banking: deposit and account operations, lending, interbank
messaging, clearing and settlement. Like every prior actor in this
fleet, the blueprint alone is not an implementation: this ADR records
the governed-actor architecture that promotes it to real, tested
code, following the same langgraph-clj StateGraph + independent
Governor + Phase 0→3 rollout pattern established by `cloud-itonami-
isic-6511` (life insurance) and applied across fifty-two prior
siblings, most recently `cloud-itonami-isic-8569` (community learning
support).

## Decision

### Decision 1: entity and op shape

The primary entity is an `account`. Five ops: `:account/intake`
(directory upsert, no capital risk), `:compliance/verify` (per-
jurisdiction AML/KYC evidence checklist, never auto), `:sanctions/
screen` (sanctions screening, unconditional-evaluation discipline,
never auto), `:actuation/post-settlement` (POSITIVE, high-stakes --
posting a real balanced ledger settlement), and `:actuation/dispatch-
interbank-message` (POSITIVE, high-stakes -- dispatching a real SWIFT/
ISO 20022 interbank message). This matches the dual-actuation-on-one-
entity shape every recent dual-actuation sibling uses, grounded
directly in this blueprint's own published Core Contract diagram
("double-entry ledger + SWIFT/ISO 20022 envelope + clearing batch +
audit") and Trust Controls ("settlements and interbank messages
require governor approval").

### Decision 2: `iban-checksum-invalid?` -- the FIRST checksum/format-validity check, a REAL algorithm

Unlike every prior sibling's registry, this domain DOES have a single
international check-digit standard for its primary account identifier
-- IBAN (ISO 13616), whose check digits are defined by ISO 7064 MOD
97-10. `banking.registry/iban-checksum-invalid?` implements this REAL
algorithm (rearrange, letter-substitute A=10..Z=35, mod 97, valid iff
remainder = 1), not a fabricated placeholder, directly implementing
this blueprint's own Minimum Production Control "IBAN mod-97
verification before any external transfer." This is a genuinely NEW
check-family shape: every prior family (MAXIMUM-ceiling, MINIMUM-
threshold, two-sided range, ratio-based sufficiency, set-containment/
subset) compares two ALREADY-TRUSTED fields against each other or a
threshold; this check instead recomputes a checksum from the
identifier's OWN characters -- the identifier proves or disproves
itself, no second field needed. Test vectors are well-known published
IBAN examples (Deutsche Bundesbank's own `DE89370400440532013000`,
plus commonly-cited UK/FR examples), not fabricated. Gates only
`:actuation/post-settlement`.

### Decision 3: portable `.cljc` implementation of the checksum -- no JVM-only `Character` interop

A first draft of `iban-numeric-string`/`mod-97` used `Character/
isDigit`, `Character/toUpperCase` and `(int ch)` char arithmetic --
all JVM-only, which would silently break (or behave inconsistently)
if this namespace were ever compiled for ClojureScript, violating the
portable-`.cljc` discipline every sibling actor's `.cljc` namespaces
follow. Caught and rewritten before any test was run: `char->digits`
now uses a `(set "0123456789")`/string-index lookup (symmetric across
Clojure-char and ClojureScript-string-of-length-1 semantics), and
`mod-97` iterates via `subs`-extracted single-character substrings
against a STRING-keyed digit-value map rather than character
arithmetic -- both fully portable.

### Decision 4: `sanctions-violations` -- REUSE of the established name/concept, the 6th literal grounding

Unlike this fleet's domain-specific "safeguarding"/"urgent-risk"/
"dropout-risk" concepts (each of which needed ITS OWN distinct name
because they are NOT the same real-world concern), sanctions
screening is a genuinely SHARED, industry-standard AML/OFAC
compliance concept across financial-services verticals. Before
reusing the name, every sibling's `governor.cljc` was grepped for a
literal `(defn- sanctions-violations` definition (not just a
docstring mention): `underwriting.governor` (6511), `casualty.
governor` (6512, the flagship original), `vcfund.governor` (6499),
`formation.governor` (6910) and `realty.governor` (6810) all already
have their own literal `sanctions-violations` check. This build is the
SIXTH literal grounding of that exact name/concept, and the THIRTY-
SEVENTH distinct application of the broader unconditional-evaluation
discipline overall (water=25th ... learning=36th, banking=37th).
Gates `:sanctions/screen` and `:actuation/dispatch-interbank-message`
specifically -- an interbank message (an external funds movement)
should not dispatch while a sanctions flag remains open, matching real
OFAC/sanctions-screening practice.

### Decision 5: dedicated double-actuation-guard booleans

`:settlement-posted?`/`:interbank-message-dispatched?` are dedicated
booleans on the `account` record, never a single `:status` value --
the same discipline every prior sibling governor's guards establish,
informed by `cloud-itonami-isic-6492`'s real status-lifecycle bug
(ADR-2607071320).

### Decision 6: Store protocol, MemStore + DatomicStore parity

`banking.store/Store` is implemented by both `MemStore` (atom-backed,
default for dev/tests/demo) and `DatomicStore` (`langchain.db`-
backed), proven to satisfy the same contract in `test/banking/
store_contract_test.clj` -- the same seam every sibling actor uses so
swapping the SSoT backend is a configuration change, not a rewrite.
The protocol's per-entity accessor is named `account` directly --
`account` is not a Clojure special form, so no `-of` suffix workaround
was needed.

### Decision 7: Phase 0→3 rollout

Phase 3's `:auto` set has exactly one member, `:account/intake` (no
capital risk). `:compliance/verify` and `:sanctions/screen` are never
auto-eligible at any phase (matching every sibling's screening-op
posture), and `:actuation/post-settlement`/`:actuation/dispatch-
interbank-message` are permanently excluded from every phase's `:auto`
set -- a structural fact, not a rollout milestone, enforced by BOTH
`banking.phase` and `banking.governor`'s `high-stakes` set
independently.

### Decision 8: no bespoke domain capability lib as a code dependency (despite blueprint.edn requiring one)

This blueprint's own `:itonami.blueprint/required-technologies`
already names `:banking`/`:swift` (unlike most prior siblings, which
required none), pointing at `kotoba-lang/banking`/`kotoba-lang/swift`.
This R0 implementation does NOT add either as an actual `deps.edn`
dependency, following the same posture every sibling actor without a
bespoke capability lib takes: implement the specific ground-truth
check a governor needs directly (here, the real IBAN checksum in
`banking.registry`) rather than pull in an external capability
library for a governed-actor scaffold this narrow in scope. A
production operator wiring this actor to a real core-banking/
clearing-network integration would add those libraries at that layer.

### Decision 9: mock + LLM advisor pair

`banking.bankingadvisor` provides `mock-advisor` (deterministic,
default everywhere -- the actor graph and governor contract run
offline) and `llm-advisor` (backed by `langchain.model/ChatModel`,
with a defensive EDN-proposal parser so a malformed LLM response
degrades to a safe low-confidence noop rather than ever auto-posting
a settlement or auto-dispatching an interbank message).

### Decision 10: blueprint.edn field-sync fixes

Two stale-scaffold inconsistencies in `blueprint.edn`, discovered
during the standard "survey blueprint scaffold" step before writing
any code, were fixed as part of this promotion:

1. `:itonami.blueprint/id` was the stale pre-rename value
   `"cloud-itonami-6419"` (missing `isic-`), while the repo folder,
   README title and this actor's own `:business-id` already use the
   corrected `cloud-itonami-isic-6419`. Fixed to match.
2. `:itonami.blueprint/required-technologies` was missing `:robotics`
   despite `:itonami.blueprint/robotics true` already being set and
   the `kotoba-lang/industry` registry's own entry for `"6419"`
   already stating `[:robotics :banking :swift :identity :forms :dmn
   :bpmn :audit-ledger]`. Fixed to match the registry exactly.

## Alternatives considered

- **Adding `kotoba-lang/banking`/`kotoba-lang/swift` as real
  `deps.edn` dependencies.** Rejected for this R0: every sibling
  actor's governed-actor scaffold implements its own domain-specific
  ground-truth checks directly rather than depending on an external
  capability library; adding these two libraries as code dependencies
  would be a scope expansion beyond what a promotion from `:blueprint`
  to `:implemented` requires, and would introduce version-compatibility
  risk this fleet's other 52 actors don't carry.
- **Naming the sanctions check something domain-specific (e.g.
  `banking-sanctions-flag-unresolved`).** Rejected: sanctions
  screening is genuinely the SAME real-world AML/OFAC concept across
  every financial-services vertical in this fleet (confirmed by
  reading, not just grepping, `underwriting`/`casualty`/`vcfund`/
  `formation`/`realty`'s own literal `sanctions-violations`
  definitions) -- reusing the exact established name is the honest
  choice here, unlike this fleet's domain-specific "safeguarding"/
  "risk" concepts which each needed their own name.
- **Implementing the IBAN checksum with JVM `Character`/`int`
  interop** (the first draft). Rejected once the portability
  discipline was checked: every sibling `.cljc` namespace avoids
  platform-specific interop; rewritten with portable string-based
  digit lookups before any test was written.

## Consequences

- Fifty-third actor in this fleet (52 implemented before this build).
- Establishes the FIRST checksum/format-validity check family in this
  fleet, backed by a real, standards-conformant algorithm (ISO 7064
  MOD 97-10), tested against real published IBAN examples.
- Confirms the `sanctions-violations` concept generalizes cleanly to
  a sixth grounding, the first in a deposit-taking/core-banking
  context specifically.
- `MemStore` ‖ `DatomicStore` parity is proven by `test/banking/
  store_contract_test.clj`, the same `:db-api`-driven swap pattern
  every sibling actor uses.
- Two pre-existing `blueprint.edn` inconsistencies (stale ID, missing
  `:robotics` in required-technologies) fixed as in-scope minor
  consistency work.
