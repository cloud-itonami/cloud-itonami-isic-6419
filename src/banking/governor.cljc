(ns banking.governor
  "Monetary Intermediation Governor -- the independent compliance layer
  that earns the BankingOps-LLM the right to commit. The LLM has no
  notion of AML/KYC regulatory law, whether an account's own IBAN
  actually passes its own ISO 7064 MOD 97-10 checksum, whether a
  sanctions flag against an account has actually stayed unresolved, or
  when an act stops being a draft and becomes a real-world settlement
  posting or interbank-message dispatch, so this MUST be a separate
  system able to *reject* a proposal and fall back to HOLD -- the
  banking analog of `cloud-itonami-isic-6512`'s CasualtyGovernor.

  Six checks, in priority order, ALL HARD violations: a human approver
  CANNOT override them (you don't get to approve your way past a
  fabricated jurisdiction spec-basis, incomplete evidence, an invalid
  IBAN checksum, an unresolved sanctions flag, or a double settlement/
  dispatch). The confidence/actuation gate is SOFT: it asks a human to
  look (low confidence / actuation), and the human may approve -- but
  see `banking.phase`: for `:stake :actuation/post-settlement`/
  `:actuation/dispatch-interbank-message` (a real ledger-posting act
  or a real interbank-messaging act) NO phase ever allows auto-commit
  either. Two independent layers agree that actuation is always a
  human call.

    1. Spec-basis                  -- did the compliance proposal cite
                                       an OFFICIAL source (`banking.
                                       facts`), or invent one?
    2. Evidence incomplete         -- for `:actuation/post-
                                       settlement`/`:actuation/
                                       dispatch-interbank-message`, has
                                       the account actually been
                                       assessed with a full identity-
                                       verification-record/source-of-
                                       funds-record/account-opening-
                                       record/sanctions-screening-
                                       record evidence checklist on
                                       file?
    3. IBAN checksum invalid       -- for `:actuation/post-
                                       settlement`, INDEPENDENTLY
                                       recompute whether the account's
                                       own IBAN passes ISO 7064 MOD
                                       97-10 (`banking.registry/iban-
                                       checksum-invalid?`) -- needs no
                                       proposal inspection at all. The
                                       FIRST instance of this fleet's
                                       checksum/format-validity check
                                       family -- a REAL algorithm
                                       (ISO 7064 MOD 97-10), not a
                                       fabricated placeholder,
                                       directly implementing this
                                       blueprint's own Minimum
                                       Production Control 'IBAN mod-97
                                       verification before any
                                       external transfer.'
    4. Sanctions flag unresolved   -- reported by THIS proposal itself
                                       (a `:sanctions/screen` that
                                       just found one), or already on
                                       file for the account
                                       (`:sanctions/screen`/
                                       `:actuation/dispatch-interbank-
                                       message`). Evaluated
                                       UNCONDITIONALLY (not scoped to
                                       a specific op), REUSING the
                                       exact `sanctions-violations`
                                       concept/name `underwriting.
                                       governor`/`casualty.governor`/
                                       `vcfund.governor`/`formation.
                                       governor`/`realty.governor`
                                       already established -- sanctions
                                       screening is a genuinely SHARED,
                                       industry-standard AML/OFAC
                                       compliance concept across
                                       financial-services verticals,
                                       not a domain-specific concept
                                       needing a distinct name (unlike
                                       this fleet's 'safeguarding'/
                                       'urgent-risk'/'dropout-risk'
                                       concepts, which each needed
                                       their own name because they are
                                       NOT the same real-world
                                       concern). This is the SIXTH
                                       literal grounding of the
                                       `sanctions-violations` name, and
                                       the THIRTY-SEVENTH distinct
                                       application of the broader
                                       unconditional-evaluation
                                       discipline overall. Exercised in
                                       tests/demo via `:sanctions/
                                       screen` DIRECTLY, not via the
                                       actuation op against an
                                       unscreened account -- see this
                                       ns's own test suite.
    5. Confidence floor / actuation
       gate                          -- LLM confidence below threshold,
                                       OR the op is `:actuation/post-
                                       settlement`/`:actuation/
                                       dispatch-interbank-message`
                                       (REAL banking acts) -> escalate.

  Two more guards, double-settlement/double-dispatch prevention, are
  enforced but NOT listed as numbered HARD checks above because they
  need no upstream comparison at all -- `already-settled-violations`/
  `already-dispatched-violations` refuse to post a settlement/dispatch
  an interbank message for the SAME account twice, off dedicated
  `:settlement-posted?`/`:interbank-message-dispatched?` facts (never
  a `:status` value) -- the SAME 'check a dedicated boolean, not
  status' discipline every prior sibling governor's guards establish,
  informed by `cloud-itonami-isic-6492`'s status-lifecycle bug
  (ADR-2607071320)."
  (:require [banking.facts :as facts]
            [banking.registry :as registry]
            [banking.store :as store]))

(def confidence-floor 0.6)

(def high-stakes
  "Stakes grave enough to always require a human, even when clean.
  Posting a real settlement and dispatching a real interbank message
  are the two real-world actuation events this actor performs -- a
  two-member set, matching every prior dual-actuation sibling's shape.
  Both are POSITIVE actuations (posting/dispatching a real record),
  matching this fleet's majority actuation shape (3600/6190 remain the
  only negative-actuation exceptions)."
  #{:actuation/post-settlement :actuation/dispatch-interbank-message})

;; ----------------------------- checks -----------------------------

