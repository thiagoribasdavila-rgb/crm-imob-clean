import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PHASE29_APPROVAL, validatePhase29Target } from "./preflight-meta-repeatability-sample-02-migration-rehearsal.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(readFileSync(join(root, "config/meta-intelligence-phase-029.json"), "utf8"));
const migration = readFileSync(join(root, config.officialMigration), "utf8");
const rollback = readFileSync(join(root, config.rollbackDraft), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const quoteLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

const required = [
  "ATLAS_PHASE29_ISOLATED_DB_URL",
  "ATLAS_PHASE29_ISOLATED_DB_HOST",
  "ATLAS_PHASE29_ISOLATED_DATABASE_NAME",
  "ATLAS_PHASE29_ISOLATED_PROJECT_REF",
  "ATLAS_PHASE29_PRODUCTION_DB_HOST",
  "ATLAS_PHASE29_PRODUCTION_PROJECT_REF",
  "ATLAS_PHASE29_ENVIRONMENT",
  "ATLAS_PHASE29_HUMAN_APPROVAL",
  "ATLAS_PHASE29_EVIDENCE_FILE"
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`missing_required_environment:${missing.join(",")}`);
  process.exit(1);
}

let databaseUrl;
try {
  databaseUrl = new URL(process.env.ATLAS_PHASE29_ISOLATED_DB_URL);
} catch {
  console.error("invalid_isolated_database_url");
  process.exit(1);
}

const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
const targetInput = {
  phase: 29,
  environment: process.env.ATLAS_PHASE29_ENVIRONMENT,
  approval: process.env.ATLAS_PHASE29_HUMAN_APPROVAL,
  cliVersion: "2.109.1",
  target: {
    protocol: databaseUrl.protocol,
    host: databaseUrl.hostname,
    expectedHost: process.env.ATLAS_PHASE29_ISOLATED_DB_HOST,
    databaseName,
    expectedDatabaseName: process.env.ATLAS_PHASE29_ISOLATED_DATABASE_NAME,
    projectRef: process.env.ATLAS_PHASE29_ISOLATED_PROJECT_REF,
    productionHost: process.env.ATLAS_PHASE29_PRODUCTION_DB_HOST,
    productionProjectRef: process.env.ATLAS_PHASE29_PRODUCTION_PROJECT_REF,
    directDatabaseUrl: true,
    linkedProject: false,
    productionProject: false
  },
  prohibitedActions: {
    productionMutation: false,
    permitReservation: false,
    permitIssuance: false,
    permitConsumption: false,
    realMetaEventDelivery: false,
    testMetaEventDelivery: false,
    campaignMutation: false,
    budgetMutation: false,
    audienceMutation: false,
    deployment: false,
    build: false
  }
};
const validation = validatePhase29Target(targetInput);
if (!validation.approved || process.env.ATLAS_PHASE29_HUMAN_APPROVAL !== PHASE29_APPROVAL) {
  console.error(`phase29_target_rejected:${validation.issueCodes.join(",")}`);
  process.exit(1);
}

const evidenceRelative = process.env.ATLAS_PHASE29_EVIDENCE_FILE;
const evidencePath = resolve(root, evidenceRelative);
const evidenceScope = relative(join(root, "artifacts", "meta-phase29"), evidencePath);
if (isAbsolute(evidenceScope) || evidenceScope.startsWith("..") || evidenceScope === "") {
  console.error("evidence_path_must_be_inside_artifacts_meta_phase29");
  process.exit(1);
}

const tempDirectory = mkdtempSync(join(tmpdir(), "atlas-phase29-"));
const migrationBundle = join(tempDirectory, "migration.sql");
const verificationFile = join(tempDirectory, "verify.sql");
const rollbackBundle = join(tempDirectory, "rollback.sql");
const cleanupVerificationFile = join(tempDirectory, "verify-clean.sql");
const expectedDatabaseGuard = `
set app.atlas_meta_ledger_environment = 'staging_clone';
set app.atlas_meta_ledger_expected_database = ${quoteLiteral(databaseName)};
do $atlas_phase29_database_identity$
begin
  if current_database() is distinct from current_setting('app.atlas_meta_ledger_expected_database', true) then
    raise exception 'atlas_phase29_database_identity_mismatch';
  end if;
end;
$atlas_phase29_database_identity$;
`;

