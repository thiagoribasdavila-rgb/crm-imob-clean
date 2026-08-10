import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-029.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.rehearsalGate));
const evidenceTemplate = JSON.parse(read(config.evidenceTemplate));
const migration = read(config.officialMigration);
const draft = read(config.sourceDraft);
const rollback = read(config.rollbackDraft);
const preflight = read(config.preflight);
const runner = read(config.runner);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
void draft;

expect(config.phase === 29 && config.mode === "sample_02_official_migration_promotion_and_guarded_rehearsal", "configuracao da Fase 29 invalida");
expect(config.status === "official_migration_promoted_rehearsal_runtime_blocked" && config.safeToApply === false, "Fase 29 abriu gate indevido");
expect(previous.phase === 28 && previous.status === "durable_adapter_and_reversible_migration_drafted_execution_gate_closed", "baseline da Fase 28 invalido");
expect(config.toolAudit.supabaseCliVerifiedVersion === "2.109.1" && config.toolAudit.officialMigrationCreatedByCli === true, "promocao pela CLI oficial nao comprovada");
expect(config.environmentAudit.officialMigrationPromoted === true && config.environmentAudit.migrationExecuted === false && config.environmentAudit.databaseMutationExecuted === false, "estado da migration inconsistente");
expect(config.releaseGate.officialMigrationPromoted === true && config.releaseGate.staticParityApproved === true && config.releaseGate.guardedRunnerPrepared === true, "artefatos de promocao incompletos");
expect(config.releaseGate.isolatedRuntimeAvailable === false && config.releaseGate.isolatedRehearsalExecuted === false && config.releaseGate.ledgerPersistenceAllowed === false, "runtime ou persistencia liberados indevidamente");
expect(config.governance.stagingCloneOnly === true && config.governance.linkedProjectForbidden === true && config.governance.productionIdentityComparisonRequired === true, "governanca do alvo incompleta");
expect(config.governance.databaseMutation === false && config.governance.productionAccess === false && config.governance.realMetaEventDelivery === false && config.governance.buildExecuted === false, "banco, producao, Meta ou build alegados");
expect(/^supabase\/migration-rehearsals\/\d{14}_phase_029_meta_permit_atomic_ledger\.sql$/.test(config.officialMigration), "ensaio fora do diretorio governado");
expect(migration.includes("atlas_meta_ledger_staging_clone_only") && migration.includes("force row level security") && migration.includes("security invoker"), "migration sem travas de ambiente, RLS ou invoker");
expect(migration.includes("on conflict do nothing") && migration.includes("meta_ledger_identity_collision") && !/security definer/i.test(migration), "atomicidade ou privilegio da migration invalido");
expect(rollback.includes("rollback_refuses_non_empty_ledger") && !/drop schema/i.test(rollback), "rollback inseguro");
expect(gate.environment === "staging_clone" && gate.targetIdentity.directDatabaseUrlRequired === true && gate.targetIdentity.productionIdentityMustDiffer === true, "gate do clone isolado incompleto");
expect(gate.allowedMutation.persistPermitReservation === false && Object.values(gate.prohibitedActions).every((value) => value === true), "gate permitiu acao proibida");
expect(evidenceTemplate.status === "not_run" && evidenceTemplate.rehearsal.migrationApplied === false && Object.values(evidenceTemplate.releaseGates).every((value) => value === false), "template de evidencia alegou execucao");
for (const [script, marker] of [
  ["meta:phase-029:audit", "audit-meta-repeatability-sample-02-migration-rehearsal.mjs"],
  ["meta:phase-029:preflight", "preflight-meta-repeatability-sample-02-migration-rehearsal.mjs"],
  ["meta:phase-029:rehearsal", "run-meta-repeatability-sample-02-migration-rehearsal.mjs"],
  ["meta:phase-029:check", "check-meta-intelligence-phase-029.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of ["PHASE29_APPROVAL", "production_identity_collision", "prohibited_action_requested", "selfTestPhase29Preflight"]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of ["ATLAS_PHASE29_ISOLATED_DB_URL", "fileURLToPath", "migrationApplied", "rollbackAttempted", "finalLedgerObjectsAbsent", "hostFingerprint"]) expect(runner.includes(marker), `runner incompleto: ${marker}`);
expect(audit.includes("structuralParitySha256") && audit.includes("databaseTouched: false") && audit.includes("networkTouched: false"), "auditoria estatica incompleta");
for (const marker of ["Fase 29/100", "migration oficial", "não executada", "banco/produção/Meta: **não tocados**", "build: **não executado**"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1200)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-migration-rehearsal.mjs"], "auditoria da migration promovida");
run(["scripts/preflight-meta-repeatability-sample-02-migration-rehearsal.mjs", "--self-test"], "autoteste do alvo isolado");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-migration-rehearsal.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem clone autorizado");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 29: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 29: aprovada — migration de ensaio isolada fora da cadeia oficial; banco, ledger persistente, permissao, entrega Meta, producao e build continuam bloqueados.");
