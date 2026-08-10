import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateIsolatedRehearsalEvidence } from "./preflight-meta-auth-isolated-rehearsal.mjs";
import { validateMetaAuthReconciliationEvidence } from "./preflight-meta-auth-reconciliation.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function parseChildEvidence(child) {
  for (const candidate of [child.stdout, child.stderr]) {
    const raw = candidate?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.format === "atlas_meta_auth_isolated_rehearsal_evidence_v1") return parsed;
    } catch {
      // Raw child output is intentionally discarded. Only recognized sanitized JSON is accepted.
    }
  }
  return null;
}

function exactObserved(evidence) {
  const lifecycle = evidence?.fixtureLifecycle ?? {};
  return {
    organizationsCreated: Number(lifecycle.organizationsCreated ?? 0),
    authUsersCreated: Number(lifecycle.authUsersCreated ?? 0),
    profilesCreated: Number(lifecycle.profilesCreated ?? 0),
    leadsCreated: Number(lifecycle.leadsCreated ?? 0),
    scenarioCount: Number(evidence?.authJwtDataApi?.scenarioCount ?? 0),
  };
}

function reconcile(evidence, childStatus) {
  const sourceValidation = evidence
    ? validateIsolatedRehearsalEvidence(evidence)
    : { approved: false, issueCodes: ["phase15_sanitized_evidence_missing"] };
  const expected = {
    organizationsCreated: 2,
    authUsersCreated: 9,
    profilesCreated: 9,
    leadsCreated: 4,
    minimumScenarioCount: 15,
  };
  const observed = exactObserved(evidence);
  const cleanup = evidence?.fixtureLifecycle?.cleanup ?? evidence?.cleanup ?? {};
  const drift = new Set(sourceValidation.issueCodes ?? []);

  if (observed.organizationsCreated !== expected.organizationsCreated) drift.add("organization_fixture_count_drift");
  if (observed.authUsersCreated !== expected.authUsersCreated) drift.add("auth_user_fixture_count_drift");
  if (observed.profilesCreated !== expected.profilesCreated) drift.add("profile_fixture_count_drift");
  if (observed.leadsCreated !== expected.leadsCreated) drift.add("lead_fixture_count_drift");
  if (observed.scenarioCount < expected.minimumScenarioCount) drift.add("scenario_coverage_drift");
  if (childStatus !== 0) drift.add("isolated_rehearsal_process_failed");
  if (cleanup.complete !== true || cleanup.zeroResidual !== true) drift.add("cleanup_not_reconciled");

  const residual = cleanup.residual ?? null;
  const zeroResidual = residual
    ? [residual.organizations, residual.profiles, residual.leads, residual.authUsers].every((count) => count === 0)
    : false;
  if (!zeroResidual) drift.add("residual_inventory_not_zero");

  const issueCodes = [...drift].sort();
  const passed = Boolean(evidence) && sourceValidation.approved && issueCodes.length === 0;
  return {
    format: "atlas_meta_auth_reconciliation_evidence_v1",
    phase: 16,
    environment: "staging_clone",
    generatedAt: new Date().toISOString(),
    passed,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    rawLogsPersisted: false,
    remoteExecutionPerformed: Boolean(evidence),
    sourceEvidence: {
      format: evidence?.format ?? null,
      phase: evidence?.phase ?? null,
      approved: sourceValidation.approved === true,
      sha256: evidence ? sha256(canonicalJson(evidence)) : null,
    },
    contract: { expected, observed },
    reconciliation: {
      approved: passed,
      driftCount: issueCodes.length,
      issueCodes,
    },
    cleanup: {
      complete: cleanup.complete === true,
      zeroResidual: cleanup.zeroResidual === true && zeroResidual,
      residual: residual ?? { organizations: -1, profiles: -1, leads: -1, authUsers: -1 },
      errorCodes: Array.isArray(cleanup.errorCodes) ? cleanup.errorCodes : [],
    },
    releaseGates: {
      isolatedAuthJwtRlsEvidenceApproved: passed,
      productionAllowed: false,
      metaEventDeliveryAllowed: false,
      deploymentAllowed: false,
    },
    prohibitedActions: {
      productionMutation: false,
      realMetaEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
    },
    errorCode: passed ? null : evidence?.errorCode ?? "reconciliation_not_approved",
  };
}

