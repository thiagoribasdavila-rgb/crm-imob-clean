import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

export function validateAuthJwtDataApiEvidence(input) {
  const previous = input?.previousPhase ?? {};
  const run = input?.authStagingRun ?? {};
  const evidence = input?.evidence ?? {};
  const issues = new Set();

  if (input?.phase !== 14 || input?.environment !== "staging_clone") issues.add("isolated_staging_environment_required");
  if (input?.sanitized !== true || input?.containsSecrets !== false || input?.containsPersonalData !== false) issues.add("evidence_not_sanitized");
  if (previous.phase !== 13 || previous.status !== "local_rls_claim_semantics_verified") issues.add("phase_13_baseline_missing");
  if (previous.scenarioCount < 24 || previous.assertionCount < 44) issues.add("phase_13_coverage_incomplete");
  if (run.status !== "completed") issues.add("auth_staging_run_not_completed");
  if (run.productionProject !== false || run.isolatedStack !== true || !evidence.isolatedProjectReference) issues.add("isolated_project_not_verified");
  if (run.sanitizedSeedOnly !== true || run.httpsTarget !== true || run.expectedProjectReferenceMatched !== true) issues.add("staging_target_not_verified");
  if (run.publishableKeyClassVerified !== true) issues.add("publishable_key_class_not_verified");
  if (run.secretKeyClassVerified !== true) issues.add("secret_key_class_not_verified");
  if (run.jwksDiscoveryPassed !== true) issues.add("jwks_discovery_not_verified");
  if (run.realSignedJwtSessions !== true || run.claimsSignatureVerified !== true) issues.add("signed_jwt_not_verified");
  if (run.claimsIssuerVerified !== true || run.claimsAudienceVerified !== true) issues.add("jwt_origin_not_verified");
  if (run.claimsSubjectVerified !== true || run.claimsRoleVerified !== true) issues.add("jwt_identity_not_verified");
  if (run.claimsExpirationVerified !== true || run.sessionIdVerified !== true) issues.add("jwt_lifetime_not_verified");
  if (run.sessionRefreshVerified !== true || run.refreshTokenRotationVerified !== true) issues.add("session_refresh_not_verified");
  if (run.revokedRefreshTokenRejected !== true) issues.add("refresh_revocation_not_verified");
  if (run.authenticatedDataApiPassed !== true || run.anonymousDataApiDenied !== true) issues.add("data_api_auth_boundary_not_verified");
  if (run.hierarchyScopePassed !== true || run.crossTenantReadPassed !== true || run.crossTenantWritePassed !== true) issues.add("data_api_rls_scope_not_verified");
  if (run.serviceRoleBoundaryPassed !== true) issues.add("service_role_boundary_not_verified");
  if (run.editableMetadataEscalationDenied !== true || run.editableMetadataRestored !== true) issues.add("editable_metadata_boundary_not_verified");
  if (run.mutationProbeRestored !== true) issues.add("mutation_probe_not_restored");
  if (run.tokensPersisted !== false) issues.add("token_material_persisted");
  if (!evidence.schemaFingerprint || !evidence.authJwtReport || !evidence.dataApiReport || !evidence.sessionRevocationReport || !evidence.rlsHierarchyReport) issues.add("runtime_evidence_incomplete");
  if (run.directorApproved !== true || !evidence.directorApproval) issues.add("director_approval_missing");
  if (run.securityReviewerApproved !== true || !evidence.securityApproval) issues.add("security_approval_missing");
  if (!evidence.approvedAt) issues.add("approval_timestamp_missing");
  if (run.productionMutation === true) issues.add("production_mutation_forbidden");
  if (run.realMetaEventDelivery === true) issues.add("real_meta_event_delivery_forbidden");
  if (run.campaignMutation === true || run.budgetMutation === true || run.audienceMutation === true) issues.add("meta_mutation_forbidden");

  return {
    approved: issues.size === 0,
    issueCodes: [...issues].sort(),
    stagingOnly: true,
    productionAllowed: false,
  };
}

function approvedFixture() {
  return {
    phase: 14,
    environment: "staging_clone",
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    previousPhase: { phase: 13, status: "local_rls_claim_semantics_verified", scenarioCount: 24, assertionCount: 44 },
    authStagingRun: {
      status: "completed",
      productionProject: false,
      isolatedStack: true,
      sanitizedSeedOnly: true,
      httpsTarget: true,
      expectedProjectReferenceMatched: true,
      publishableKeyClassVerified: true,
      secretKeyClassVerified: true,
      jwksDiscoveryPassed: true,
      realSignedJwtSessions: true,
      claimsSignatureVerified: true,
      claimsIssuerVerified: true,
      claimsAudienceVerified: true,
      claimsSubjectVerified: true,
      claimsRoleVerified: true,
      claimsExpirationVerified: true,
      sessionIdVerified: true,
      sessionRefreshVerified: true,
      refreshTokenRotationVerified: true,
      revokedRefreshTokenRejected: true,
      authenticatedDataApiPassed: true,
      anonymousDataApiDenied: true,
      hierarchyScopePassed: true,
      crossTenantReadPassed: true,
      crossTenantWritePassed: true,
      serviceRoleBoundaryPassed: true,
      editableMetadataEscalationDenied: true,
      editableMetadataRestored: true,
      mutationProbeRestored: true,
      tokensPersisted: false,
      directorApproved: true,
      securityReviewerApproved: true,
      productionMutation: false,
      realMetaEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false
    },
    evidence: {
      isolatedProjectReference: "isolated-reference",
      schemaFingerprint: "sha256:sanitized",
      authJwtReport: "auth-jwt-report.json",
      dataApiReport: "data-api-report.json",
      sessionRevocationReport: "session-revocation-report.json",
      rlsHierarchyReport: "rls-hierarchy-report.json",
      directorApproval: "director-approval-reference",
      securityApproval: "security-approval-reference",
      approvedAt: "2026-07-19T00:00:00Z"
    }
  };
}

