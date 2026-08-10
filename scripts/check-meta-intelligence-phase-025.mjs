import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-025.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.confirmationGate));
const requestTemplate = JSON.parse(read(config.requestTemplate));
const receiptTemplate = JSON.parse(read(config.receiptTemplate));
const runner = read(config.confirmationRunner);
const preflight = read(config.confirmationPreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 25 && config.mode === "sample_02_just_in_time_reconfirmation_receipt", "configuracao da Fase 25 invalida");
expect(config.status === "jit_confirmation_ready_activation_gate_closed" && config.safeToApply === false, "Fase 25 abriu gate indevido");
expect(previous.phase === 24 && previous.status === "authorization_draft_ready_activation_gate_closed", "baseline da Fase 24 invalido");
expect(config.releaseGate.authorizationActivationAllowed === false && config.releaseGate.manualObservationAllowed === false && config.releaseGate.productionReady === false, "ativacao, observacao ou producao liberadas");
expect(config.governance.maximumValidityMinutes === 5 && config.governance.singleUse === true && config.governance.fourFreshIndependentRoles === true, "reconfirmacao nao efemera ou governanca incompleta");
expect(config.governance.draftReferenceReuseBlocked === true && config.governance.rawRoleReferencesPersisted === false, "reuso ou referencia bruta liberada");
expect(config.governance.buildExecuted === false && config.governance.databaseMutation === false, "build ou banco executado");
expect(gate.targetSlot.slotId === "repeatability_02" && gate.validity.mustExpireBeforeSourceDraft === true, "slot ou janela invalida");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");
expect(requestTemplate.execution.authorizationActivated === false && receiptTemplate.releaseGates.jitConfirmationReceiptPrepared === false, "template alegou ativacao");

for (const [script, marker] of [
  ["meta:phase-025:audit", "audit-meta-repeatability-sample-02-jit-confirmation.mjs"],
  ["meta:phase-025:preflight", "preflight-meta-repeatability-sample-02-jit-confirmation.mjs"],
  ["meta:phase-025:receipt", "run-meta-repeatability-sample-02-jit-confirmation.mjs"],
  ["meta:phase-025:check", "check-meta-intelligence-phase-025.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "validateJitConfirmationRequest", "createJitConfirmationReceipt", "validatePhase25Receipt",
  "receipt_not_activation", "draft_reference_reuse_blocked", "receipt_activation_blocked",
  "raw_reconfirmations_not_persisted"
]) expect(preflight.includes(marker), `preflight sem contrato: ${marker}`);
for (const marker of ["ATLAS_PHASE24_AUTHORIZATION_DRAFT_FILE", "ATLAS_PHASE25_JIT_CONFIRMATION_REQUEST_FILE", "ATLAS_PHASE25_JIT_CONFIRMATION_RECEIPT_FILE"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META REPEATABILITY SAMPLE 02 JIT CONFIRMATION") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of [
  "Fase 25/100", "não ativa autorização", "validade máxima de cinco minutos",
  "comprovante oficial: **não gerado**", "build: **não executado**", "produção: **bloqueada**"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-jit-confirmation.mjs"], "auditoria da reconfirmacao");
run(["scripts/preflight-meta-repeatability-sample-02-jit-confirmation.mjs", "--self-test"], "autoteste da reconfirmacao");

const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-jit-confirmation.mjs"], {
  cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 25: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 25: aprovada — reconfirmacao just-in-time pronta; ativacao, observacao, entrega, producao e build continuam bloqueados.");