function safeArchiveDirectory() {
  const configured = process.env.ATLAS_AUTH_TEST_EVIDENCE_DIRECTORY?.trim() || "outputs/meta-phase-016";
  const absolute = resolve(root, configured);
  const allowedRoot = resolve(root, "outputs", "meta-phase-016");
  const offset = relative(allowedRoot, absolute);
  if (offset === ".." || offset.startsWith(`..${sep}`) || offset === "") {
    if (absolute !== allowedRoot) throw new Error("evidence_directory_outside_phase16_root");
  }
  return absolute;
}

function archiveApprovedEvidence(evidence) {
  const validation = validateMetaAuthReconciliationEvidence(evidence);
  if (!validation.approved || evidence.cleanup?.zeroResidual !== true) {
    throw new Error("unapproved_or_residual_evidence_archive_forbidden");
  }
  const directory = safeArchiveDirectory();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const stamp = evidence.generatedAt.replaceAll(":", "-").replaceAll(".", "-");
  const evidenceName = `${stamp}-meta-auth-reconciliation.json`;
  const evidencePath = resolve(directory, evidenceName);
  const content = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(evidencePath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(evidencePath, 0o600);
  const manifest = {
    format: "atlas_meta_auth_reconciliation_manifest_v1",
    phase: 16,
    evidenceFile: evidenceName,
    evidenceSha256: sha256(content),
    sanitized: true,
    approved: true,
  };
  const manifestPath = `${evidencePath}.manifest.json`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(manifestPath, 0o600);
  return {
    archived: true,
    evidencePath: relative(root, evidencePath),
    manifestPath: relative(root, manifestPath),
    evidenceSha256: manifest.evidenceSha256,
  };
}

function main() {
  if (required("ATLAS_AUTH_TEST_ENVIRONMENT") !== "staging_clone") throw new Error("staging_clone_required");
  if (process.env.ATLAS_AUTH_TEST_MUTATION_APPROVED !== "true") throw new Error("explicit_staging_mutation_approval_required");
  if (process.env.ATLAS_AUTH_TEST_REQUIRE_EMPTY_CLONE !== "true") throw new Error("empty_clone_confirmation_required");
  required("ATLAS_AUTH_TEST_SUPABASE_URL");
  required("ATLAS_AUTH_TEST_EXPECTED_PROJECT_REF");
  required("ATLAS_AUTH_TEST_SUPABASE_PUBLISHABLE_KEY");
  required("ATLAS_AUTH_TEST_SUPABASE_SECRET_KEY");

  const child = spawnSync(process.execPath, ["scripts/run-meta-auth-isolated-rehearsal.mjs"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  const sourceEvidence = parseChildEvidence(child);
  const evidence = reconcile(sourceEvidence, child.status);
  const archiveRequested = process.env.ATLAS_AUTH_TEST_ARCHIVE_SANITIZED_EVIDENCE === "true";
  const archive = archiveRequested && evidence.passed
    ? archiveApprovedEvidence(evidence)
    : { archived: false, reason: evidence.passed ? "archive_not_requested" : "evidence_not_approved" };
  const output = { ...evidence, archive };
  console.log(JSON.stringify(output, null, 2));
  if (!evidence.passed) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_auth_reconciliation_evidence_v1",
    phase: 16,
    environment: "staging_clone",
    passed: false,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    rawLogsPersisted: false,
    remoteExecutionPerformed: false,
    errorCode: error instanceof Error ? error.message.split(":")[0] : "unknown_failure",
    releaseGates: { productionAllowed: false, metaEventDeliveryAllowed: false, deploymentAllowed: false },
  }, null, 2));
  process.exit(1);
}
