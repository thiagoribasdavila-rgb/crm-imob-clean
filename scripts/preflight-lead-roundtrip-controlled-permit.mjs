const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const confirmationPhrase = "CONTROLLED_HOMOLOGATION_ONLY";

const unsafe = (issues) => ({
  valid: false,
  status: "controlled_permit_invalid",
  issues: [...issues],
  executionAllowed: false,
  productionAllowed: false,
  metaEmissionAllowed: false
});

export function evaluateLeadRoundtripControlledPermit(permit) {
  const issues = new Set();
  const allowedTopLevel = new Set(["schema", "status", "scenarioReference", "target", "authorization", "operation", "cleanup", "execution", "requiredEvidence", "externalState"]);
  if (!permit || permit.schema !== "atlas.lead-roundtrip-controlled-permit.v1") issues.add("schema_invalid");
  if (!safeReference.test(permit?.scenarioReference ?? "")) issues.add("scenario_reference_invalid");
  if (Object.keys(permit ?? {}).some((key) => !allowedTopLevel.has(key))) issues.add("unexpected_or_sensitive_top_level_data");
  if (permit?.target?.environment !== "homologation" || permit?.target?.baseUrlVariable !== "ATLAS_BASE_URL" || permit?.target?.databaseEnvironmentVariable !== "ATLAS_DATABASE_ENVIRONMENT") issues.add("target_environment_invalid");
  if (permit?.cleanup?.method !== "transaction-rollback-or-tagged-record-removal") issues.add("cleanup_method_invalid");
  if (permit?.execution?.controlledHomologationOnly !== true || permit?.execution?.customerDataAllowed !== false || permit?.execution?.productionAllowed !== false || permit?.execution?.metaEmissionAllowed !== false || permit?.execution?.providerPayloadAllowed !== false) issues.add("execution_safety_boundary_invalid");
  if (!permit?.requiredEvidence || Object.values(permit.requiredEvidence).some((value) => value !== false)) issues.add("evidence_claimed_before_execution");
  if (!permit?.externalState || Object.values(permit.externalState).some((value) => value !== false)) issues.add("external_state_claimed_before_execution");
  if (issues.size) return unsafe(issues);

  const gateChecks = {
    explicitHumanAuthorization: permit.authorization?.granted === true && permit.authorization?.confirmationPhrase === confirmationPhrase && safeReference.test(permit.authorization?.approverReference ?? "") && !Number.isNaN(Date.parse(permit.authorization?.approvedAt ?? "")),
    dedicatedTenant: safeReference.test(permit.target?.dedicatedTenantReference ?? "") && permit.operation?.dedicatedTenantVerified === true,
    isolatedDatabase: permit.operation?.databaseEnvironmentVerified === true,
    syntheticDataset: permit.operation?.syntheticDatasetReviewed === true,
    accountableOperator: safeReference.test(permit.operation?.operatorReference ?? ""),
    independentObserver: safeReference.test(permit.operation?.observerReference ?? ""),
    approvedWindow: safeReference.test(permit.operation?.windowReference ?? ""),
    monitoringReady: permit.operation?.monitoringReady === true,
    cleanupOwner: safeReference.test(permit.cleanup?.ownerReference ?? ""),
    rollbackReviewed: permit.cleanup?.rollbackReviewed === true && permit.cleanup?.cleanupDeadlineDefined === true,
    executionExplicitlyEnabled: permit.execution?.enabled === true
  };
  const missingGates = Object.entries(gateChecks).filter(([, value]) => !value).map(([key]) => key);
  if (missingGates.length) return {
    valid: true,
    status: "awaiting_controlled_execution_authorization",
    missingGates,
    executionAllowed: false,
    productionAllowed: false,
    metaEmissionAllowed: false
  };
  return {
    valid: true,
    status: "controlled_homologation_execution_permitted",
    missingGates: [],
    executionAllowed: true,
    productionAllowed: false,
    metaEmissionAllowed: false
  };
}

export function selfTestLeadRoundtripControlledPermit() {
  const base = {
    schema: "atlas.lead-roundtrip-controlled-permit.v1",
    status: "awaiting_controlled_execution_authorization",
    scenarioReference: "lead-roundtrip-synthetic-001",
    target: { environment: "homologation", baseUrlVariable: "ATLAS_BASE_URL", databaseEnvironmentVariable: "ATLAS_DATABASE_ENVIRONMENT", dedicatedTenantReference: null },
    authorization: { granted: false, confirmationPhrase: null, approverReference: null, approvedAt: null },
    operation: { operatorReference: null, observerReference: null, windowReference: null, syntheticDatasetReviewed: false, dedicatedTenantVerified: false, databaseEnvironmentVerified: false, monitoringReady: false },
    cleanup: { ownerReference: null, method: "transaction-rollback-or-tagged-record-removal", rollbackReviewed: false, cleanupDeadlineDefined: false },
    execution: { enabled: false, controlledHomologationOnly: true, customerDataAllowed: false, productionAllowed: false, metaEmissionAllowed: false, providerPayloadAllowed: false },
    requiredEvidence: { intakeReceipt: false, deduplicationReceipt: false, tenantReceipt: false, assignmentReceipt: false, activityReceipt: false, pipelineReceipt: false, signalMappingReceipt: false, cleanupReceipt: false },
    externalState: { databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false }
  };
  const ready = (value) => {
    value.target.dedicatedTenantReference = "homologation-tenant-001";
    value.authorization = { granted: true, confirmationPhrase, approverReference: "human-approver-001", approvedAt: "2026-07-19T12:00:00.000Z" };
    value.operation = { operatorReference: "operator-001", observerReference: "observer-001", windowReference: "window-20260719-001", syntheticDatasetReviewed: true, dedicatedTenantVerified: true, databaseEnvironmentVerified: true, monitoringReady: true };
    value.cleanup = { ownerReference: "cleanup-owner-001", method: "transaction-rollback-or-tagged-record-removal", rollbackReviewed: true, cleanupDeadlineDefined: true };
    value.execution.enabled = true;
    return value;
  };
  const cases = [
    ["safe_blocked_template", (value) => value, true, false],
    ["fully_permitted", ready, true, true],
    ["production", (value) => { value.execution.productionAllowed = true; return value; }, false, false],
    ["customer_data", (value) => { value.execution.customerDataAllowed = true; return value; }, false, false],
    ["meta_emission", (value) => { value.execution.metaEmissionAllowed = true; return value; }, false, false],
    ["provider_payload", (value) => { value.execution.providerPayloadAllowed = true; return value; }, false, false],
    ["fake_evidence", (value) => { value.requiredEvidence.intakeReceipt = true; return value; }, false, false],
    ["external_touch", (value) => { value.externalState.databaseTouched = true; return value; }, false, false],
    ["wrong_environment", (value) => { value.target.environment = "production"; return value; }, false, false],
    ["unexpected_secret", (value) => ({ ...value, secret: "not-allowed" }), false, false],
    ["missing_observer", (value) => { ready(value); value.operation.observerReference = null; return value; }, true, false],
    ["missing_rollback", (value) => { ready(value); value.cleanup.rollbackReviewed = false; return value; }, true, false]
  ];
  const failures = cases.filter(([_, mutate, expectedValid, expectedAllowed]) => {
    const result = evaluateLeadRoundtripControlledPermit(mutate(structuredClone(base)));
    return result.valid !== expectedValid || result.executionAllowed !== expectedAllowed;
  }).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestLeadRoundtripControlledPermit();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}
