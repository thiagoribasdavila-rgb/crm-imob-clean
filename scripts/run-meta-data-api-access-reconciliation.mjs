import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMetaAuthReconciliationEvidence } from "./preflight-meta-auth-reconciliation.mjs";
import {
  validateMetaDataApiAccessEvidence,
  validateMetaDataApiCatalogEvidence,
} from "./preflight-meta-data-api-access.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationDraftFile = resolve(root, "supabase/migration-drafts/20260719070511_reconcile_legacy_and_canonical_contracts.sql");
const catalogQueryFile = resolve(root, "scripts/sql/meta-data-api-access-audit.sql");

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};

function safeJsonPath(configured) {
  const absolute = resolve(root, configured);
  const offset = relative(root, absolute);
  if (offset === ".." || offset.startsWith(`..${sep}`) || extname(absolute) !== ".json") {
    throw new Error("evidence_file_outside_workspace");
  }
  return absolute;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function readEvidence(environmentName) {
  const path = safeJsonPath(required(environmentName));
  return JSON.parse(readFileSync(path, "utf8"));
}

function localContract() {
  const migration = readFileSync(migrationDraftFile, "utf8");
  const query = readFileSync(catalogQueryFile, "utf8");
  const executableQuery = query
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  const mutatingStatement = /^\s*(grant|revoke|alter|create|drop|insert|update|delete|truncate|call|do)\b/im;
  return {
    migrationDraftSha256: sha256(migration),
    organizationExplicitGrant:
      /grant select \(id, name, slug, plan, active\)[\s\S]*?public\.organizations to authenticated;/i.test(migration)
      && /grant update \(name, slug\)[\s\S]*?public\.organizations to authenticated;/i.test(migration),
    profileNameUpdateGrant: /grant update \(name, full_name, avatar_url, phone, creci, bio, updated_at\)[\s\S]*?public\.profiles to authenticated;/i.test(migration),
    leadLeastPrivilegeGrant:
      /grant select, insert, update on table public\.leads to authenticated;/i.test(migration)
      && !/grant[^;]*delete[^;]*public\.leads[^;]*authenticated;/i.test(migration),
    anonymousRevocation: /revoke all on table public\.organizations, public\.profiles, public\.leads from anon;/i.test(migration),
    serviceRoleGrant: /grant all on table public\.organizations, public\.profiles, public\.leads to service_role;/i.test(migration),
    readOnlyCatalogQuery: executableQuery.toLowerCase().startsWith("with ")
      && !mutatingStatement.test(executableQuery),
  };
}

function reconcile(phase16Evidence, catalogEvidence) {
  const phase16Validation = validateMetaAuthReconciliationEvidence(phase16Evidence);
  const catalogValidation = validateMetaDataApiCatalogEvidence(catalogEvidence);
  const local = localContract();
  const issues = new Set();
  for (const issue of phase16Validation.issueCodes ?? []) issues.add(`phase16:${issue}`);
  for (const issue of catalogValidation.issueCodes ?? []) issues.add(`catalog:${issue}`);
  for (const [name, value] of Object.entries(local)) {
    if (name !== "migrationDraftSha256" && value !== true) issues.add(`local:${name}`);
  }
  const issueCodes = [...issues].sort();
  const passed = phase16Validation.approved && catalogValidation.approved && issueCodes.length === 0;
  const output = {
    format: "atlas_meta_data_api_access_evidence_v1",
    phase: 17,
    environment: "staging_clone",
    generatedAt: new Date().toISOString(),
    passed,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    rawLogsPersisted: false,
    remoteExecutionPerformed:
      phase16Evidence?.remoteExecutionPerformed === true
      && catalogEvidence?.remoteExecutionPerformed === true,
    sourceEvidence: {
      phase16: {
        format: phase16Evidence?.format ?? null,
        phase: phase16Evidence?.phase ?? null,
        approved: phase16Validation.approved,
        sha256: sha256(canonicalJson(phase16Evidence)),
      },
      catalog: {
        format: catalogEvidence?.format ?? null,
        phase: catalogEvidence?.phase ?? null,
        approved: catalogValidation.approved,
        sha256: sha256(canonicalJson(catalogEvidence)),
      },
    },
    localContract: local,
    reconciliation: { approved: passed, issueCodes },
    releaseGates: {
      dataApiGrantsRlsApproved: passed,
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
    errorCode: passed ? null : "data_api_grants_rls_not_approved",
  };
  const validation = validateMetaDataApiAccessEvidence(output);
  if (passed && !validation.approved) {
    return {
      ...output,
      passed: false,
      reconciliation: { approved: false, issueCodes: validation.issueCodes },
      releaseGates: { ...output.releaseGates, dataApiGrantsRlsApproved: false },
      errorCode: "phase17_self_validation_failed",
    };
  }
  return output;
}

function main() {
  const phase16Evidence = readEvidence("ATLAS_PHASE16_RECONCILIATION_EVIDENCE_FILE");
  const catalogEvidence = readEvidence("ATLAS_PHASE17_CATALOG_EVIDENCE_FILE");
  const evidence = reconcile(phase16Evidence, catalogEvidence);
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.passed) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    format: "atlas_meta_data_api_access_evidence_v1",
    phase: 17,
    environment: "staging_clone",
    passed: false,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    rawLogsPersisted: false,
    remoteExecutionPerformed: false,
    errorCode: error instanceof Error ? error.message.split(":")[0] : "unknown_failure",
    releaseGates: {
      dataApiGrantsRlsApproved: false,
      productionAllowed: false,
      metaEventDeliveryAllowed: false,
      deploymentAllowed: false,
    },
  }, null, 2));
  process.exit(1);
}
