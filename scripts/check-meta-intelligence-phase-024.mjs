import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-024.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.authorizationGate));
const requestTemplate = JSON.parse(read(config.requestTemplate));
const draftTemplate = JSON.parse(read(config.draftTemplate));
const runner = read(config.authorizationRunner);
const preflight = read(config.authorizationPreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 24 && config.mode === "disposable_sample_02_authorization_draft", "configuracao da Fase 24 invalida");
expect(config.status === "authorization_draft_ready_activation_gate_closed" && config.safeToApply === false, "Fase 24 abriu gate indevido");
expect(previous.phase === 23 && previous.status === "repeatability_plan_ready_execution_gate_closed", "baseline da Fase 23 invalido");
expect(config.releaseGate.authorizationActivationAllowed === false && config.releaseGate.manualObservationAllowed === false && config.releaseGate.productionReady === false, "ativacao, observacao ou producao liberadas");
expect(config.governance.maximumValidityMinutes === 30 && config.governance.singleUse === true && config.governance.fourIndependentRoles === true, "rascunho nao descartavel ou governanca incompleta");
expect(config.governance.rawRoleReferencesPersisted === false && config.governance.temporaryCodePersisted === false, "referencia bruta ou codigo persistido");
expect(config.governance.buildExecuted === false && config.governance.databaseMutation === false, "build ou banco executado");
expect(gate.targetSlot.slotId === "repeatability_02" && gate.humanGovernance.justInTimeReconfirmationRequired === true, "slot ou reconfirmacao invalida");
expect(gate.sourceSignalContract === "config/meta-validation-only-signal-contract.json", "contrato canonico de eventos ausente");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");
expect(requestTemplate.execution.authorizationActivated === false && draftTemplate.releaseGates.authorizationDraftPrepared === false, "template alegou autorizacao");

for (const [script, marker] of [
  ["meta:phase-024:audit", "audit-meta-repeatability-sample-02-authorization.mjs"],
  ["meta:phase-024:preflight", "preflight-meta-repeatability-sample-02-authorization.mjs"],
  ["meta:phase-024:draft", "run-meta-repeatability-sample-02-authorization.mjs"],
  ["meta:phase-024:check", "check-meta-intelligence-phase-024.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "validateAuthorizationRequest", "createAuthorizationDraft", "validatePhase24Draft",
  "draft_not_activation", "four_distinct_role_hashes", "draft_activation_blocked",
  "raw_references_not_persisted", "baseline_event_reuse_blocked",
  "draft_event_name_must_be_canonical"
]) expect(preflight.includes(marker), `preflight sem contrato: ${marker}`);
for (const marker of ["ATLAS_PHASE23_REPEATABILITY_PLAN_FILE", "ATLAS_PHASE24_AUTHORIZATION_REQUEST_FILE", "ATLAS_PHASE24_AUTHORIZATION_DRAFT_FILE"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META REPEATABILITY SAMPLE 02 AUTHORIZATION") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of [
  "Fase 24/100", "O rascunho não ativa autorização", "validade máxima de 30 minutos",
  "rascunho oficial: **não gerado**", "build: **não executado**", "produção: **bloqueada**"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-authorization.mjs"], "auditoria da autorizacao");
run(["scripts/preflight-meta-repeatability-sample-02-authorization.mjs", "--self-test"], "autoteste da autorizacao");

const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-authorization.mjs"], {
  cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 24: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 24: aprovada — rascunho descartavel pronto; ativacao, observacao, entrega, producao e build continuam bloqueados.");
