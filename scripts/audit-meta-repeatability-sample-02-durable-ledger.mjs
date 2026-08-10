import { readFileSync } from "node:fs";
import { inspectDurableLedgerDrafts } from "./preflight-meta-repeatability-sample-02-durable-ledger.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-durable-ledger-gate.json"));
const runner = read("scripts/run-meta-repeatability-sample-02-durable-ledger.mjs");
const adapter = read(gate.artifacts.adapter);
const migration = read(gate.artifacts.migrationDraft);
const rollback = read(gate.artifacts.rollbackDraft);
const inspection = inspectDurableLedgerDrafts();
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 28 && gate.mode === "durable_transactional_ledger_adapter_draft_no_migration_no_persistence_no_delivery", "gate da Fase 28 invalido");
expect(gate.requiredSourcePhase === 27 && gate.targetSlot.slotId === "repeatability_02" && gate.targetSlot.sampleOrdinal === 2, "fonte ou slot da Fase 28 invalido");
expect(gate.draftPolicy.migrationDraftOnly === true && gate.draftPolicy.supabaseCliAvailable === false && gate.draftPolicy.migrationFileCreated === false, "rascunho alegou promocao indevida");
expect(gate.databaseContract.privateSchema === "atlas_private" && gate.databaseContract.serviceRoleOnly === true && gate.databaseContract.appendOnlyAuditRequired === true, "contrato privado ou auditoria incompletos");
expect(gate.databaseContract.rowLevelSecurityRequired === true && gate.databaseContract.forceRowLevelSecurityRequired === true && gate.databaseContract.rollbackMustRefuseNonEmptyLedger === true, "RLS ou rollback seguro incompletos");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");
expect(inspection.passed && inspection.assertions.length >= 40 && inspection.assertions.every((item) => item.passed), "auditoria estatica dos artefatos falhou");
expect(gate.artifacts.migrationDraft.startsWith("supabase/migration-drafts/") && !gate.artifacts.migrationDraft.startsWith("supabase/migrations/"), "rascunho entrou na fila oficial de migrations");
expect(migration.includes("security invoker") && !/security definer/i.test(migration), "RPC nao usa security invoker");
expect(migration.includes("on conflict do nothing") && migration.includes("meta_ledger_identity_collision"), "concorrencia ou colisao nao falham fechado");
expect(rollback.includes("rollback_refuses_non_empty_ledger") && !/drop schema/i.test(rollback), "rollback pode apagar dados ou schema compartilhado");
for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local", "createClient(", "supabase.from(", "supabase.rpc("]) {
  expect(!runner.includes(forbidden), `runner contem transporte, banco ou segredo: ${forbidden}`);
}
for (const marker of ["buildMetaPermitReservationRpcArgs", "prepareMetaPermitReservation", "ledger_identity_collision", "ledger_rpc_rejected"]) expect(adapter.includes(marker), `adaptador incompleto: ${marker}`);
for (const marker of ["ATLAS_PHASE27_ATOMIC_LEDGER_PREPARATION_FILE", "ATLAS_PHASE28_DURABLE_LEDGER_REQUEST_FILE", "ATLAS_PHASE28_DURABLE_LEDGER_PREPARATION_FILE", "databaseTouched: false", "migrationExecutionAllowed: false", "ledgerPersistenceAllowed: false"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);

if (failures.length) {
  console.error("META REPEATABILITY SAMPLE 02 DURABLE LEDGER: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`META REPEATABILITY SAMPLE 02 DURABLE LEDGER: aprovada — ${inspection.assertions.length} controles estaticos; migration permanece rascunho, banco intocado e permissao nao emitida.`);
