import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildMetaPermitReservationRpcArgs, prepareMetaPermitReservation } from "../lib/meta/meta-permit-ledger-adapter.mjs";
import { validatePhase27Preparation } from "./preflight-meta-repeatability-sample-02-atomic-ledger.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => readFileSync(resolve(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const gate = readJson("config/meta-repeatability-sample-02-durable-ledger-gate.json");
const HASH = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const canonicalize = (value) => Array.isArray(value)
  ? value.map(canonicalize)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
    : value;
const fingerprint = (value) => sha256(JSON.stringify(canonicalize(value)));

function hasForbiddenMaterial(value) {
  const serialized = JSON.stringify(value);
  return /Bearer\s+|sb_secret_|\.supabase\.co|"(email|phone|cpf|address|income|payload|rawPayload|rawResponse|testEventCode)"\s*:/i.test(serialized);
}

function checksFor(text, definitions) {
  return definitions.map(([id, pattern, expected = true]) => ({ id, passed: pattern.test(text) === expected }));
}

export function inspectDurableLedgerDrafts() {
  const adapter = read(gate.artifacts.adapter);
  const migration = read(gate.artifacts.migrationDraft);
  const rollback = read(gate.artifacts.rollbackDraft);
  const assertions = [
    ...checksFor(adapter, [
      ["adapter_rpc_injected", /typeof rpc !== "function"/],
      ["adapter_hash_validation", /\^\[a-f0-9\]\{64\}\$/],
      ["adapter_uuid_validation", /assertUuid\(input\.organizationId, "organization_id"\)/],
      ["adapter_revision_zero_to_one", /expectedRevision !== 0 \|\| input\.proposedRevision !== 1/],
      ["adapter_expiry_bounded", /now \+ 5 \* 60_000/],
      ["adapter_identity_collision_closed", /ledger_identity_collision/],
      ["adapter_transport_closed", /ledger_rpc_transport_failed/],
      ["adapter_rejection_closed", /ledger_rpc_rejected/],
      ["adapter_no_fetch", /fetch\s*\(/, false],
      ["adapter_no_supabase_client", /createClient\s*\(/, false],
    ]),
    ...checksFor(migration, [
      ["migration_marked_draft", /RASCUNHO LOCAL\. NAO E UMA MIGRATION PROMOVIDA/],
      ["migration_staging_guard", /atlas_meta_ledger_staging_clone_only/],
      ["migration_short_lock_timeout", /lock_timeout = '5s'/],
      ["migration_short_statement_timeout", /statement_timeout = '30s'/],
      ["migration_private_schema", /create schema if not exists atlas_private/],
      ["migration_ledger_table", /create table atlas_private\.meta_permit_ledger \(/],
      ["migration_audit_table", /create table atlas_private\.meta_permit_ledger_audit \(/],
      ["migration_tenant_fk", /organization_id uuid not null references public\.organizations\(id\) on delete restrict/],
      ["migration_unique_ledger_key", /unique \(organization_id, ledger_key_fingerprint\)/],
      ["migration_unique_nonce", /unique \(organization_id, permit_nonce_fingerprint\)/],
      ["migration_unique_idempotency", /unique \(organization_id, idempotency_fingerprint\)/],
      ["migration_partial_active_index", /where state in \('reserved_unissued', 'issued_unconsumed'\)/],
      ["migration_ledger_rls", /alter table atlas_private\.meta_permit_ledger enable row level security/],
      ["migration_ledger_force_rls", /alter table atlas_private\.meta_permit_ledger force row level security/],
      ["migration_audit_rls", /alter table atlas_private\.meta_permit_ledger_audit enable row level security/],
      ["migration_audit_force_rls", /alter table atlas_private\.meta_permit_ledger_audit force row level security/],
      ["migration_authenticated_revoked", /revoke all on table atlas_private\.meta_permit_ledger from public, anon, authenticated/],
      ["migration_service_role_only", /grant execute on function public\.atlas_prepare_meta_permit_reservation_v1[\s\S]*to service_role/],
      ["migration_security_invoker", /security invoker/],
      ["migration_empty_search_path", /set search_path = ''/],
      ["migration_no_security_definer", /security definer/i, false],
      ["migration_insert_on_conflict", /on conflict do nothing/],
      ["migration_identity_collision_closed", /meta_ledger_identity_collision/],
      ["migration_identity_distinct_constraint", /meta_permit_ledger_identity_distinct_check[\s\S]*atlas_private\.all_distinct_text/],
      ["migration_active_actor_scope", /organization_id = p_organization_id and active is true/],
      ["migration_append_only_audit_insert", /insert into atlas_private\.meta_permit_ledger_audit/],
      ["migration_no_issue_function", /atlas_issue_meta_permit/i, false],
      ["migration_no_consume_function", /atlas_consume_meta_permit/i, false],
      ["migration_no_delivery", /graph\.facebook|conversions_access_token|test_event_code/i, false],
    ]),
    ...checksFor(rollback, [
      ["rollback_marked_draft", /ROLLBACK DE RASCUNHO\. NAO EXECUTAR/],
      ["rollback_staging_guard", /atlas_meta_ledger_rollback_staging_clone_only/],
      ["rollback_non_empty_guard", /atlas_meta_ledger_rollback_refuses_non_empty_ledger/],
      ["rollback_drops_rpc", /drop function if exists public\.atlas_prepare_meta_permit_reservation_v1/],
      ["rollback_drops_audit_first", /drop table if exists atlas_private\.meta_permit_ledger_audit;[\s\S]*drop table if exists atlas_private\.meta_permit_ledger;/],
      ["rollback_drops_distinct_helper_last", /drop table if exists atlas_private\.meta_permit_ledger;[\s\S]*drop function if exists atlas_private\.all_distinct_text/],
      ["rollback_keeps_private_schema", /drop schema/i, false],
    ]),
  ];
  return {
    passed: assertions.every((item) => item.passed),
    assertions,
    fingerprints: {
      adapter: sha256(adapter),
      migrationDraft: sha256(migration),
      rollbackDraft: sha256(rollback),
    },
  };
}

export function validateDurableLedgerRequest(input, phase27Preparation, now = Date.now()) {
  const issues = new Set();
  const source = validatePhase27Preparation(phase27Preparation, now);
  if (!source.approved) for (const issue of source.issueCodes) issues.add(`phase27:${issue}`);
  if (input?.format !== "atlas_meta_repeatability_durable_ledger_request_v1" || input?.phase !== 28 || input?.environment !== gate.environment) issues.add("durable_ledger_request_invalid");
  if (!HASH.test(input?.sourcePhase27Fingerprint ?? "") || input?.sourcePhase27Fingerprint !== fingerprint(phase27Preparation)) issues.add("phase27_fingerprint_mismatch");
  if (input?.slot?.slotId !== gate.targetSlot.slotId || input?.slot?.sampleOrdinal !== gate.targetSlot.sampleOrdinal) issues.add("durable_ledger_slot_invalid");
  const operation = input?.operation ?? {};
  if (operation.type !== "validate_durable_ledger_adapter_draft") issues.add("durable_ledger_operation_invalid");
  for (const field of ["connectDatabase", "executeMigration", "executeRollback", "persistReservation", "issuePermit", "consumePermit", "executeAction", "deliverEvent"]) {
    if (operation[field] !== false) issues.add(`durable_ledger_operation_must_remain_inactive:${field}`);
  }
  const controls = input?.controls ?? {};
  for (const field of ["sourceLedgerReviewed", "privateSchemaRequired", "tenantIsolationRequired", "serviceRoleOnlyRequired", "rowLevelSecurityRequired", "appendOnlyAuditRequired", "rollbackRefusesNonEmptyLedger", "supabaseCliPromotionRequired", "stopWithoutRetry", "campaignUnchanged", "budgetUnchanged", "audienceUnchanged", "noPerformanceClaim"]) {
    if (controls[field] !== true) issues.add(`durable_ledger_control_missing:${field}`);
  }
  if (controls.realCustomerDataIncluded !== false) issues.add("real_customer_data_forbidden");
  const requestedAt = Date.parse(input?.requestedAt ?? "");
  const sourceGeneratedAt = Date.parse(phase27Preparation?.generatedAt ?? "");
  const sourceExpiresAt = Date.parse(phase27Preparation?.sourceEvidence?.phase25ExpiresAt ?? "");
  if (![requestedAt, sourceGeneratedAt, sourceExpiresAt].every(Number.isFinite)) issues.add("durable_ledger_time_invalid");
  else {
    if (requestedAt < sourceGeneratedAt || requestedAt > now + 300_000) issues.add("durable_ledger_request_timestamp_invalid");
    if (sourceExpiresAt <= now) issues.add("source_ledger_expired");
  }
  if (hasForbiddenMaterial(input)) issues.add("forbidden_material_detected");
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

export function createDurableLedgerPreparation(phase27Preparation, request, now = Date.now()) {
  const validation = validateDurableLedgerRequest(request, phase27Preparation, now);
  const inspection = inspectDurableLedgerDrafts();
  if (!inspection.passed) validation.issueCodes.push("durable_ledger_artifact_static_audit_failed");
  if (!validation.approved || !inspection.passed) return { approved: false, issueCodes: [...new Set(validation.issueCodes)].sort(), preparation: null };
  const preparation = {
    format: "atlas_meta_repeatability_durable_ledger_preparation_v1",
    phase: 28,
    environment: gate.environment,
    generatedAt: new Date(now).toISOString(),
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    rawResponsePersisted: false,
    databaseTouched: false,
    networkTouched: false,
    sourceEvidence: {
      phase27Approved: true,
      phase27Fingerprint: fingerprint(phase27Preparation),
      phase27GeneratedAt: phase27Preparation.generatedAt,
      phase25ExpiresAt: phase27Preparation.sourceEvidence.phase25ExpiresAt,
    },
    slot: { ...gate.targetSlot, requiredLedgerStatus: undefined },
    artifacts: {
      adapterFingerprint: inspection.fingerprints.adapter,
      migrationDraftFingerprint: inspection.fingerprints.migrationDraft,
      rollbackDraftFingerprint: inspection.fingerprints.rollbackDraft,
      staticAssertionCount: inspection.assertions.length,
      staticAssertionsPassed: inspection.assertions.filter((item) => item.passed).length,
    },
    databaseContract: {
      privateSchema: gate.databaseContract.privateSchema,
      tenantIsolated: true,
      rowLevelSecurityEnabled: true,
      rowLevelSecurityForced: true,
      serviceRoleOnly: true,
      singleTransactionReservation: true,
      duplicateFailsClosed: true,
      appendOnlyAudit: true,
      safeRollbackDrafted: true,
    },
    lifecycle: {
      status: "adapter_and_reversible_migration_drafted_not_executed",
      migrationPromoted: false,
      migrationExecuted: false,
      rollbackExecuted: false,
      reservationPersisted: false,
      permitIssued: false,
      permitUsable: false,
      permitConsumed: false,
      actionExecuted: false,
      eventDelivered: false,
    },
    releaseGates: {
      durableAdapterDraftPrepared: true,
      phase27LedgerLinked: true,
      migrationPromotionAllowed: false,
      migrationExecutionAllowed: false,
      rollbackExecutionAllowed: false,
      ledgerPersistenceAllowed: false,
      permitIssuanceAllowed: false,
      permitConsumptionAllowed: false,
      authorizationActivationAllowed: false,
      manualObservationAllowed: false,
      automaticRetryAllowed: false,
      automaticDeliveryAllowed: false,
      productionDeliveryAllowed: false,
      campaignMutationAllowed: false,
      budgetMutationAllowed: false,
      audienceMutationAllowed: false,
      deploymentAllowed: false,
    },
    issueCodes: [],
    errorCode: null,
  };
  delete preparation.slot.requiredLedgerStatus;
  return { approved: true, issueCodes: [], preparation };
}

export function validatePhase28Preparation(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_repeatability_durable_ledger_preparation_v1" || input?.phase !== 28 || input?.environment !== gate.environment) issues.add("phase28_preparation_invalid");
  if (input?.passed !== true || input?.sanitized !== true || input?.databaseTouched !== false || input?.networkTouched !== false) issues.add("phase28_preparation_not_local_only");
  if (input?.containsSecrets !== false || input?.containsPersonalData !== false || input?.containsTemporaryCode !== false || input?.payloadPersisted !== false || input?.rawResponsePersisted !== false) issues.add("phase28_preparation_not_sanitized");
  if (hasForbiddenMaterial(input)) issues.add("forbidden_material_detected");
  const source = input?.sourceEvidence ?? {};
  if (source.phase27Approved !== true || !HASH.test(source.phase27Fingerprint ?? "")) issues.add("phase27_source_invalid");
  const sourceExpiresAt = Date.parse(source.phase25ExpiresAt ?? "");
  const generatedAt = Date.parse(input?.generatedAt ?? "");
  if (![sourceExpiresAt, generatedAt].every(Number.isFinite) || sourceExpiresAt <= now || generatedAt > now + 300_000) issues.add("phase28_time_invalid");
  const artifacts = input?.artifacts ?? {};
  if (![artifacts.adapterFingerprint, artifacts.migrationDraftFingerprint, artifacts.rollbackDraftFingerprint].every((value) => HASH.test(value ?? ""))) issues.add("phase28_artifact_fingerprint_invalid");
  if (!Number.isInteger(artifacts.staticAssertionCount) || artifacts.staticAssertionCount < 35 || artifacts.staticAssertionsPassed !== artifacts.staticAssertionCount) issues.add("phase28_static_audit_incomplete");
  const contract = input?.databaseContract ?? {};
  for (const field of ["tenantIsolated", "rowLevelSecurityEnabled", "rowLevelSecurityForced", "serviceRoleOnly", "singleTransactionReservation", "duplicateFailsClosed", "appendOnlyAudit", "safeRollbackDrafted"]) if (contract[field] !== true) issues.add(`phase28_database_contract_invalid:${field}`);
  if (contract.privateSchema !== "atlas_private") issues.add("phase28_private_schema_invalid");
  const lifecycle = input?.lifecycle ?? {};
  if (lifecycle.status !== "adapter_and_reversible_migration_drafted_not_executed") issues.add("phase28_lifecycle_invalid");
  for (const field of ["migrationPromoted", "migrationExecuted", "rollbackExecuted", "reservationPersisted", "permitIssued", "permitUsable", "permitConsumed", "actionExecuted", "eventDelivered"]) if (lifecycle[field] !== false) issues.add(`phase28_falsely_advanced:${field}`);
  const release = input?.releaseGates ?? {};
  if (release.durableAdapterDraftPrepared !== true || release.phase27LedgerLinked !== true) issues.add("phase28_draft_gate_not_prepared");
  for (const field of ["migrationPromotionAllowed", "migrationExecutionAllowed", "rollbackExecutionAllowed", "ledgerPersistenceAllowed", "permitIssuanceAllowed", "permitConsumptionAllowed", "authorizationActivationAllowed", "manualObservationAllowed", "automaticRetryAllowed", "automaticDeliveryAllowed", "productionDeliveryAllowed", "campaignMutationAllowed", "budgetMutationAllowed", "audienceMutationAllowed", "deploymentAllowed"]) if (release[field] !== false) issues.add(`phase28_release_gate_invalid:${field}`);
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

function phase27Fixture(now) {
  return {
    format: "atlas_meta_repeatability_atomic_ledger_preparation_v1", phase: 27, environment: "staging_clone",
    generatedAt: new Date(now - 20_000).toISOString(), passed: true, sanitized: true,
    containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false, payloadPersisted: false, rawResponsePersisted: false, screenshotPersisted: false,
    sourceEvidence: { phase26Approved: true, phase26Fingerprint: "1".repeat(64), phase25Fingerprint: "2".repeat(64), phase26GeneratedAt: new Date(now - 40_000).toISOString(), phase25ExpiresAt: new Date(now + 120_000).toISOString() },
    slot: { slotId: "repeatability_02", sampleOrdinal: 2 },
    event: { eventName: "QualifiedLead", classification: "commercial_progress", eventIdFingerprint: "3".repeat(64), syntheticRecordFingerprint: "4".repeat(64) },
    identity: { ledgerReferenceFingerprint: "5".repeat(64), ledgerKeyFingerprint: "6".repeat(64), contractReferenceFingerprint: "7".repeat(64), permitNonceFingerprint: "8".repeat(64), idempotencyFingerprint: "9".repeat(64) },
    atomicPolicy: { strategy: "compare_and_set", expectedRevision: 0, proposedRevision: 1, singleWinnerRequired: true, duplicateReservationRejected: true, atomicConsumptionRequired: true, appendOnlyAuditRequired: true },
    rehearsal: { inMemoryOnly: true, attemptCount: 2, winnerCount: 1, duplicateRejectionCount: 1, databaseTouched: false, filesystemLedgerTouched: false, networkTouched: false },
    lifecycle: { status: "atomic_ledger_contract_prepared_not_persisted", reservationPersisted: false, permitIssued: false, permitUsable: false, permitConsumed: false, actionExecuted: false, eventDelivered: false },
    releaseGates: { atomicLedgerContractPrepared: true, phase26ContractLinked: true, ledgerPersistenceAllowed: false, permitIssuanceAllowed: false, permitConsumptionAllowed: false, authorizationActivationAllowed: false, manualObservationAllowed: false, automaticRetryAllowed: false, automaticDeliveryAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
}

function requestFixture(source, now) {
  return {
    format: "atlas_meta_repeatability_durable_ledger_request_v1", phase: 28, environment: "staging_clone", requestedAt: new Date(now - 2_000).toISOString(), sourcePhase27Fingerprint: fingerprint(source),
    slot: { slotId: "repeatability_02", sampleOrdinal: 2 },
    operation: { type: "validate_durable_ledger_adapter_draft", connectDatabase: false, executeMigration: false, executeRollback: false, persistReservation: false, issuePermit: false, consumePermit: false, executeAction: false, deliverEvent: false },
    controls: { sourceLedgerReviewed: true, privateSchemaRequired: true, tenantIsolationRequired: true, serviceRoleOnlyRequired: true, rowLevelSecurityRequired: true, appendOnlyAuditRequired: true, rollbackRefusesNonEmptyLedger: true, supabaseCliPromotionRequired: true, realCustomerDataIncluded: false, stopWithoutRetry: true, campaignUnchanged: true, budgetUnchanged: true, audienceUnchanged: true, noPerformanceClaim: true },
  };
}

function adapterFixture(now) {
  return {
    organizationId: "11111111-1111-4111-8111-111111111111", actorId: "22222222-2222-4222-8222-222222222222",
    slotId: "repeatability_02", sampleOrdinal: 2, expectedRevision: 0, proposedRevision: 1, expiresAt: new Date(now + 60_000).toISOString(),
    phase27Fingerprint: "1".repeat(64), phase26Fingerprint: "2".repeat(64), ledgerKeyFingerprint: "3".repeat(64), contractReferenceFingerprint: "4".repeat(64), permitNonceFingerprint: "5".repeat(64), idempotencyFingerprint: "6".repeat(64), eventIdFingerprint: "7".repeat(64), syntheticRecordFingerprint: "8".repeat(64), evidenceFingerprint: "9".repeat(64),
  };
}

async function runSelfTest() {
  const now = Date.now();
  const source = phase27Fixture(now);
  const request = requestFixture(source, now);
  const created = createDurableLedgerPreparation(source, request, now);
  const validated = validatePhase28Preparation(created.preparation, now);
  const tests = [
    { id: "local_draft_preparation_approved", passed: created.approved && validated.approved, issues: created.approved ? validated.issueCodes : created.issueCodes },
    { id: "all_static_assertions_passed", passed: created.preparation?.artifacts?.staticAssertionsPassed === created.preparation?.artifacts?.staticAssertionCount },
    { id: "migration_not_executed", passed: created.preparation?.lifecycle?.migrationExecuted === false && created.preparation?.databaseTouched === false },
    { id: "reservation_not_persisted", passed: created.preparation?.lifecycle?.reservationPersisted === false && created.preparation?.releaseGates?.ledgerPersistenceAllowed === false },
    { id: "permit_and_delivery_closed", passed: created.preparation?.lifecycle?.permitIssued === false && created.preparation?.lifecycle?.eventDelivered === false },
  ];
  const args = buildMetaPermitReservationRpcArgs(adapterFixture(now), now);
  tests.push({ id: "adapter_builds_sanitized_rpc_args", passed: args.p_expected_revision === 0 && args.p_proposed_revision === 1 && !hasForbiddenMaterial(args) });
  const fakeRow = { reservation_id: "33333333-3333-4333-8333-333333333333", disposition: "reserved", state: "reserved_unissued", revision: 1, evidence_fingerprint: "9".repeat(64), expires_at: new Date(now + 60_000).toISOString() };
  const reserved = await prepareMetaPermitReservation({ rpc: async () => ({ data: [fakeRow], error: null }), input: adapterFixture(now), now });
  tests.push({ id: "adapter_accepts_valid_rpc_result", passed: reserved.disposition === "reserved" && reserved.revision === 1 });
  let rejected = false;
  try { await prepareMetaPermitReservation({ rpc: async () => ({ data: null, error: new Error("synthetic") }), input: adapterFixture(now), now }); } catch (error) { rejected = error?.code === "ledger_rpc_rejected"; }
  tests.push({ id: "adapter_fails_closed_on_rpc_error", passed: rejected });
  const mutationTests = [
    ["database_connection_forbidden", (value) => { value.operation.connectDatabase = true; }, "connectDatabase"],
    ["migration_execution_forbidden", (value) => { value.operation.executeMigration = true; }, "executeMigration"],
    ["reservation_persistence_forbidden", (value) => { value.operation.persistReservation = true; }, "persistReservation"],
    ["source_fingerprint_required", (value) => { value.sourcePhase27Fingerprint = "a".repeat(64); }, "phase27_fingerprint_mismatch"],
  ];
  for (const [id, mutate, code] of mutationTests) {
    const altered = requestFixture(source, now); mutate(altered);
    const result = validateDurableLedgerRequest(altered, source, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  }
  let identityCollision = false;
  try { const input = adapterFixture(now); input.evidenceFingerprint = input.phase27Fingerprint; buildMetaPermitReservationRpcArgs(input, now); } catch (error) { identityCollision = error?.code === "ledger_identity_collision"; }
  tests.push({ id: "adapter_rejects_identity_collision", passed: identityCollision });
  const failures = tests.filter((test) => !test.passed);
  if (failures.length) {
    console.error(JSON.stringify({ passed: false, testCount: tests.length, failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ passed: true, testCount: tests.length, staticAssertionCount: created.preparation.artifacts.staticAssertionCount, databaseTouched: false, networkTouched: false }, null, 2));
}

if (process.argv.includes("--self-test") || import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await runSelfTest();
