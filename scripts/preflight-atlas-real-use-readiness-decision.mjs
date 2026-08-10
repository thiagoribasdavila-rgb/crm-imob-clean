const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;

const blocked = (issues) => ({
  approved: false,
  status: "readiness_decision_blocked",
  issues: [...issues],
  buildAllowed: false,
  packageAllowed: false,
  deploymentAllowed: false,
  databaseTouched: false,
  stagingTouched: false,
  productionTouched: false,
  metaTouched: false,
});

export function validateRealUseReadinessDecision(input) {
  const issues = new Set();
  if (!input || input.schema !== "atlas.real-use-readiness-decision.v1") issues.add("schema_invalid");
  if (input?.status !== "evidence_reviewed") issues.add("evidence_review_incomplete");
  if (!input?.evidenceFingerprint || !/^[a-f0-9]{64}$/i.test(input.evidenceFingerprint)) issues.add("evidence_fingerprint_missing");
  if (input?.review?.scope !== "isolated-staging") issues.add("isolated_staging_required");
  if (input?.review?.result !== "approved_for_release_gate") issues.add("review_not_approved");
  if (!safeReference.test(input?.review?.decisionReference ?? "")) issues.add("safe_decision_reference_missing");
  if (input?.review?.releaseAuthorized !== true) issues.add("human_release_authorization_missing");
  if (input?.execution?.buildAllowed !== false || input?.execution?.packageAllowed !== false || input?.execution?.deploymentAllowed !== false) issues.add("execution_must_remain_blocked_until_release_gate");
  if (!input?.forbidden || Object.values(input.forbidden).some((value) => value !== true)) issues.add("sensitive_data_protection_missing");
  if (Object.keys(input ?? {}).some((key) => !["schema", "status", "createdAt", "evidenceFingerprint", "review", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : {
    approved: true,
    status: "readiness_review_approved_release_gate_still_required",
    buildAllowed: false,
    packageAllowed: false,
    deploymentAllowed: false,
    databaseTouched: false,
    stagingTouched: false,
    productionTouched: false,
    metaTouched: false,
  };
}

export function selfTestRealUseReadinessDecision() {
  const base = {
    schema: "atlas.real-use-readiness-decision.v1",
    status: "evidence_reviewed",
    evidenceFingerprint: "a".repeat(64),
    review: { scope: "isolated-staging", result: "approved_for_release_gate", decisionReference: "director-release-gate-20260719", releaseAuthorized: true },
    execution: { buildAllowed: false, packageAllowed: false, deploymentAllowed: false },
    forbidden: { secrets: true, rawSessions: true, authorizationClaims: true, customerRecords: true, personalData: true },
  };
  const cases = [
    ["valid", (value) => value, true],
    ["missing-evidence", (value) => ({ ...value, evidenceFingerprint: null }), false],
    ["production", (value) => ({ ...value, review: { ...value.review, scope: "production" } }), false],
    ["no-human-gate", (value) => ({ ...value, review: { ...value.review, releaseAuthorized: false } }), false],
    ["execution-open", (value) => ({ ...value, execution: { ...value.execution, packageAllowed: true } }), false],
    ["sensitive", (value) => ({ ...value, token: "not-allowed" }), false],
  ];
  const failures = cases.filter(([_, mutate, expected]) => validateRealUseReadinessDecision(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestRealUseReadinessDecision();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}
