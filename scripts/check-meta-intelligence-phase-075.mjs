import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-experiment-plan-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-experiment-plan.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_EXPERIMENT_PLAN_PHASE_75.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_prepared" && template.execution.externalTestAllowed === false, "template permite execucao precoce");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes do plano incompletas");
for (const marker of ["validateMetaLearningExperimentPlan", "hypothesis_invalid", "measurement_contract_invalid", "execution_must_remain_blocked", "meta_learning_experiment_plan_valid_separate_execution_approval_required", "selfTestMetaLearningExperimentPlan"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["hipótese explícita", "métrica, classe de amostra, janela e critério de parada", "não libera teste externo", "dado de cliente"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-experiment-plan.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do plano reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 75: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 75: aprovada — plano de experimento mensuravel, sem execucao automatica.");
