import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-revalidation-request-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-revalidation-request.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_REVALIDATION_REQUEST_PHASE_85.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_requested" && template.execution.externalTestStarted === false, "template inicia teste externo");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de revalidacao incompletas");
for (const marker of ["validateMetaLearningRevalidationRequest", "fresh_governance_required", "reuse_or_external_execution_observed", "meta_learning_revalidation_request_valid_fresh_governance_required", "selfTestMetaLearningRevalidationRequest"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["nova proveniência e nova aprovação", "não podem ser reaproveitadas como atalho", "não inicia teste externo", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-revalidation-request.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da revalidacao reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 85: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 85: aprovada — revalidacao exige nova governanca e bloqueia reaproveitamento indevido.");