writeFileSync(migrationBundle, `${expectedDatabaseGuard}\n${migration}`);
writeFileSync(verificationFile, `
do $atlas_phase29_verify$
declare
  ledger_rls boolean;
  ledger_force_rls boolean;
  audit_rls boolean;
  audit_force_rls boolean;
begin
  if to_regclass('atlas_private.meta_permit_ledger') is null
    or to_regclass('atlas_private.meta_permit_ledger_audit') is null
    or to_regprocedure('public.atlas_prepare_meta_permit_reservation_v1(uuid,uuid,text,smallint,integer,integer,timestamptz,text,text,text,text,text,text,text,text,text)') is null
  then
    raise exception 'atlas_phase29_objects_missing';
  end if;
  select relrowsecurity, relforcerowsecurity into ledger_rls, ledger_force_rls
  from pg_class where oid = 'atlas_private.meta_permit_ledger'::regclass;
  select relrowsecurity, relforcerowsecurity into audit_rls, audit_force_rls
  from pg_class where oid = 'atlas_private.meta_permit_ledger_audit'::regclass;
  if not (ledger_rls and ledger_force_rls and audit_rls and audit_force_rls) then
    raise exception 'atlas_phase29_rls_not_forced';
  end if;
  if has_table_privilege('anon', 'atlas_private.meta_permit_ledger', 'select')
    or has_table_privilege('authenticated', 'atlas_private.meta_permit_ledger', 'select')
  then
    raise exception 'atlas_phase29_public_privilege_detected';
  end if;
end;
$atlas_phase29_verify$;
`);
writeFileSync(rollbackBundle, `${expectedDatabaseGuard}\n${rollback}`);
writeFileSync(cleanupVerificationFile, `
do $atlas_phase29_verify_clean$
begin
  if to_regclass('atlas_private.meta_permit_ledger') is not null
    or to_regclass('atlas_private.meta_permit_ledger_audit') is not null
    or to_regprocedure('public.atlas_prepare_meta_permit_reservation_v1(uuid,uuid,text,smallint,integer,integer,timestamptz,text,text,text,text,text,text,text,text,text)') is not null
    or to_regprocedure('atlas_private.all_distinct_text(text[])') is not null
  then
    raise exception 'atlas_phase29_rollback_incomplete';
  end if;
end;
$atlas_phase29_verify_clean$;
`);

const runCliFile = (file) => spawnSync("npm", [
  "exec", "--yes", "--package=supabase@2.109.1", "--", "supabase",
  "db", "query", "--db-url", databaseUrl.toString(), "--file", file
], { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
const digestResult = (result) => sha256(`${result.status ?? "null"}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);

let migrationApplied = false;
let schemaVerified = false;
let rollbackAttempted = false;
let rollbackSucceeded = false;
let finalLedgerObjectsAbsent = false;
const outputDigests = {};
let failure = null;

try {
  const applied = runCliFile(migrationBundle);
  outputDigests.migration = digestResult(applied);
  if (applied.status !== 0) throw new Error("isolated_migration_failed");
  migrationApplied = true;

  const verified = runCliFile(verificationFile);
  outputDigests.verification = digestResult(verified);
  if (verified.status !== 0) throw new Error("isolated_schema_verification_failed");
  schemaVerified = true;
} catch (error) {
  failure = error;
} finally {
  if (migrationApplied) {
    rollbackAttempted = true;
    const rolledBack = runCliFile(rollbackBundle);
    outputDigests.rollback = digestResult(rolledBack);
    rollbackSucceeded = rolledBack.status === 0;
    if (rollbackSucceeded) {
      const clean = runCliFile(cleanupVerificationFile);
      outputDigests.cleanupVerification = digestResult(clean);
      finalLedgerObjectsAbsent = clean.status === 0;
    }
  }
  rmSync(tempDirectory, { recursive: true, force: true });
}

if (failure || !migrationApplied || !schemaVerified || !rollbackAttempted || !rollbackSucceeded || !finalLedgerObjectsAbsent) {
  console.error(failure?.message ?? "phase29_rehearsal_incomplete");
  process.exit(1);
}

const evidence = {
  format: "atlas_meta_repeatability_migration_rehearsal_v1",
  phase: 29,
  environment: "staging_clone",
  status: "passed",
  target: {
    hostFingerprint: sha256(databaseUrl.hostname),
    databaseFingerprint: sha256(databaseName),
    projectRefFingerprint: sha256(process.env.ATLAS_PHASE29_ISOLATED_PROJECT_REF),
    productionIdentityCompared: true
  },
  tooling: { supabaseCliVersion: "2.109.1", officialMigrationCreated: true },
  rehearsal: {
    migrationApplied,
    schemaVerified,
    rollbackAttempted,
    rollbackSucceeded,
    finalLedgerObjectsAbsent,
    permitReservationPersisted: false,
    outputDigests
  },
  officialMigrationSha256: sha256(migration),
  releaseGates: {
    isolatedRehearsalApproved: true,
    ledgerPersistenceAllowed: false,
    permitIssuanceAllowed: false,
    permitConsumptionAllowed: false,
    automaticDeliveryAllowed: false,
    productionDeliveryAllowed: false,
    deploymentAllowed: false
  }
};
if (existsSync(evidencePath)) {
  console.error("evidence_file_already_exists");
  process.exit(1);
}
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ passed: true, evidenceFile: evidenceRelative, databaseTouched: true, productionTouched: false, metaTouched: false }, null, 2));
