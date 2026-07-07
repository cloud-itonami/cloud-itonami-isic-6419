(ns banking.sim
  "Demo driver -- `clojure -M:dev:run`. Walks a clean account through
  intake -> compliance verification -> sanctions screening ->
  settlement-posting proposal (always escalates) -> human approval ->
  commit, then through interbank-message-dispatch proposal (always
  escalates) -> human approval -> commit, then shows five HARD holds
  (a jurisdiction with no spec-basis, an IBAN that fails its own ISO
  7064 MOD 97-10 checksum, an unresolved sanctions flag screened
  directly via `:sanctions/screen` [never via an actuation op against
  an unscreened account -- see this actor's own governor ns docstring
  / the lesson `parksafety`'s ADR-2607071922 Decision 5, `eldercare`'s,
  `museum`'s, `conservation`'s, `salon`'s, `entertainment`'s,
  `casework`'s, `hospital`'s, `facility`'s, `school`'s, `association`'s,
  `leasing`'s, `behavioral`'s, `secondary`'s, `card`'s, `water`'s,
  `telecom`'s, `aerospace`'s, `recovery`'s, `consulting`'s, `union`'s,
  `congregation`'s, `fab`'s, `energy`'s, `care`'s, `navigator`'s and
  `learning`'s ADR-0001s already recorded], and a double settlement/
  dispatch of an already-processed account) that never reach a human
  at all, and prints the audit ledger + the draft settlement and
  interbank-message records."
  (:require [langgraph.graph :as g]
            [banking.store :as store]
            [banking.operation :as op]))

(def operator {:actor-id "op-1" :actor-role :banking-operator :phase 3})

(defn- exec! [actor tid request context]
  (g/run* actor {:request request :context context} {:thread-id tid}))

(defn- approve! [actor tid]
  (g/run* actor {:approval {:status :approved :by "op-1"}} {:thread-id tid :resume? true}))

(defn -main [& _]
  (let [db (store/seed-db)
        actor (op/build db)]
    (println "== account/intake account-1 (JPN, clean; valid IBAN, no sanctions flag) ==")
    (println (exec! actor "t1" {:op :account/intake :subject "account-1"
                                :patch {:id "account-1" :holder-name "Sato Ichiro"}} operator))

    (println "== compliance/verify account-1 (escalates -- human approves) ==")
    (println (exec! actor "t2" {:op :compliance/verify :subject "account-1"} operator))
    (println (approve! actor "t2"))

    (println "== sanctions/screen account-1 (clean; escalates -- human approves) ==")
    (println (exec! actor "t3" {:op :sanctions/screen :subject "account-1"} operator))
    (println (approve! actor "t3"))

    (println "== actuation/post-settlement account-1 (always escalates -- actuation/post-settlement) ==")
    (let [r (exec! actor "t4" {:op :actuation/post-settlement :subject "account-1"} operator)]
      (println r)
      (println "-- human banking-operator approves --")
      (println (approve! actor "t4")))

    (println "== actuation/dispatch-interbank-message account-1 (always escalates -- actuation/dispatch-interbank-message) ==")
    (let [r (exec! actor "t5" {:op :actuation/dispatch-interbank-message :subject "account-1"} operator)]
      (println r)
      (println "-- human banking-operator approves --")
      (println (approve! actor "t5")))

    (println "== compliance/verify account-2 (no spec-basis -> HARD hold) ==")
    (println (exec! actor "t6" {:op :compliance/verify :subject "account-2" :no-spec? true} operator))

    (println "== compliance/verify account-3 (escalates -- human approves; sets up the IBAN-invalid test) ==")
    (println (exec! actor "t7" {:op :compliance/verify :subject "account-3"} operator))
    (println (approve! actor "t7"))

    (println "== actuation/post-settlement account-3 (IBAN fails ISO 7064 MOD 97-10 -> HARD hold) ==")
    (println (exec! actor "t8" {:op :actuation/post-settlement :subject "account-3"} operator))

    (println "== sanctions/screen account-4 (unresolved -> HARD hold, never reaches a human) ==")
    (println (exec! actor "t9" {:op :sanctions/screen :subject "account-4"} operator))

    (println "== actuation/post-settlement account-1 AGAIN (double-settlement -> HARD hold) ==")
    (println (exec! actor "t10" {:op :actuation/post-settlement :subject "account-1"} operator))

    (println "== actuation/dispatch-interbank-message account-1 AGAIN (double-dispatch -> HARD hold) ==")
    (println (exec! actor "t11" {:op :actuation/dispatch-interbank-message :subject "account-1"} operator))

    (println "== audit ledger ==")
    (doseq [f (store/ledger db)] (println f))

    (println "== draft settlement records ==")
    (doseq [r (store/settlement-history db)] (println r))

    (println "== draft interbank-message records ==")
    (doseq [r (store/interbank-message-history db)] (println r))))
