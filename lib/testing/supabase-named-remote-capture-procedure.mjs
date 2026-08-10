import { createHash } from "node:crypto";
import {
  EXPECTED_PROJECT_REF_SHA256,
  buildNamedRemoteEvidenceRequest,
} from "./supabase-named-remote-evidence-contract.mjs";

export const NAMED_REMOTE_CAPTURE_PROCEDURE_SCHEMA =
  "atlas.named_remote_capture_procedure.v1";
export const NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG =
  "ATLAS_ALLOW_READ_ONLY_NAMED_REMOTE_MIGRATION_METADATA";
export const SUPABASE_CLI_AUDITED_VERSION = "2.109.1";

// The Supabase CLI stores the filename suffix in `name`, but `migration list`
// intentionally returns only `version` for backwards compatibility. This
// query reconstructs the canonical `<version>_<name>` identity without
// reading migration SQL bodies.
export const NAMED_REMOTE_METADATA_READ_ONLY_SQL = [
  "BEGIN TRANSACTION READ ONLY;",
  "SELECT version, version || '_' || name AS name",
  "FROM supabase_migrations.schema_migrations",
  "WHERE name IS NOT NULL AND name <> ''",
  "ORDER BY version;",
  "ROLLBACK;",
].join("\n");

const PROHIBITED_SQL = /\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|copy|call|do)\b/i;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateReadOnlyNamedMetadataSql(sql = NAMED_REMOTE_METADATA_READ_ONLY_SQL) {
  const normalized = String(sql).trim();
  if (!normalized.startsWith("BEGIN TRANSACTION READ ONLY;")) {
    return { valid: false, reason: "read_only_transaction_missing" };
  }
  if (!normalized.endsWith("ROLLBACK;")) {
    return { valid: false, reason: "read_only_transaction_not_rolled_back" };
  }
  if (PROHIBITED_SQL.test(normalized)) {
    return { valid: false, reason: "prohibited_sql_token_detected" };
  }
  if (!/SELECT version, version \|\| '_' \|\| name AS name/i.test(normalized)) {
    return { valid: false, reason: "named_metadata_projection_missing" };
  }
  if (!/FROM supabase_migrations\.schema_migrations/i.test(normalized)) {
    return { valid: false, reason: "migration_history_source_invalid" };
  }
  return { valid: true, reason: "fixed_named_metadata_query_is_read_only" };
}

export function buildNamedRemoteCaptureProcedure({
  root = process.cwd(),
  generatedAt = new Date(),
} = {}) {
  const request = buildNamedRemoteEvidenceRequest({ root, generatedAt });
  const sqlValidation = validateReadOnlyNamedMetadataSql();
  if (!sqlValidation.valid) {
    throw new Error(`unsafe_named_remote_capture_query:${sqlValidation.reason}`);
  }

  return {
    schemaVersion: NAMED_REMOTE_CAPTURE_PROCEDURE_SCHEMA,
    phase: 184,
    status: "prepared_not_executed",
    generatedAt: generatedAt.toISOString(),
    singleUse: true,
    targetIdentity: {
      projectRefSha256: EXPECTED_PROJECT_REF_SHA256,
    },
    authorization: {
      required: true,
      explicitPerExecution: true,
      environmentFlag: NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG,
      currentlyAuthorized: false,
      humanReviewRequired: true,
    },
    auditedCapability: {
      supabaseCliVersion: SUPABASE_CLI_AUDITED_VERSION,
      migrationListReturnsVersionOnly: true,
      migrationHistoryHasNameColumn: true,
      sourceContract:
        "supabase/cli v2.109.1 apps/cli-go/pkg/migration/history.go and list.go",
    },
    operation: {
      mode: request.requiredCaptureMode,
      transport: "operator_supplied_postgres_session",
      transaction: "READ ONLY",
      resultColumns: ["version", "name"],
      querySha256: sha256(NAMED_REMOTE_METADATA_READ_ONLY_SQL),
      sqlBodiesSelected: false,
      rawOutputMustNotBePersisted: true,
      adapterInputSchema: "atlas.read_only_named_migration_metadata_capture.v1",
    },
    requiredLogicalNames: request.requiredMappings.map(({ logicalName }) => logicalName),
    safeguards: {
      remoteContacted: false,
      remoteWriteExecuted: false,
      migrationApplied: false,
      migrationPushExecuted: false,
      migrationHistoryRepaired: false,
      migrationFileRenamed: false,
      databaseReset: false,
      buildExecuted: false,
      zipGenerated: false,
      deployExecuted: false,
      secretsPersisted: false,
    },
    executionAvailableInThisPhase: false,
    operatorSteps: [
      "Confirmar autorização explícita e pontual antes de qualquer contato remoto.",
      "Confirmar por hash que o projeto vinculado é o alvo esperado.",
      "Abrir sessão PostgreSQL fornecida pelo operador sem registrar a credencial.",
      "Executar somente a consulta fixa dentro de transação READ ONLY.",
      "Reter exclusivamente version e name; descartar saída bruta e encerrar a sessão.",
      "Adaptar a captura pela fase 183 e submeter a evidência à revisão humana.",
    ],
  };
}

