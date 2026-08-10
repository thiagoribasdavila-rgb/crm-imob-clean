import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-external-test-operator-gate-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-external-test-operator-gate.mjs", "utf8");
const doc = readFileSync("docs/META_EXTERNAL_TEST_OPERATOR_GATE_PHASE_65.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "pending_operator_confirmation" && template.execution.manuallyConfirmed === false, "template inicia confirmado");
expect(template.execution.dispatchEnabled === false && template.execution.productionAllowed === false, "template permite execucao");
for (const marker of ["validateExternalTestOperatorGate", "manual_confirmation_required", "short_execution_window_required", "single_test_event_required", "execution_controls_must_remain_blocked", "operator_gate_valid_external_test_command_still_separate"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["trinta minutos", "não liga o despacho", "Não há produção", "não chama Meta"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-external-test-operator-gate.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do operador reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 65: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 65: aprovada — confirmacao manual e janela curta protegendo o futuro ensaio unitario.");
