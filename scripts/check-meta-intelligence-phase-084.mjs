import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-review-resolution-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-review-resolution.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_REVIEW_RESOLUTION_PHASE_84.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "pending_resolution" && template.execution.memoryReinstated === false, "template restaura memoria automaticamente");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de resolucao incompletas");
for (const marker of ["validateMetaLearningReviewResolution", "resolution_proof_invalid", "revocation_not_executed", "reinstatement_or_external_change_observed", "meta_learning_review_resolution_valid_no_reinstatement", "selfTestMetaLearningReviewResolution"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["conclusão humana identificada", "não restaura memória automaticamente", "decisão explícita de revogação", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-review-resolution.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste de resolucao reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 84: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 84: aprovada — resolucao humana auditavel, sem restauracao automatica.");
