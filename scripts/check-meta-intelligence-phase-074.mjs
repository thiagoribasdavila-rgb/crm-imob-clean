import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-experiment-decision-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-experiment-decision.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_EXPERIMENT_DECISION_PHASE_74.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "pending_director_decision" && template.execution.externalTestAllowed === false, "template permite teste externo");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de decisao incompletas");
for (const marker of ["validateMetaLearningExperimentDecision", "director_decision_not_recorded", "unapproved_plan_prepared", "execution_must_remain_blocked", "meta_learning_experiment_decision_valid_plan_only", "selfTestMetaLearningExperimentDecision"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["decisão da diretoria identificada", "somente do plano", "não habilita teste externo, campanha ou produção", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-experiment-decision.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da decisao reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 74: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 74: aprovada — plano de experimento exige decisao humana e permanece sem execucao externa.");
