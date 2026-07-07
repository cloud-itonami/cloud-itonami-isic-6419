(ns banking.facts
  "Per-jurisdiction anti-money-laundering/know-your-customer regulatory
  catalog -- the G2-style spec-basis table the Monetary Intermediation
  Governor checks every `:compliance/verify` proposal against ('did the
  advisor cite an OFFICIAL public source for this jurisdiction's AML/
  KYC framework, or did it invent one?').

  Coverage is reported HONESTLY (see `coverage`), the same discipline
  every sibling actor's `facts` namespace uses: a jurisdiction not in
  this table has NO spec-basis, full stop -- the advisor must not
  fabricate one, and the governor holds if it tries.

  Seed values are drawn from each jurisdiction's official financial-
  crimes/prudential-supervision authority and AML/KYC law (see
  `:provenance`); they are a STARTING catalog, not a from-scratch
  survey of all ~194 jurisdictions. Extending coverage is additive:
  add one map to `catalog`, cite a real source, done -- never invent a
  jurisdiction's requirements to make coverage look bigger.")

(def catalog
  "iso3 -> requirement map. `:required-evidence` mirrors the generic
  identity-verification-record/source-of-funds-record/account-opening-
  record/sanctions-screening-record evidence set every prior sibling's
  evidence checklist submits in some form; `:legal-basis` /
  `:owner-authority` / `:provenance` are the G2 citation the governor
  requires before any `:actuation/post-settlement`/`:actuation/
  dispatch-interbank-message` proposal can commit."
  {"JPN" {:name "Japan"
          :owner-authority "金融庁 (Financial Services Agency, FSA)"
          :legal-basis "犯罪による収益の移転防止に関する法律 (Act on Prevention of Transfer of Criminal Proceeds, APTCP)"
          :national-spec "預金取扱金融機関の顧客管理(KYC)およびマネー・ローンダリング/テロ資金供与対策要件"
          :provenance "https://www.fsa.go.jp/policy/kokusai/kokusai.html"
          :required-evidence ["本人確認記録 (identity-verification-record)"
                              "資金源確認記録 (source-of-funds-record)"
                              "口座開設記録 (account-opening-record)"
                              "制裁リストスクリーニング記録 (sanctions-screening-record)"]}
   "USA" {:name "United States"
          :owner-authority "Financial Crimes Enforcement Network (FinCEN)"
          :legal-basis "Bank Secrecy Act (BSA), 31 U.S.C. § 5311 et seq. / USA PATRIOT Act"
          :national-spec "Depository-institution customer-identification-program (CIP) and sanctions-screening requirements"
          :provenance "https://www.fincen.gov/resources/statutes-and-regulations/bank-secrecy-act"
          :required-evidence ["Identity-verification record"
                              "Source-of-funds record"
                              "Account-opening record"
                              "Sanctions-screening record"]}
   "GBR" {:name "United Kingdom"
          :owner-authority "Financial Conduct Authority (FCA) / HM Treasury (Office of Financial Sanctions Implementation)"
          :legal-basis "Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017"
          :national-spec "Regulated deposit-taker customer due-diligence and sanctions-screening requirements"
          :provenance "https://www.fca.org.uk/firms/financial-crime/money-laundering-regulations"
          :required-evidence ["Identity-verification record"
                              "Source-of-funds record"
                              "Account-opening record"
                              "Sanctions-screening record"]}
   "DEU" {:name "Germany"
          :owner-authority "Bundesanstalt für Finanzdienstleistungsaufsicht (BaFin)"
          :legal-basis "Geldwäschegesetz (GwG)"
          :national-spec "Kundensorgfaltspflichten und Sanktionslistenprüfung für Einlagenkreditinstitute"
          :provenance "https://www.bafin.de/DE/Aufsicht/GeldwaescheTerrorismusfinanzierung/geldwaeschetf_node.html"
          :required-evidence ["Identitätsprüfungsprotokoll (identity-verification-record)"
                              "Mittelherkunftsnachweis (source-of-funds-record)"
                              "Kontoeröffnungsprotokoll (account-opening-record)"
                              "Sanktionslisten-Screening-Protokoll (sanctions-screening-record)"]}})

(defn spec-basis
  "The jurisdiction's requirement map, or nil -- nil means NO spec-basis,
  and the governor must hold any proposal that tries to post a
  settlement or dispatch an interbank message on it."
  [iso3]
  (get catalog iso3))

(defn coverage
  "Honest coverage report: how many of the requested jurisdictions actually
  have a spec-basis entry. Never report a missing jurisdiction as covered."
  ([] (coverage (keys catalog)))
  ([iso3s]
   (let [have (filter catalog iso3s)
         missing (remove catalog iso3s)]
     {:requested (count iso3s)
      :covered (count have)
      :covered-jurisdictions (vec (sort have))
      :missing-jurisdictions (vec (sort missing))
      :note (str "cloud-itonami-isic-6419 R0: " (count catalog)
                 " jurisdictions seeded with an official spec-basis. "
                 "This is a starting catalog, not a survey of all ~194 "
                 "jurisdictions -- extend `banking.facts/catalog`, "
                 "never fabricate a jurisdiction's requirements.")})))

(defn required-evidence-satisfied?
  "Does `submitted` (a set/coll of evidence keywords or strings) satisfy
  every evidence item listed for `iso3`? Missing spec-basis -> never
  satisfied."
  [iso3 submitted]
  (when-let [{:keys [required-evidence]} (spec-basis iso3)]
    (let [need (count required-evidence)
          have (count (filter (set submitted) required-evidence))]
      (= need have))))

(defn evidence-checklist [iso3]
  (:required-evidence (spec-basis iso3) []))
