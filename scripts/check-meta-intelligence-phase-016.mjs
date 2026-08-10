import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-016.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const evidence = JSON.parse(read(config.evidenceTemplate));
const packageJson = JSON.parse(read("package.json"));
const runner = read(config.reconciliationRunner);
const preflight = read(config.evidencePreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 16 && config.mode === "sanitized_isolated_evidence_reconciliation", "configuracao da Fase 16 invalida");
expect(config.status === "reconciliation_pipeline_ready" && config.safeToApply === false, "Fase 16 liberou aplicacao indevida");
expect(previous.phase === 15 && previous.status === "isolated_rehearsal_automation_ready", "baseline da Fase 15 invalido");
expect(config.environmentAudit.remoteCallsExecuted === false && config.environmentAudit.isolatedCredentialsDetected === false, "auditoria de ambiente divergente");
expect(config.evidenceControls.sanitizedJsonOnly && config.evidenceControls.rawLogsPersisted === false, "sanitizacao da evidencia incompleta");
expect(config.evidenceControls.archiveOptInRequired && config.evidenceControls.archiveOnFailure === false, "arquivo pode ocorrer sem aprovacao");
expect(config.evidenceControls.archiveDirectoryMode === "0700" && config.evidenceControls.archiveFileMode === "0600", "permissoes de arquivo divergentes");
expect(config.evidenceControls.zeroResidualRequiredForArchive, "arquivo nao exige limpeza zero");
expect(config.reconciliationContract.organizations === 2 && config.reconciliationContract.authUsers === 9, "contrato de tenant/Auth divergente");
expect(config.reconciliationContract.profiles === 9 && config.reconciliationContract.leads === 4, "contrato de perfil/lead divergente");
expect(config.reconciliationContract.minimumScenarios === 15 && config.reconciliationContract.zeroDriftRequired, "cobertura ou deriva divergente");
expect(config.releaseGate.phase15AutomationReady && config.releaseGate.phase16StaticAuditPassed, "gates locais incompletos");
expect(config.releaseGate.isolatedCloneExecuted === false && config.releaseGate.sanitizedEvidenceArchived === false, "execucao remota foi alegada sem branch");
expect(config.releaseGate.productionReady === false && config.releaseGate.deploymentReady === false, "producao liberada indevidamente");
expect(config.governance.databaseMutation === false && config.governance.productionAccess === false, "banco publicado nao pode ser alterado");
expect(config.governance.realMetaEventDelivery === false && config.governance.campaignMutation === false, "Meta nao pode ser alterada");
expect(config.governance.buildExecuted === false, "build nao deve rodar nesta fase");

for (const [script, marker] of [
  ["meta:phase-016:audit", "audit-meta-auth-reconciliation.mjs"],
  ["meta:phase-016:reconcile", "run-meta-auth-evidence-reconciliation.mjs"],
  ["meta:phase-016:preflight", "preflight-meta-auth-reconciliation.mjs"],
  ["meta:phase-016:check", "check-meta-intelligence-phase-016.mjs"],
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);

for (const marker of [
  "run-meta-auth-isolated-rehearsal.mjs",
  "validateIsolatedRehearsalEvidence",
  "validateMetaAuthReconciliationEvidence",
  "ATLAS_AUTH_TEST_ARCHIVE_SANITIZED_EVIDENCE",
  "zeroResidual",
  "sha256",
  "mode: 0o700",
  "mode: 0o600",
  "productionAllowed: false",
]) expect(runner.includes(marker), `executor sem contrato: ${marker}`);

expect(preflight.includes("validateMetaAuthReconciliationEvidence") && preflight.includes("forbidden_material_detected"), "preflight nao protege material sensivel");
expect(preflight.includes("unresolved_reconciliation_drift") && preflight.includes("residual_inventory_detected"), "preflight omite deriva ou residuos");
expect(audit.includes("evidencia sanitizada") && audit.includes("limpeza zero"), "auditoria estatica incompleta");
expect(evidence.phase === 16 && evidence.passed === false && evidence.remoteExecutionPerformed === false, "template foi marcado como executado");
expect(evidence.containsSecrets === false && evidence.containsPersonalData === false && evidence.rawLogsPersisted === false, "template de evidencia inseguro");

for (const marker of [
  "Fase 16/100",
  "branch Supabase isolado",
  "hash SHA-256",
  "contagem residual zero",
  "Evidência reprovada nunca é arquivada",
  "produção: bloqueada",
  "eventos Meta reais: bloqueados",
  "build: não executado",
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 500)}`);
};

run(["scripts/audit-meta-auth-reconciliation.mjs"], "auditoria da reconciliacao");
run(["scripts/preflight-meta-auth-reconciliation.mjs", "--self-test"], "autoteste do preflight");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 16: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 16: aprovada — evidencia sanitizada e reconciliacao prontas; branch, producao, Meta e build continuam bloqueados.");
