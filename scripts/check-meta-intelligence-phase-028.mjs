import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-028.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.durableLedgerGate));
const requestTemplate = JSON.parse(read(config.requestTemplate));
const preparationTemplate = JSON.parse(read(config.preparationTemplate));
const adapter = read(config.ledgerAdapter);
const migration = read(config.migrationDraft);
const rollback = read(config.rollbackDraft);
const preflight = read(config.preflight);
const runner = read(config.runner);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 28 && config.mode === "sample_02_durable_transactional_ledger_adapter_draft", "configuracao da Fase 28 invalida");
expect(config.status === "durable_adapter_and_reversible_migration_drafted_execution_gate_closed" && config.safeToApply === false, "Fase 28 abriu gate indevido");
expect(previous.phase === 27 && previous.status === "atomic_ledger_contract_ready_persistence_gate_closed", "baseline da Fase 27 invalido");
expect(config.environmentAudit.supabaseCliDetected === false && config.environmentAudit.migrationPromoted === false && config.environmentAudit.migrationExecuted === false, "CLI, promocao ou migration alegados indevidamente");
expect(config.releaseGate.localAdapterContractPassed === true && config.releaseGate.migrationDraftStaticAuditPassed === true && config.releaseGate.rollbackDraftStaticAuditPassed === true, "contrato local nao aprovado");
expect(config.releaseGate.migrationExecutionAllowed === false && config.releaseGate.ledgerPersistenceAllowed === false && config.releaseGate.permitIssuanceAllowed === false && config.releaseGate.productionReady === false, "migration, persistencia, emissao ou producao liberadas");
expect(config.governance.privateSchemaRequired === true && config.governance.serviceRoleOnly === true && config.governance.securityInvokerRequired === true && config.governance.rollbackRefusesNonEmptyLedger === true, "governanca do banco incompleta");
expect(config.governance.databaseMutation === false && config.governance.buildExecuted === false && config.governance.realMetaEventDelivery === false && config.governance.testMetaEventDelivery === false, "banco, build ou entrega executados");
expect(gate.draftPolicy.migrationDraftOnly === true && Object.values(gate.releaseGate).every((value) => value === false), "gate do rascunho aberto");
expect(requestTemplate.operation.connectDatabase === false && requestTemplate.operation.executeMigration === false && requestTemplate.operation.persistReservation === false, "template solicitou banco ou persistencia");
expect(preparationTemplate.lifecycle.migrationExecuted === false && preparationTemplate.lifecycle.reservationPersisted === false && preparationTemplate.releaseGates.durableAdapterDraftPrepared === false, "template alegou execucao");
expect(config.migrationDraft.startsWith("supabase/migration-drafts/") && !config.migrationDraft.startsWith("supabase/migrations/"), "rascunho foi promovido sem CLI");
expect(adapter.includes("prepareMetaPermitReservation") && adapter.includes("ledger_rpc_rejected"), "adaptador nao falha fechado");
expect(migration.includes("force row level security") && migration.includes("security invoker") && migration.includes("on conflict do nothing") && !/security definer/i.test(migration), "migration sem RLS, invoker ou atomicidade");
expect(rollback.includes("rollback_refuses_non_empty_ledger") && !/drop schema/i.test(rollback), "rollback inseguro");
for (const [script, marker] of [
  ["meta:phase-028:audit", "audit-meta-repeatability-sample-02-durable-ledger.mjs"],
  ["meta:phase-028:preflight", "preflight-meta-repeatability-sample-02-durable-ledger.mjs"],
  ["meta:phase-028:prepare", "run-meta-repeatability-sample-02-durable-ledger.mjs"],
  ["meta:phase-028:check", "check-meta-intelligence-phase-028.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of ["inspectDurableLedgerDrafts", "validateDurableLedgerRequest", "createDurableLedgerPreparation", "validatePhase28Preparation", "adapter_rejects_identity_collision", "migration_execution_forbidden"]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of ["ATLAS_PHASE27_ATOMIC_LEDGER_PREPARATION_FILE", "ATLAS_PHASE28_DURABLE_LEDGER_REQUEST_FILE", "ATLAS_PHASE28_DURABLE_LEDGER_PREPARATION_FILE"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META REPEATABILITY SAMPLE 02 DURABLE LEDGER") && audit.includes("supabase.rpc("), "auditoria estatica incompleta");
for (const marker of ["Fase 28/100", "schema privado", "46 verificações", "migration: **não promovida e não executada**", "build: **não executado**", "produção: **bloqueada**"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1200)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-durable-ledger.mjs"], "auditoria do ledger duravel");
run(["scripts/preflight-meta-repeatability-sample-02-durable-ledger.mjs", "--self-test"], "autoteste do ledger duravel");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-durable-ledger.mjs"], {
  cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 28: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 28: aprovada — adaptador transacional e rollback seguros preparados; migration, persistencia, permissao, entrega, producao e build continuam bloqueados.");
