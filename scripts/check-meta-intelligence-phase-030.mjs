import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-030.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.runtimeGate));
const template = JSON.parse(read(config.evidenceTemplate));
const compose = read(config.composeFile);
const migration = read(config.officialMigration);
const baseline = read(config.baselineSql);
const verify = read(config.verificationSql);
const runner = read(config.runner);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 30 && config.mode === "sample_02_local_ephemeral_supabase_runtime_rehearsal", "configuracao da Fase 30 invalida");
expect(config.status === "local_ephemeral_runtime_prepared_execution_blocked" && config.safeToApply === false, "Fase 30 abriu gate indevido");
expect(previous.phase === 29 && previous.status === "official_migration_promoted_rehearsal_runtime_blocked", "baseline da Fase 29 invalido");
expect(config.toolAudit.supabaseCliPinnedVersion === "2.109.1" && config.toolAudit.supabasePostgresImage === "supabase/postgres:15.14.1.149", "runtime Supabase nao fixado");
expect(config.environmentAudit.composePrepared === true && config.environmentAudit.localhostBindingEnforced === true, "ambiente local incompleto");
expect(config.environmentAudit.localRehearsalExecuted === false && config.environmentAudit.databaseMutationExecuted === false && config.environmentAudit.metaMutationExecuted === false, "execucao inexistente foi alegada");
expect(config.releaseGate.ephemeralRunnerPrepared === true && config.releaseGate.isolatedRuntimeAvailable === false && config.releaseGate.nextPhaseAllowed === false, "gate de runtime incorreto");
expect(config.governance.localhostOnly === true && config.governance.volumeDestructionRequired === true, "isolamento ou limpeza ausente");
expect(config.governance.remoteDatabaseAccess === false && config.governance.productionAccess === false && config.governance.permitReservation === false && config.governance.realMetaEventDelivery === false && config.governance.buildExecuted === false, "acao remota, permissao, Meta ou build liberados");
expect(gate.runtime.host === "127.0.0.1" && gate.runtime.remoteTarget === false && gate.runtime.destroyVolumesAfterRun === true, "gate local invalido");
expect(compose.includes('"127.0.0.1:55432:5432"') && compose.includes("supabase/postgres:15.14.1.149"), "Compose nao esta isolado ou fixado");
for (const marker of ["meta_permit_ledger_actor_idx", "meta_permit_ledger_audit_ledger_idx", "meta_permit_ledger_audit_actor_idx"]) expect(migration.includes(marker), `indice ausente: ${marker}`);
expect(baseline.includes("phase30_local_ephemeral_only") && verify.includes("phase30_unexpected_permit_record"), "SQL de ensaio incompleto");
expect(template.status === "not_run" && template.rehearsal.permitReservationExecuted === false && Object.values(template.releaseGates).every((value) => value === false), "template alegou execucao");
for (const [script, marker] of [
  ["meta:phase-030:audit", "audit-meta-repeatability-sample-02-local-runtime.mjs"],
  ["meta:phase-030:preflight", "preflight-meta-repeatability-sample-02-local-runtime.mjs"],
  ["meta:phase-030:rehearsal", "run-meta-repeatability-sample-02-local-runtime.mjs"],
  ["meta:phase-030:check", "check-meta-intelligence-phase-030.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of ["PHASE30_APPROVAL", "pinned_supabase_postgres_image_required", "volume_destruction_required", "selfTestPhase30Preflight"]) expect(read(config.preflight).includes(marker), `preflight incompleto: ${marker}`);
for (const marker of ["ATLAS_PHASE30_HUMAN_APPROVAL", "isolated_runtime_unavailable", "rollbackAttempted", "finalLedgerObjectsAbsent", '"down", "--volumes", "--remove-orphans"']) expect(runner.includes(marker), `runner incompleto: ${marker}`);
expect(workflow.includes("workflow_dispatch") && workflow.includes("EXECUTE_PHASE30_LOCAL_EPHEMERAL_ONLY") && !workflow.includes("npm run build"), "workflow manual invalido");
for (const marker of ["Fase 30/100", "local, descartável e isolado", "não foi executado", "banco/produção/Meta: **não tocados**", "build: **não executado**"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1200)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-local-runtime.mjs"], "auditoria do runtime local");
run(["scripts/preflight-meta-repeatability-sample-02-local-runtime.mjs", "--self-test"], "autoteste do runtime local");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-local-runtime.mjs"], {
  cwd: root,
  env: {
    PATH: "",
    ATLAS_PHASE30_HUMAN_APPROVAL: "EXECUTE_PHASE30_LOCAL_EPHEMERAL_ONLY"
  },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("isolated_runtime_unavailable"), "runner nao falhou fechado sem Docker");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 30: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 30: aprovada — runtime Supabase local efemero preparado com migration, RLS, indices, rollback e destruicao obrigatoria; execucao, permissao, Meta, producao e build continuam bloqueados.");
