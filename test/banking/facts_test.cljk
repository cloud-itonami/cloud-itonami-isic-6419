(ns banking.facts-test
  (:require [clojure.test :refer [deftest is]]
            [banking.facts :as facts]))

(deftest jpn-has-a-spec-basis
  (is (some? (facts/spec-basis "JPN")))
  (is (string? (:provenance (facts/spec-basis "JPN")))))

(deftest are-has-a-spec-basis-shaped-like-every-other-jurisdiction
  (let [basis (facts/spec-basis "ARE")]
    (is (some? basis))
    (is (= "United Arab Emirates" (:name basis)))
    (is (string? (:owner-authority basis)))
    (is (string? (:legal-basis basis)))
    (is (string? (:national-spec basis)))
    (is (string? (:provenance basis)))
    (is (= #{:name :owner-authority :legal-basis :national-spec :provenance :required-evidence}
           (set (keys basis))))
    (is (= 4 (count (:required-evidence basis))))))

(deftest unknown-jurisdiction-has-no-fabricated-spec-basis
  (is (nil? (facts/spec-basis "ATL"))))

(deftest coverage-never-reports-a-missing-jurisdiction-as-covered
  (let [report (facts/coverage ["JPN" "ATL" "GBR"])]
    (is (= 2 (:covered report)))
    (is (= ["ATL"] (:missing-jurisdictions report)))
    (is (= ["GBR" "JPN"] (:covered-jurisdictions report)))))

(deftest required-evidence-satisfied-needs-every-item
  (let [all (facts/evidence-checklist "JPN")]
    (is (facts/required-evidence-satisfied? "JPN" all))
    (is (not (facts/required-evidence-satisfied? "JPN" (rest all))))
    (is (not (facts/required-evidence-satisfied? "ATL" all)) "no spec-basis -> never satisfied")))
