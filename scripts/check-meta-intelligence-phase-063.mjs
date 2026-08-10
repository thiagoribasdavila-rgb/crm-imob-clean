import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-feedback-decision-card-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-feedback-decision-card.mjs", "utf8");
const doc = readFileSync("docs/META_FEEDBACK_DECISION_CARD_PHASE_63.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_prepared" && template.recommendation.action === "hold", "card template inicia com acao insegura");
expect(Object.values(template.execution).every((value) => value === false), "execucao liberada no card");
for (const marker of ["validateFeedbackDecisionCard", "independent_human_approvals_required", "explanation_reason_codes_invalid", "unsafe_recommendation_action", "execution_must_remain_blocked", "feedback_decision_card_valid_external_test_still_requires_independent_approval"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["Diretoria e segurança", "não expõe dados do cliente", "não ajusta campanha", "não chama Meta"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-feedback-decision-card.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do card reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 63: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 63: aprovada — decisao explicavel preparada para aprovacao humana independente, sem despacho ou alteracao de campanha.");