(defn- spec-basis-violations
  "A `:compliance/verify` (or actuation) proposal with no spec-basis
  citation is a HARD violation -- never invent a jurisdiction's AML/
  KYC requirements."
  [{:keys [op]} proposal]
  (when (contains? #{:compliance/verify :actuation/post-settlement :actuation/dispatch-interbank-message} op)
    (let [value (:value proposal)]
      (when (or (empty? (:cites proposal))
                (and (contains? value :spec-basis) (nil? (:spec-basis value))))
        [{:rule :no-spec-basis
          :detail "公式spec-basisの引用が無い提案はAML/KYC運営基準として扱えない"}]))))

(defn- evidence-incomplete-violations
  "For `:actuation/post-settlement`/`:actuation/dispatch-interbank-
  message`, the jurisdiction's required identity-verification-record/
  source-of-funds-record/account-opening-record/sanctions-screening-
  record evidence must actually be satisfied -- do not trust the
  advisor's self-reported confidence alone."
  [{:keys [op subject]} st]
  (when (contains? #{:actuation/post-settlement :actuation/dispatch-interbank-message} op)
    (let [a (store/account st subject)
          compliance (store/compliance-of st subject)]
      (when-not (and compliance
                     (facts/required-evidence-satisfied?
                      (:jurisdiction a) (:checklist compliance)))
        [{:rule :evidence-incomplete
          :detail "法域の必要書類(本人確認記録/資金源確認記録/口座開設記録/制裁リストスクリーニング記録等)が充足していない状態での提案"}]))))

(defn- iban-checksum-invalid-violations
  "For `:actuation/post-settlement`, INDEPENDENTLY recompute whether
  the account's own IBAN passes ISO 7064 MOD 97-10 via `banking.
  registry/iban-checksum-invalid?` -- needs no proposal inspection at
  all, since its input is a permanent ground-truth field already on
  the account."
  [{:keys [op subject]} st]
  (when (= op :actuation/post-settlement)
    (let [a (store/account st subject)]
      (when (registry/iban-checksum-invalid? a)
        [{:rule :iban-checksum-invalid
          :detail (str subject " のIBAN(" (:iban a) ")がISO 7064 MOD 97-10検査に不合格")}]))))

(defn- sanctions-violations
  "An unresolved sanctions flag -- reported by THIS proposal (e.g. a
  `:sanctions/screen` that itself just found one), or already on file
  in the store for the account (`:sanctions/screen`/`:actuation/
  dispatch-interbank-message`) -- is a HARD, un-overridable hold.
  Evaluated UNCONDITIONALLY (not scoped to a specific op) so the
  screening op itself can HARD-hold on its own finding. REUSES the
  exact concept/name `underwriting.governor`/`casualty.governor`/
  `vcfund.governor`/`formation.governor`/`realty.governor` already
  established (see ns docstring)."
  [{:keys [op subject]} proposal st]
  (let [hit-in-proposal? (= :unresolved (get-in proposal [:value :verdict]))
        account-id (when (contains? #{:sanctions/screen :actuation/dispatch-interbank-message} op) subject)
        hit-on-file? (and account-id (= :unresolved (:verdict (store/sanctions-screen-of st account-id))))]
    (when (or hit-in-proposal? hit-on-file?)
      [{:rule :sanctions-flag-unresolved
        :detail "未解決の制裁リストフラグがある口座に対する為替メッセージ発信提案は進められない"}])))

(defn- already-settled-violations
  "For `:actuation/post-settlement`, refuses to post a settlement for
  the SAME account twice, off a dedicated `:settlement-posted?` fact
  (never a `:status` value)."
  [{:keys [op subject]} st]
  (when (= op :actuation/post-settlement)
    (when (store/account-already-settled? st subject)
      [{:rule :already-settled
        :detail (str subject " は既に決済記帳済み")}])))

(defn- already-dispatched-violations
  "For `:actuation/dispatch-interbank-message`, refuses to dispatch an
  interbank message for the SAME account twice, off a dedicated
  `:interbank-message-dispatched?` fact (never a `:status` value)."
  [{:keys [op subject]} st]
  (when (= op :actuation/dispatch-interbank-message)
    (when (store/account-already-dispatched? st subject)
      [{:rule :already-dispatched
        :detail (str subject " は既に為替メッセージ発信済み")}])))

(defn check
  "Censors a BankingOps-LLM proposal against the governor rules.
  Returns {:ok? bool :violations [..] :confidence c :escalate? bool
  :high-stakes? bool :hard? bool}."
  [request _context proposal st]
  (let [hard (into []
                   (concat (spec-basis-violations request proposal)
                           (evidence-incomplete-violations request st)
                           (iban-checksum-invalid-violations request st)
                           (sanctions-violations request proposal st)
                           (already-settled-violations request st)
                           (already-dispatched-violations request st)))
        conf (:confidence proposal 0.0)
        low? (< conf confidence-floor)
        stakes? (boolean (high-stakes (:stake proposal)))
        hard? (boolean (seq hard))]
    {:ok?          (and (not hard?) (not low?) (not stakes?))
     :violations   hard
     :confidence   conf
     :hard?        hard?
     :escalate?    (and (not hard?) (or low? stakes?))
     :high-stakes? stakes?}))

(defn hold-fact
  "The audit fact written when a proposal is rejected (HOLD)."
  [request context verdict]
  {:t          :governor-hold
   :op         (:op request)
   :actor      (:actor-id context)
   :subject    (:subject request)
   :disposition :hold
   :basis      (mapv :rule (:violations verdict))
   :violations (:violations verdict)
   :confidence (:confidence verdict)})