function runSelfTest() {
  const tests = [];
  const test = (id, mutate, expectedCode) => {
    const fixture = structuredClone(approvedFixture());
    mutate(fixture);
    const result = validateAuthJwtDataApiEvidence(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(expectedCode) });
  };
  const approved = validateAuthJwtDataApiEvidence(approvedFixture());
  tests.push({ id: "complete_staging_evidence", passed: approved.approved && !approved.productionAllowed });
  test("environment", (f) => { f.environment = "production"; }, "isolated_staging_environment_required");
  test("sanitization", (f) => { f.containsSecrets = true; }, "evidence_not_sanitized");
  test("phase_13", (f) => { f.previousPhase.status = "not_run"; }, "phase_13_baseline_missing");
  test("phase_13_coverage", (f) => { f.previousPhase.assertionCount = 1; }, "phase_13_coverage_incomplete");
  test("run", (f) => { f.authStagingRun.status = "not_run"; }, "auth_staging_run_not_completed");
  test("isolation", (f) => { f.authStagingRun.isolatedStack = false; }, "isolated_project_not_verified");
  test("target", (f) => { f.authStagingRun.httpsTarget = false; }, "staging_target_not_verified");
  test("publishable", (f) => { f.authStagingRun.publishableKeyClassVerified = false; }, "publishable_key_class_not_verified");
  test("secret", (f) => { f.authStagingRun.secretKeyClassVerified = false; }, "secret_key_class_not_verified");
  test("jwks", (f) => { f.authStagingRun.jwksDiscoveryPassed = false; }, "jwks_discovery_not_verified");
  test("signature", (f) => { f.authStagingRun.claimsSignatureVerified = false; }, "signed_jwt_not_verified");
  test("issuer", (f) => { f.authStagingRun.claimsIssuerVerified = false; }, "jwt_origin_not_verified");
  test("subject", (f) => { f.authStagingRun.claimsSubjectVerified = false; }, "jwt_identity_not_verified");
  test("expiration", (f) => { f.authStagingRun.claimsExpirationVerified = false; }, "jwt_lifetime_not_verified");
  test("refresh", (f) => { f.authStagingRun.refreshTokenRotationVerified = false; }, "session_refresh_not_verified");
  test("revoke", (f) => { f.authStagingRun.revokedRefreshTokenRejected = false; }, "refresh_revocation_not_verified");
  test("auth_data_api", (f) => { f.authStagingRun.authenticatedDataApiPassed = false; }, "data_api_auth_boundary_not_verified");
  test("anon_data_api", (f) => { f.authStagingRun.anonymousDataApiDenied = false; }, "data_api_auth_boundary_not_verified");
  test("hierarchy", (f) => { f.authStagingRun.hierarchyScopePassed = false; }, "data_api_rls_scope_not_verified");
  test("tenant_read", (f) => { f.authStagingRun.crossTenantReadPassed = false; }, "data_api_rls_scope_not_verified");
  test("tenant_write", (f) => { f.authStagingRun.crossTenantWritePassed = false; }, "data_api_rls_scope_not_verified");
  test("service", (f) => { f.authStagingRun.serviceRoleBoundaryPassed = false; }, "service_role_boundary_not_verified");
  test("metadata", (f) => { f.authStagingRun.editableMetadataEscalationDenied = false; }, "editable_metadata_boundary_not_verified");
  test("metadata_restore", (f) => { f.authStagingRun.editableMetadataRestored = false; }, "editable_metadata_boundary_not_verified");
  test("mutation_restore", (f) => { f.authStagingRun.mutationProbeRestored = false; }, "mutation_probe_not_restored");
  test("token_persistence", (f) => { f.authStagingRun.tokensPersisted = true; }, "token_material_persisted");
  test("reports", (f) => { f.evidence.authJwtReport = null; }, "runtime_evidence_incomplete");
  test("director", (f) => { f.authStagingRun.directorApproved = false; }, "director_approval_missing");
  test("security", (f) => { f.authStagingRun.securityReviewerApproved = false; }, "security_approval_missing");
  test("production", (f) => { f.authStagingRun.productionMutation = true; }, "production_mutation_forbidden");
  test("meta_event", (f) => { f.authStagingRun.realMetaEventDelivery = true; }, "real_meta_event_delivery_forbidden");
  test("campaign", (f) => { f.authStagingRun.campaignMutation = true; }, "meta_mutation_forbidden");
  test("budget", (f) => { f.authStagingRun.budgetMutation = true; }, "meta_mutation_forbidden");
  test("audience", (f) => { f.authStagingRun.audienceMutation = true; }, "meta_mutation_forbidden");

  const passed = tests.every((item) => item.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

if (process.argv.includes("--self-test")) runSelfTest();
else {
  const file = process.argv[2] ?? "config/fixtures/meta-auth-jwt-data-api-evidence-template.json";
  const result = validateAuthJwtDataApiEvidence(readJson(file));
  console.log(JSON.stringify(result, null, 2));
  if (!result.approved) process.exit(1);
}
