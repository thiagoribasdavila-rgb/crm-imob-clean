import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildNamedRemoteCaptureProcedure,
  NAMED_REMOTE_METADATA_READ_ONLY_SQL,
  validateNamedRemoteCaptureProcedure,
  validateReadOnlyNamedMetadataSql,
} from "../../lib/testing/supabase-named-remote-capture-procedure.mjs";

const NOW = new Date("2026-08-08T20:00:00.000Z");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-named-capture-procedure-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_first.sql"), "select 1;");
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_second.sql"), "select 2;");
  return root;
}

test("procedimento fica preparado sem autorização ou execução implícita", () => {
  const root = fixture();
  try {
    const procedure = buildNamedRemoteCaptureProcedure({ root, generatedAt: NOW });
    assert.equal(procedure.status, "prepared_not_executed");
    assert.equal(procedure.executionAvailableInThisPhase, false);
    assert.equal(procedure.authorization.currentlyAuthorized, false);
    assert.equal(procedure.safeguards.remoteContacted, false);
    assert.equal(procedure.safeguards.remoteWriteExecuted, false);
    assert.equal(procedure.requiredLogicalNames.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("consulta fixa lê somente version e name em transação read only", () => {
  const validation = validateReadOnlyNamedMetadataSql();
  assert.equal(validation.valid, true);
  assert.match(NAMED_REMOTE_METADATA_READ_ONLY_SQL, /BEGIN TRANSACTION READ ONLY/);
  assert.match(NAMED_REMOTE_METADATA_READ_ONLY_SQL, /SELECT version, version \|\| '_' \|\| name AS name/);
  assert.doesNotMatch(NAMED_REMOTE_METADATA_READ_ONLY_SQL, /\bstatements\b/i);
  assert.match(NAMED_REMOTE_METADATA_READ_ONLY_SQL, /ROLLBACK;$/);
});

test("qualquer mutação na consulta é rejeitada", () => {
  const tampered = NAMED_REMOTE_METADATA_READ_ONLY_SQL.replace(
    "SELECT version",
    "DELETE FROM supabase_migrations.schema_migrations; SELECT version",
  );
  assert.equal(validateReadOnlyNamedMetadataSql(tampered).reason, "prohibited_sql_token_detected");
});

test("mudança na consulta ou sinal de execução invalida o procedimento", () => {
  const root = fixture();
  try {
    const changedQuery = buildNamedRemoteCaptureProcedure({ root, generatedAt: NOW });
    changedQuery.operation.querySha256 = "a".repeat(64);
    assert.equal(
      validateNamedRemoteCaptureProcedure(changedQuery, { root }).reason,
      "procedure_query_changed",
    );

    const executed = buildNamedRemoteCaptureProcedure({ root, generatedAt: NOW });
    executed.safeguards.remoteContacted = true;
    assert.equal(
      validateNamedRemoteCaptureProcedure(executed, { root }).reason,
      "procedure_safeguards_tainted",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("procedimento íntegro é aceito sem liberar reconciliação ou release", () => {
  const root = fixture();
  try {
    const procedure = buildNamedRemoteCaptureProcedure({ root, generatedAt: NOW });
    const validation = validateNamedRemoteCaptureProcedure(procedure, { root });
    assert.equal(validation.valid, true);
    assert.equal(validation.requiredLogicalNameCount, 2);
    assert.equal(procedure.safeguards.buildExecuted, false);
    assert.equal(procedure.safeguards.zipGenerated, false);
    assert.equal(procedure.safeguards.deployExecuted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entrada ausente ou data inválida falha fechada sem exceção", () => {
  assert.equal(validateNamedRemoteCaptureProcedure(null).reason, "procedure_schema_invalid");
  assert.equal(
    validateNamedRemoteCaptureProcedure({
      schemaVersion: "atlas.named_remote_capture_procedure.v1",
      generatedAt: "data-invalida",
    }).reason,
    "procedure_generated_at_invalid",
  );
});

test("salvaguarda ausente ou identidade lógica trocada falha fechada", () => {
  const root = fixture();
  try {
    const missingSafeguard = buildNamedRemoteCaptureProcedure({ root, generatedAt: NOW });
    delete missingSafeguard.safeguards.secretsPersisted;
    assert.equal(
      validateNamedRemoteCaptureProcedure(missingSafeguard, { root }).reason,
      "procedure_safeguards_tainted",
    );

    const changedLogicalName = buildNamedRemoteCaptureProcedure({ root, generatedAt: NOW });
    changedLogicalName.requiredLogicalNames[0] = "migration_diferente";
    assert.equal(
      validateNamedRemoteCaptureProcedure(changedLogicalName, { root }).reason,
      "procedure_required_names_incomplete",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
