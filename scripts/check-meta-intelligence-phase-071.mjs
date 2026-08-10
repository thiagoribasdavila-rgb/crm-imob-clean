import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-lineage-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-lineage.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_LINEAGE_PHASE_71.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_registered" && template.lineage.reuseScope === "analysis_only", "template permite uso indevido");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de proveniencia incompletas");
for (const marker of ["validateMetaLearningLineage", "lineage_not_registered", "reuse_scope_must_be_analysis_only", "external_change_observed", "meta_learning_lineage_valid_analysis_only", "selfTestMetaLearningLineage"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["permissão, evento, observação e revisão humana", "somente análise", "não altera campanhas, públicos, eventos da Meta ou produção", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-lineage.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste de proveniencia reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 71: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 71: aprovada — aprendizado com proveniencia e validade, restrito a analise.");
