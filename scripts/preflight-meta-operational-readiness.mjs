const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues, controlsReady, realEvidenceReady) => ({ approved: false, status: "meta_operational_readiness_blocked", issues: [...issues], controlsReady, realEvidenceReady, homologationAllowed: controlsReady, productionAllowed: false, externalChangesAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaOperationalReadiness(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-operational-readiness.v1") issues.add("schema_invalid");
  if (record?.status !== "ready_for_controlled_homologation") issues.add("assessment_status_invalid");
  if (!safeReference.test(record?.assessmentReference ?? "")) issues.add("assessment_reference_missing");
  const controlsReady = record?.controls && Object.values(record.controls).every((value) => value === true);
  if (!controlsReady) issues.add("governance_controls_incomplete");
  const realEvidenceReady = record?.realEvidence && Object.values(record.realEvidence).every((value) => value === true);
  if (!realEvidenceReady) issues.add("real_operational_evidence_incomplete");
  if (record?.release?.homologationAllowed !== true || record?.release?.productionAllowed !== false || record?.release?.externalChangesAllowed !== false) issues.add("release_boundary_invalid");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "assessmentReference", "controls", "realEvidence", "release", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  if (issues.size) return blocked(issues, Boolean(controlsReady), Boolean(realEvidenceReady));
  return { approved: true, status: "meta_operational_readiness_real_evidence_complete", controlsReady: true, realEvidenceReady: true, homologationAllowed: true, productionAllowed: false, externalChangesAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaOperationalReadiness() {
  const base = { schema: "atlas.meta-operational-readiness.v1", status: "ready_for_controlled_homologation", assessmentReference: "assessment-20260719-001", controls: { governanceValidated: true, memoryGoverned: true, humanApprovalFlowValidated: true, copilotBoundaryValidated: true }, realEvidence: { leadRoundTripTested: true, metaSignalReceiptVerified: true, rollbackTested: true, productionMonitoringVerified: true }, release: { homologationAllowed: true, productionAllowed: false, externalChangesAllowed: false }, forbidden: { assumedEvidence: true, automaticProductionRelease: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["lead", (value) => ({ ...value, realEvidence: { ...value.realEvidence, leadRoundTripTested: false } }), false], ["meta", (value) => ({ ...value, realEvidence: { ...value.realEvidence, metaSignalReceiptVerified: false } }), false], ["rollback", (value) => ({ ...value, realEvidence: { ...value.realEvidence, rollbackTested: false } }), false], ["production", (value) => ({ ...value, release: { ...value.release, productionAllowed: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaOperationalReadiness(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaOperationalReadiness(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