export function validateNamedRemoteCaptureProcedure(procedure, { root = process.cwd() } = {}) {
  if (!procedure || procedure.schemaVersion !== NAMED_REMOTE_CAPTURE_PROCEDURE_SCHEMA) {
    return { valid: false, reason: "procedure_schema_invalid" };
  }
  const generatedAt = new Date(procedure.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    return { valid: false, reason: "procedure_generated_at_invalid" };
  }
  const expected = buildNamedRemoteCaptureProcedure({
    root,
    generatedAt,
  });
  if (procedure.status !== "prepared_not_executed" || procedure.executionAvailableInThisPhase !== false) {
    return { valid: false, reason: "procedure_execution_state_invalid" };
  }
  if (procedure.targetIdentity?.projectRefSha256 !== EXPECTED_PROJECT_REF_SHA256) {
    return { valid: false, reason: "procedure_target_invalid" };
  }
  if (
    procedure.authorization?.currentlyAuthorized !== false ||
    procedure.authorization?.environmentFlag !== NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG ||
    procedure.authorization?.humanReviewRequired !== true
  ) {
    return { valid: false, reason: "procedure_authorization_invalid" };
  }
  if (procedure.operation?.querySha256 !== expected.operation.querySha256) {
    return { valid: false, reason: "procedure_query_changed" };
  }
  if (
    procedure.operation?.transaction !== "READ ONLY" ||
    procedure.operation?.sqlBodiesSelected !== false ||
    procedure.operation?.rawOutputMustNotBePersisted !== true
  ) {
    return { valid: false, reason: "procedure_read_only_guards_invalid" };
  }
  const expectedSafeguardKeys = Object.keys(expected.safeguards);
  const actualSafeguardKeys = Object.keys(procedure.safeguards ?? {});
  if (
    actualSafeguardKeys.length !== expectedSafeguardKeys.length ||
    expectedSafeguardKeys.some((key) => procedure.safeguards?.[key] !== false) ||
    actualSafeguardKeys.some((key) => !expectedSafeguardKeys.includes(key))
  ) {
    return { valid: false, reason: "procedure_safeguards_tainted" };
  }
  if (
    !Array.isArray(procedure.requiredLogicalNames) ||
    procedure.requiredLogicalNames.length !== expected.requiredLogicalNames.length ||
    procedure.requiredLogicalNames.some(
      (logicalName, index) => logicalName !== expected.requiredLogicalNames[index],
    )
  ) {
    return { valid: false, reason: "procedure_required_names_incomplete" };
  }
  return {
    valid: true,
    reason: "single_use_read_only_procedure_prepared_not_executed",
    requiredLogicalNameCount: expected.requiredLogicalNames.length,
  };
}
