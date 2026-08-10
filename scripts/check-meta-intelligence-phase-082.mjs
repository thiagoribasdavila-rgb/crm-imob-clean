import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-health-summary-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-health-summary.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_HEALTH_SUMMARY_PHASE_82.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_calculated" && template.display.aggregateOnly === true, "template permite exposicao individual");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de saude incompletas");
for (const marker of ["validateMetaLearningHealthSummary", "health_risk_requires_review_action", "external_or_memory_change_observed", "meta_learning_health_summary_valid_aggregate_only", "selfTestMetaLearningHealthSummary"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["leitura agregada", "válidos, estão perto de vencer, bloqueados ou revogados", "não mostra dados individuais", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-health-summary.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste de saude reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 82: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 82: aprovada — saude agregada e orientada a revisao humana.");
