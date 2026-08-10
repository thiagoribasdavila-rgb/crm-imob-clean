import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-decision-brief-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-decision-brief.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_DECISION_BRIEF_PHASE_73.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_prepared" && template.execution.campaignChanged === false, "template permite alteracao precoce");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes do briefing incompletas");
for (const marker of ["validateMetaLearningDecisionBrief", "limitations_must_be_acknowledged", "low_confidence_requires_more_evidence", "external_change_observed", "meta_learning_decision_brief_valid_human_decision_required", "selfTestMetaLearningDecisionBrief"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["pergunta de decisão", "Confiança baixa exige mais evidência", "não altera campanhas, públicos, orçamento ou produção", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-decision-brief.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do briefing reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 73: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 73: aprovada — briefing de decisao claro, com limites e aprovacao humana obrigatoria.");
