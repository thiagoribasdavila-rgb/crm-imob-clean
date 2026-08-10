const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const expectedRoute = [
  "intake",
  "deduplication",
  "tenant_resolution",
  "unique_assignment",
  "commercial_activity",
  "pipeline_progression",
  "aggregate_signal_mapping",
  "cleanup"
];

const blocked = (issues) => ({
  approved: false,
  status: "lead_roundtrip_plan_blocked",
  issues: [...issues],
  realExecutionAllowed: false,
  externalChangesAllowed: false,
  databaseTouched: false,
  stagingTouched: false,
  productionTouched: false,
  metaTouched: false
});

export function validateLeadRoundtripHomologationPlan(plan) {
  const issues = new Set();
  const allowedTopLevel = new Set(["schema", "status", "environment", "scenarioReference", "dataset", "tenancy", "route", "invariants", "execution", "signals", "cleanup", "evidence", "release"]);

  if (!plan || plan.schema !== "atlas.lead-roundtrip-homologation-plan.v1") issues.add("schema_invalid");
  if (plan?.status !== "ready_for_authorized_local_rehearsal") issues.add("status_invalid");
  if (plan?.environment !== "homologation") issues.add("environment_not_isolated");
  if (!safeReference.test(plan?.scenarioReference ?? "")) issues.add("scenario_reference_invalid");
  if (Object.keys(plan ?? {}).some((key) => !allowedTopLevel.has(key))) issues.add("unexpected_or_sensitive_top_level_data");

  if (plan?.dataset?.kind !== "synthetic" || plan?.dataset?.containsPersonalData !== false || plan?.dataset?.customerRecordUsed !== false || plan?.dataset?.providerPayloadUsed !== false) issues.add("dataset_not_synthetic_or_private");
  if (plan?.tenancy?.organizationResolutionRequired !== true || !safeReference.test(plan?.tenancy?.organizationReference ?? "") || plan?.tenancy?.crossTenantAccessAllowed !== false) issues.add("tenant_boundary_invalid");

  const route = Array.isArray(plan?.route) ? plan.route : [];
  if (route.length !== expectedRoute.length || route.some((item, index) => item?.order !== index + 1 || item?.step !== expectedRoute[index] || !safeReference.test(item?.expectedEvidence ?? ""))) issues.add("commercial_route_incomplete");

  const invariants = plan?.invariants ?? {};
  for (const key of ["deduplicateBeforeCreate", "singleOrganization", "singleBroker", "singleCopilot", "auditTrailRequired", "humanApprovalRequired"]) if (invariants[key] !== true) issues.add(`invariant_missing:${key}`);

  if (plan?.execution?.authorized !== false || plan?.execution?.mode !== "plan-only" || plan?.execution?.databaseWritesAllowed !== false || plan?.execution?.externalWritesAllowed !== false || plan?.execution?.stagingTouched !== false || plan?.execution?.productionTouched !== false) issues.add("execution_boundary_invalid");
  if (plan?.signals?.aggregateOnly !== true || plan?.signals?.metaEmissionEnabled !== false || plan?.signals?.providerReceiptRequired !== true || plan?.signals?.customerDataIncluded !== false) issues.add("signal_boundary_invalid");
  if (plan?.cleanup?.required !== true || plan?.cleanup?.method !== "transaction-rollback-or-tagged-record-removal" || plan?.cleanup?.verified !== false) issues.add("cleanup_plan_invalid");
  if (!plan?.evidence || Object.values(plan.evidence).some((value) => value !== false)) issues.add("real_evidence_must_remain_unclaimed");
  if (plan?.release?.localPlanValidated !== true || plan?.release?.realRehearsalAllowed !== false || plan?.release?.metaTestAllowed !== false || plan?.release?.productionAllowed !== false || plan?.release?.zipAllowed !== false) issues.add("release_boundary_invalid");

  if (issues.size) return blocked(issues);
  return {
    approved: true,
    status: "lead_roundtrip_plan_ready_external_execution_blocked",
    issueCount: 0,
    routeStepCount: expectedRoute.length,
    realExecutionAllowed: false,
    externalChangesAllowed: false,
    databaseTouched: false,
    stagingTouched: false,
    productionTouched: false,
    metaTouched: false
  };
}

export function selfTestLeadRoundtripHomologationPlan() {
  const base = {
    schema: "atlas.lead-roundtrip-homologation-plan.v1",
    status: "ready_for_authorized_local_rehearsal",
    environment: "homologation",
    scenarioReference: "lead-roundtrip-synthetic-001",
    dataset: { kind: "synthetic", containsPersonalData: false, customerRecordUsed: false, providerPayloadUsed: false },
    tenancy: { organizationResolutionRequired: true, organizationReference: "homologation-tenant-placeholder", crossTenantAccessAllowed: false },
    route: expectedRoute.map((step, index) => ({ order: index + 1, step, expectedEvidence: `evidence-${index + 1}-${step}` })),
    invariants: { deduplicateBeforeCreate: true, singleOrganization: true, singleBroker: true, singleCopilot: true, auditTrailRequired: true, humanApprovalRequired: true },
    execution: { authorized: false, mode: "plan-only", databaseWritesAllowed: false, externalWritesAllowed: false, stagingTouched: false, productionTouched: false },
    signals: { aggregateOnly: true, metaEmissionEnabled: false, providerReceiptRequired: true, customerDataIncluded: false },
    cleanup: { required: true, method: "transaction-rollback-or-tagged-record-removal", verified: false },
    evidence: { intakeVerified: false, deduplicationVerified: false, tenantVerified: false, assignmentVerified: false, activityVerified: false, pipelineVerified: false, signalMappingVerified: false, cleanupVerified: false },
    release: { localPlanValidated: true, realRehearsalAllowed: false, metaTestAllowed: false, productionAllowed: false, zipAllowed: false }
  };
  const cases = [
    ["valid_plan", (value) => value, true],
    ["real_customer", (value) => { value.dataset.customerRecordUsed = true; return value; }, false],
    ["personal_data", (value) => { value.dataset.containsPersonalData = true; return value; }, false],
    ["missing_tenant", (value) => { value.tenancy.organizationReference = ""; return value; }, false],
    ["cross_tenant", (value) => { value.tenancy.crossTenantAccessAllowed = true; return value; }, false],
    ["multiple_brokers", (value) => { value.invariants.singleBroker = false; return value; }, false],
    ["multiple_copilots", (value) => { value.invariants.singleCopilot = false; return value; }, false],
    ["database_write", (value) => { value.execution.databaseWritesAllowed = true; return value; }, false],
    ["external_write", (value) => { value.execution.externalWritesAllowed = true; return value; }, false],
    ["meta_emission", (value) => { value.signals.metaEmissionEnabled = true; return value; }, false],
    ["fake_evidence", (value) => { value.evidence.intakeVerified = true; return value; }, false],
    ["missing_cleanup", (value) => { value.cleanup.required = false; return value; }, false],
    ["unexpected_email", (value) => ({ ...value, email: "synthetic@example.invalid" }), false]
  ];
  const failures = cases
    .filter(([_, mutate, expected]) => validateLeadRoundtripHomologationPlan(mutate(structuredClone(base))).approved !== expected)
    .map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestLeadRoundtripHomologationPlan();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}
