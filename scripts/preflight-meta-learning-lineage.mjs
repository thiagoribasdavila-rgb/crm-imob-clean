const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const evidenceClasses = new Set(["controlled_test", "supervised_operation", "historical_aggregate"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_lineage_blocked", issues: [...issues], analysisReuseAllowed: false, campaignChangeAllowed: false, audienceChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningLineage(lineage) {
  const issues = new Set();
  if (!lineage || lineage.schema !== "atlas.meta-learning-lineage.v1") issues.add("schema_invalid");
  if (lineage?.status !== "lineage_registered_for_analysis") issues.add("lineage_not_registered");
  for (const field of ["learningReference", "permitReference", "eventReference", "observationReference", "reviewReference"]) if (!safeReference.test(lineage?.[field] ?? "")) issues.add(`reference_missing:${field}`);
  if (!evidenceClasses.has(lineage?.lineage?.evidenceClass)) issues.add("evidence_class_invalid");
  if (lineage?.lineage?.reuseScope !== "analysis_only") issues.add("reuse_scope_must_be_analysis_only");
  if (!isoDate.test(lineage?.lineage?.expiresAt ?? "") || new Date(lineage.lineage.expiresAt) <= new Date("2026-07-19T00:00:00.000Z")) issues.add("expiry_invalid");
  if (lineage?.execution?.audienceChanged !== false || lineage?.execution?.campaignChanged !== false || lineage?.execution?.metaEventSent !== false || lineage?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!lineage?.forbidden || Object.values(lineage.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(lineage ?? {}).some((key) => !["schema", "status", "learningReference", "permitReference", "eventReference", "observationReference", "reviewReference", "lineage", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_lineage_valid_analysis_only", analysisReuseAllowed: true, campaignChangeAllowed: false, audienceChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningLineage() {
  const base = { schema: "atlas.meta-learning-lineage.v1", status: "lineage_registered_for_analysis", learningReference: "learning-20260719-001", permitReference: "permit-20260719-001", eventReference: "event-safe-001", observationReference: "observation-20260719-001", reviewReference: "review-20260719-001", lineage: { evidenceClass: "controlled_test", reuseScope: "analysis_only", expiresAt: "2026-08-19T00:00:00.000Z" }, execution: { audienceChanged: false, campaignChanged: false, metaEventSent: false, productionTouched: false }, forbidden: { unlinkedLearning: true, customerData: true, providerPayload: true, secrets: true, automaticOptimization: true } };
  const cases = [["valid", (value) => value, true], ["unlinked", (value) => ({ ...value, reviewReference: null }), false], ["reuse", (value) => ({ ...value, lineage: { ...value.lineage, reuseScope: "campaign_change" } }), false], ["expired", (value) => ({ ...value, lineage: { ...value.lineage, expiresAt: "2026-07-18T00:00:00.000Z" } }), false], ["audience", (value) => ({ ...value, execution: { ...value.execution, audienceChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningLineage(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningLineage(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
