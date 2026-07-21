import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-010.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const manifest = JSON.parse(read(config.reconciliationManifest));
const evidence = JSON.parse(read(config.executionEvidenceTemplate));
const bridge = read(config.bridgeMigrationEvidence);
const compatibility = config.compatibilityEvidence.map(read).join("\n");
const audit = read("scripts/audit-meta-schema-reconciliation.mjs");
const preflight = read("scripts/preflight-meta-schema-reconciliation.mjs");
const report = read("docs/META_SCHEMA_RECONCILIATION_MANIFEST.md");
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 10 && config.mode === "offline_schema_contract_reconciliation", "configuracao da Fase 10 invalida");
expect(config.status === "verified_with_blockers" && config.safeToApply === false, "fase deve permanecer bloqueada");
expect(previous.phase === 9 && previous.releaseGate.deploymentReady === false, "baseline da Fase 9 invalido");
expect(config.observedContract.bridgeExists === true && config.observedContract.bridgeAdditive === true, "ponte historica nao reconhecida");
expect(config.observedContract.scoreBackfillPreservesLegacy === false, "falha de score precisa permanecer visivel");
expect(config.observedContract.ownerDualWriteGuard === false && config.observedContract.projectDualWriteGuard === false, "dual-write nao comprovado foi liberado");
expect(config.observedContract.explicitDataApiGrants === false, "grants nao comprovados foram liberados");
expect(config.releaseGate.manifestDocumented === true && config.releaseGate.deploymentReady === false, "gate de release invalido");
expect(config.governance.databaseMutation === false && config.governance.migrationCreated === false, "fase nao pode modificar banco");
expect(config.governance.historicalBridgeModified === false && config.governance.buildExecuted === false, "governanca da fase invalida");

expect(manifest.productionExecutionAllowed === false, "manifesto liberou producao");
expect(manifest.historicalBridgeModificationAllowed === false && manifest.historicalBridgeReplayAllowed === false, "manifesto liberou ponte historica");
expect(manifest.correctedMigrationRequired === true && manifest.correctedMigration.created === false, "estado da migration corretiva invalido");
expect(manifest.correctedMigration.creationMethod.includes("supabase migration new"), "migration nao exige Supabase CLI");
expect(manifest.requiredEnvironment.kind === "staging_clone" && manifest.requiredEnvironment.isolatedFromProduction === true, "staging isolado nao e obrigatorio");
expect(manifest.orderedStages.length === 10, "manifesto deve ter dez etapas");
expect(manifest.orderedStages.every((item, index) => item.order === index + 1 && item.ready === false && Boolean(item.rollback)), "etapas devem estar ordenadas, bloqueadas e reversiveis");
expect(manifest.requiredContractTests.length === 13, "matriz deve ter treze testes contratuais");
expect(manifest.canonicalContracts.leads.score.creationOrder[0] === "add_nullable_score_without_default", "ordem segura do score invalida");
expect(manifest.canonicalContracts.profiles.role.unknownMapping.includes("block_migration"), "papel desconhecido nao foi bloqueado");
expect(manifest.canonicalContracts.profiles.hierarchy.automaticInferenceAllowed === false, "hierarquia automatica foi liberada");
expect(manifest.dataApiPrivileges.explicitGrantRequired === true && manifest.dataApiPrivileges.rlsStillRequired === true, "grants e RLS nao foram separados");
expect(manifest.forbiddenActions.includes("send_real_meta_event") && manifest.forbiddenActions.includes("mutate_campaign"), "governanca Meta incompleta");

expect(evidence.environment === "staging_clone_required" && evidence.run.status === "not_run", "template nao pode alegar execucao");
expect(evidence.run.historicalBridgeModified === false && evidence.run.historicalBridgeReplayAttempted === false, "template permite alterar/reproduzir ponte");
expect(evidence.contractTests.length === manifest.requiredContractTests.length, "template de testes incompleto");
expect(evidence.contractTests.every((item) => item.status === "not_run"), "template alegou teste executado");
expect(evidence.run.realEventDelivery === false && evidence.run.campaignMutation === false, "template permitiu mutacao externa");

