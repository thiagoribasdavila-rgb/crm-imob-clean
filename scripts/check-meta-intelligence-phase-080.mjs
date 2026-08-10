import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-memory-revocation-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-memory-revocation.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_MEMORY_REVOCATION_PHASE_80.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_evaluated" && template.decision.usageState === "blocked_pending_review", "template permite uso antecipado");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de revogacao incompletas");
for (const marker of ["validateMetaLearningMemoryRevocation", "invalid_memory_must_be_blocked", "revocation_must_be_final", "memory_or_external_use_observed", "meta_learning_memory_revocation_valid_review_required", "selfTestMetaLearningMemoryRevocation"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["proveniência, vencimento e pedido de revogação", "bloqueia o uso até revisão humana", "revogação encerra o uso imediatamente", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-memory-revocation.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste de revogacao reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 80: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 80: aprovada — memoria vencida ou revogada nao participa de recomendacoes.");
