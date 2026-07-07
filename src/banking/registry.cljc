(ns banking.registry
  "Pure-function settlement-posting + interbank-message-dispatch record
  construction -- an append-only community-banking book-of-record
  draft.

  Unlike every prior sibling's registry, this domain DOES have a
  single international check-digit standard for its primary account
  identifier -- IBAN (ISO 13616), whose own check digits are defined
  by ISO 7064 MOD 97-10. `iban-checksum-invalid?` implements this
  REAL algorithm (not a fabricated placeholder) and is the FIRST
  instance of this fleet's checksum/format-validity check family --
  distinct from every prior check-family taxonomy entry (MAXIMUM-
  ceiling, MINIMUM-threshold, two-sided range, ratio-based
  sufficiency, set-containment/subset), which all compare two
  ALREADY-TRUSTED numeric/set fields against each other or a
  threshold. This check instead recomputes a cryptographic-adjacent
  checksum from the identifier's OWN characters -- the identifier
  proves or disproves itself, no second field needed. This maps
  directly onto this blueprint's own Minimum Production Control 'IBAN
  mod-97 verification before any external transfer.'

  Every OTHER reference number this actor issues (settlement/
  interbank-message record IDs) has no such single international
  check-digit standard -- every clearing network/jurisdiction assigns
  its own reference format, the same honest, non-fabricating
  discipline `banking.facts` uses; this namespace does NOT invent one
  for those, it builds a jurisdiction-scoped sequence number instead.

  This namespace is pure data + pure functions -- no I/O, no network
  call to any real core-banking/clearing system. It builds the RECORD
  a banking operator would keep, not the act of posting the
  settlement or dispatching the interbank message itself (that is
  `banking.operation`'s `:actuation/post-settlement`/`:actuation/
  dispatch-interbank-message`, always human-gated -- see README
  `Actuation`)."
  (:require [clojure.string :as str]))

(defn- unsigned-certificate
  "Every certificate this actor produces is UNSIGNED -- signature is the
  banking operator's own act, not this actor's. See README `Actuation`."
  [kind subject record-id]
  {"@context" ["https://www.w3.org/ns/credentials/v2"]
   "type" ["VerifiableCredential" kind]
   "credentialSubject" {"id" subject "record" record-id}
   "proof" nil
   "issued_by_registry" false
   "status" "draft-unsigned"})

(defn- zero-pad [n w]
  (let [s (str n)]
    (str (apply str (repeat (max 0 (- w (count s))) "0")) s)))

(def ^:private digit-chars (set "0123456789"))
(def ^:private alphabet "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
(def ^:private digit-value
  {"0" 0 "1" 1 "2" 2 "3" 3 "4" 4 "5" 5 "6" 6 "7" 7 "8" 8 "9" 9})

(defn- char->digits
  "ISO 7064 MOD 97-10 letter substitution: A=10 .. Z=35, digits pass
  through unchanged, as decimal-string fragments. Implemented via
  portable `clojure.string` lookups (no JVM-only `Character` interop)
  so this namespace stays a real `.cljc` -- runs on JVM/SCI/
  ClojureScript alike, the same portability discipline every sibling
  actor's `.cljc` namespaces follow."
  [c]
  (if (contains? digit-chars c)
    (str c)
    (str (+ 10 (str/index-of alphabet (str c))))))

(defn- iban-numeric-string
  "Move the first 4 characters to the end, then substitute letters for
  digits per ISO 7064 MOD 97-10 -- the standard IBAN validation
  rearrangement."
  [iban]
  (let [cleaned (str/replace (str/upper-case iban) #"\s" "")
        rearranged (str (subs cleaned 4) (subs cleaned 0 4))]
    (apply str (map char->digits rearranged))))

(defn- mod-97
  "Remainder of `numeric-string` (a decimal string, possibly far larger
  than any native integer) modulo 97, computed digit-by-digit so no
  bignum library is required -- the standard streaming-mod-97
  technique. Iterates via `subs`-extracted single-character substrings
  and a string-keyed lookup map rather than char/`int` interop, so
  this stays portable across JVM/ClojureScript (a plain `Character`-
  arithmetic implementation would not)."
  [numeric-string]
  (reduce (fn [acc i]
            (mod (+ (* acc 10) (digit-value (subs numeric-string i (inc i)))) 97))
          0
          (range (count numeric-string))))

(defn iban-checksum-invalid?
  "Does `account`'s own `:iban` fail ISO 7064 MOD 97-10 validation? A
  valid IBAN's rearranged numeric form is congruent to 1 mod 97 -- any
  other remainder (or a non-conforming shape: not 15-34 chars,
  doesn't start with 2 letters + 2 digits) means the IBAN is invalid.
  A pure ground-truth check against the account's own `:iban` field --
  no upstream comparison or second field needed. The FIRST instance of
  this fleet's checksum/format-validity check family (see ns
  docstring)."
  [{:keys [iban]}]
  (or (nil? iban)
      (not (re-matches #"[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}" (str/replace (str iban) #"\s" "")))
      (not= 1 (mod-97 (iban-numeric-string iban)))))

(defn register-settlement
  "Validate + construct the SETTLEMENT registration DRAFT -- the
  banking operator's own act of posting a real balanced ledger
  settlement. Pure function -- does not touch any real core-banking
  system; it builds the RECORD an operator would keep. `banking.
  governor` independently re-verifies the account's own IBAN checksum
  and blocks a double-posting for the same account, before this is
  ever allowed to commit."
  [account-id jurisdiction sequence]
  (when-not (and account-id (not= account-id ""))
    (throw (ex-info "settlement: account_id required" {})))
  (when-not (and jurisdiction (not= jurisdiction ""))
    (throw (ex-info "settlement: jurisdiction required" {})))
  (when (< sequence 0)
    (throw (ex-info "settlement: sequence must be >= 0" {})))
  (let [settlement-number (str (str/upper-case jurisdiction) "-SET-" (zero-pad sequence 6))
        record {"record_id" settlement-number
                "kind" "settlement-draft"
                "account_id" account-id
                "jurisdiction" jurisdiction
                "immutable" true}]
    {"record" record "settlement_number" settlement-number
     "certificate" (unsigned-certificate "Settlement" settlement-number settlement-number)}))

(defn register-interbank-message
  "Validate + construct the INTERBANK-MESSAGE registration DRAFT -- the
  banking operator's own act of dispatching a real SWIFT/ISO 20022
  interbank message. Pure function -- does not touch any real
  clearing network; it builds the RECORD an operator would keep.
  `banking.governor` independently re-verifies the account's own
  sanctions-screening resolution status and blocks a double-dispatch
  for the same account, before this is ever allowed to commit."
  [account-id jurisdiction sequence]
  (when-not (and account-id (not= account-id ""))
    (throw (ex-info "interbank-message: account_id required" {})))
  (when-not (and jurisdiction (not= jurisdiction ""))
    (throw (ex-info "interbank-message: jurisdiction required" {})))
  (when (< sequence 0)
    (throw (ex-info "interbank-message: sequence must be >= 0" {})))
  (let [message-number (str (str/upper-case jurisdiction) "-MSG-" (zero-pad sequence 6))
        record {"record_id" message-number
                "kind" "interbank-message-draft"
                "account_id" account-id
                "jurisdiction" jurisdiction
                "immutable" true}]
    {"record" record "message_number" message-number
     "certificate" (unsigned-certificate "InterbankMessage" message-number message-number)}))

(defn append [history result]
  (conj (vec history) (get result "record")))