expect(bridge.includes("add column if not exists score integer not null default 0"), "precondicao do defeito de score mudou");
expect(/set score\s*=\s*coalesce\(score\s*,\s*score_ia\s*,\s*0\)/i.test(bridge), "defeito de backfill nao detectado");
expect(/else\s+'broker'\s+end/i.test(bridge), "fallback inseguro de papel nao detectado");
expect(!/\b(grant|revoke)\b/i.test(bridge.replace(/--.*$/gm, "")), "ponte historica passou a conter grants; revisar manifesto");
expect(compatibility.includes('first(row, "assigned_to", "assigned_user_id")'), "adapter de responsavel ausente");
expect(compatibility.includes('first(row, "development_id", "project_id")'), "adapter de projeto ausente");
expect(compatibility.includes('first(row, "score", "score_ia")'), "adapter de score ausente");

for (const marker of [
  "production_target_forbidden",
  "corrected_cli_migration_missing",
  "historical_bridge_modified_forbidden",
  "historical_bridge_replay_forbidden",
  "score_backfill_not_verified",
  "owner_dual_write_not_verified",
  "project_dual_write_not_verified",
  "score_dual_write_not_verified",
  "unknown_role_mapping_not_approved",
  "reports_to_mapping_not_approved",
  "explicit_data_api_grants_not_verified",
  "rls_isolation_not_verified",
  "required_contract_test_missing",
  "--strict-ready",
  "--self-test"
]) expect(preflight.includes(marker), `preflight fail-closed incompleto: ${marker}`);

for (const marker of [
  "legacyScoreCanBeMaskedByDefaultZero",
  "unknownRoleFallsBackToBroker",
  "guardedDualWriteTriggerDetected",
  "explicitDataApiGrantsVersioned",
  "deploymentReady: false"
]) expect(audit.includes(marker), `auditoria offline incompleta: ${marker}`);

for (const marker of [
  "Fase 10/100",
  "score_ia",
  "assigned_user_id",
  "assigned_to",
  "Data API",
  "13 testes",
  "Fase 11/100"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

expect(packageJson.scripts["meta:phase-010:audit"]?.includes("audit-meta-schema-reconciliation.mjs"), "comando de auditoria ausente");
expect(packageJson.scripts["meta:phase-010:preflight"]?.includes("--self-test"), "comando de preflight ausente");
expect(packageJson.scripts["meta:phase-010:check"]?.includes("check-meta-intelligence-phase-010.mjs"), "gate da Fase 10 ausente");

const auditExecution = spawnSync(process.execPath, ["scripts/audit-meta-schema-reconciliation.mjs"], { cwd: root, encoding: "utf8" });
expect(auditExecution.status === 0, `auditoria executavel falhou: ${auditExecution.stderr || auditExecution.stdout}`);
if (auditExecution.status === 0) {
  const output = JSON.parse(auditExecution.stdout);
  expect(output.bridge.exists === true && output.bridge.replaySafe === false, "ponte historica foi liberada");
  expect(output.defects.legacyScoreCanBeMaskedByDefaultZero === true, "risco de score nao foi reconhecido");
  expect(output.defects.unknownRoleFallsBackToBroker === true, "risco de papel nao foi reconhecido");
  expect(output.defects.guardedDualWriteTriggerDetected === false, "dual-write nao comprovado foi reconhecido como pronto");
  expect(output.defects.explicitDataApiGrantsVersioned === false, "grants inexistentes foram reconhecidos");
  expect(output.manifest.requiredTestCount === 13 && output.readiness.deploymentReady === false, "readiness invalido");
}

const preflightExecution = spawnSync(process.execPath, ["scripts/preflight-meta-schema-reconciliation.mjs", "--self-test"], { cwd: root, encoding: "utf8" });
expect(preflightExecution.status === 0, `self-test fail-closed falhou: ${preflightExecution.stderr || preflightExecution.stdout}`);
if (preflightExecution.status === 0) {
  const output = JSON.parse(preflightExecution.stdout);
  expect(output.passed === true && output.tests.length >= 25, "matriz negativa incompleta");
}

if (failures.length) {
  console.error("META INTELLIGENCE Fase 10: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 10: aprovada — manifesto de reconciliacao documentado; migration, staging e producao continuam bloqueados.");
