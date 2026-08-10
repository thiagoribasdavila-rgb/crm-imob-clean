import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-memory-promotion-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-memory-promotion.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_MEMORY_PROMOTION_PHASE_79.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_promoted" && template.execution.memoryWritten === false, "template promove memoria automaticamente");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes da memoria incompletas");
for (const marker of ["validateMetaLearningMemoryPromotion", "human_promotion_proof_invalid", "memory_scope_or_expiry_invalid", "unapproved_memory_written", "meta_learning_memory_promotion_valid_internal_analysis_only", "selfTestMetaLearningMemoryPromotion"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["pessoa identificada decide promovê-lo", "análise interna", "pode ser revogado", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-memory-promotion.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da memoria reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 79: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 79: aprovada — memoria analitica com promocao humana, validade e revogacao.");
