import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-confidence-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-confidence.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_CONFIDENCE_PHASE_72.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_scored" && template.decision.recommendationMode === "monitor_only", "template permite recomendacao antecipada");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de confianca incompletas");
for (const marker of ["validateMetaLearningConfidence", "contradiction_requires_monitoring", "weak_evidence_must_not_be_recommended", "external_change_observed", "meta_learning_confidence_valid_human_review_required", "selfTestMetaLearningConfidence"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["Evidência insuficiente ou vencida não vira recomendação", "modo de monitoramento", "aprovação humana", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-confidence.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste de confianca reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 72: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 72: aprovada — regua de confianca impede recomendacoes sem evidencia suficiente.");
