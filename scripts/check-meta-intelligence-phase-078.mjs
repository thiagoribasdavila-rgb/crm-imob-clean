import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-experiment-result-comparison-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-experiment-result-comparison.mjs", "utf8");
const doc = readFileSync("docs/META_EXPERIMENT_RESULT_COMPARISON_PHASE_78.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_compared" && template.execution.followUpExperimentCreated === false, "template cria novo experimento");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de comparacao incompletas");
for (const marker of ["validateMetaExperimentResultComparison", "inconclusive_result_must_remain_inconclusive", "stop_or_human_review_missing", "automatic_follow_up_or_external_change_observed", "meta_experiment_result_comparison_valid_human_review_required", "selfTestMetaExperimentResultComparison"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["métrica agregada", "Resultado inconclusivo continua inconclusivo", "revisão humana", "dados de clientes em nível individual"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-experiment-result-comparison.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da comparacao reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 78: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 78: aprovada — comparacao agregada preserva incerteza e exige revisao humana.");
