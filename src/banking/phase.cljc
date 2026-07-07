(ns banking.phase
  "Phase 0->3 staged rollout -- the banking analog of `cloud-itonami-
  isic-6512`'s `casualty.phase`.

    Phase 0  read-only        -- no writes, still governor-gated.
    Phase 1  assisted-intake  -- account intake allowed, every write
                                 needs human approval.
    Phase 2  assisted-verify  -- adds AML/KYC verification + sanctions
                                 screening writes, still approval.
    Phase 3  supervised auto  -- governor-clean, high-confidence
                                 `:account/intake` (no capital risk
                                 yet) may auto-commit. `:actuation/
                                 post-settlement`/`:actuation/
                                 dispatch-interbank-message` NEVER
                                 auto-commit, at any phase.

  `:actuation/post-settlement`/`:actuation/dispatch-interbank-message`
  are deliberately ABSENT from every phase's `:auto` set, including
  phase 3 -- a permanent structural fact, not a rollout milestone
  still to come. Posting a real settlement and dispatching a real
  interbank message are the two real-world banking acts this actor
  performs; both are always a human banking-operator call. `banking.
  governor`'s `:actuation/post-settlement`/`:actuation/dispatch-
  interbank-message` high-stakes gate enforces the same invariant
  independently -- two layers, not one, agree on this. `:sanctions/
  screen` is likewise never auto-eligible, at any phase -- the same
  posture every sibling's screening op has. Phase 3's `:auto` set here
  has only ONE member (`:account/intake`) -- this domain has no
  separate no-capital-risk 'file' lifecycle distinct from the account
  record itself.")

(def read-ops  #{})
(def write-ops #{:account/intake :compliance/verify :sanctions/screen
                 :actuation/post-settlement :actuation/dispatch-interbank-message})

;; NOTE the invariant: `:actuation/post-settlement`/`:actuation/
;; dispatch-interbank-message` are members of `write-ops` (governor-
;; gated like any write) but are NEVER members of any phase's `:auto`
;; set below. Do not add them there.
(def phases
  "phase -> {:label .. :writes <ops allowed to write> :auto <ops allowed to
  auto-commit when governor-clean>}."
  {0 {:label "read-only"        :writes #{}                                                          :auto #{}}
   1 {:label "assisted-intake"  :writes #{:account/intake}                                           :auto #{}}
   2 {:label "assisted-verify"  :writes #{:account/intake :compliance/verify :sanctions/screen}       :auto #{}}
   3 {:label "supervised-auto"  :writes write-ops
      :auto #{:account/intake}}})

(def default-phase 3)

(defn gate
  "Adjust a governor disposition for the rollout phase. Returns
  {:disposition kw :reason kw|nil}.

  - a governor HOLD always stays HOLD (compliance wins).
  - a write op not yet enabled in this phase -> HOLD (:phase-disabled).
  - a write op enabled but not auto-eligible -> ESCALATE (:phase-approval),
    even if the governor was clean.
  - `:actuation/post-settlement`/`:actuation/dispatch-interbank-
    message` are never auto-eligible at any phase, so they always
    escalate once the governor clears them (or hold if the governor
    doesn't)."
  [phase {:keys [op]} governor-disposition]
  (let [{:keys [writes auto]} (get phases phase (get phases default-phase))]
    (cond
      (= :hold governor-disposition)       {:disposition :hold :reason nil}
      (contains? read-ops op)              {:disposition governor-disposition :reason nil}
      (not (contains? writes op))          {:disposition :hold :reason :phase-disabled}
      (and (= :commit governor-disposition)
           (not (contains? auto op)))      {:disposition :escalate :reason :phase-approval}
      :else                                {:disposition governor-disposition :reason nil})))

(defn verdict->disposition
  "Map a Monetary Intermediation Governor verdict to a base disposition
  before the phase gate."
  [verdict]
  (cond (:hard? verdict) :hold
        (:escalate? verdict) :escalate
        :else :commit))
