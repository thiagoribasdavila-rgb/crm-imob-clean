import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-feedback-external-test-approval-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-feedback-external-test-approval.mjs", "utf8");
const doc = readFileSync("docs/META_EXTERNAL_TEST_APPROVAL_PHASE_64.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "pending" && template.approvals.director === null && template.approvals.security === null, "template inicia aprovado");
expect(Object.values(template.execution).every((value) => value === false), "execucao liberada no template");
for (const marker of ["validateFeedbackExternalTestApproval", "independent_approval_references_required", "approval_decision_binding_invalid", "isolated_staging_required", "execution_must_remain_blocked_until_external_operator_gate", "selfTestFeedbackExternalTestApproval"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["diretoria e segurança", "validade limitada", "execução continua bloqueada", "Produção, retry, promoção automática"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-feedback-external-test-approval.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste de aprovacoes reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 64: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 64: aprovada — dupla aprovacao vinculada e com prazo, sem liberar execucao automatica.");
