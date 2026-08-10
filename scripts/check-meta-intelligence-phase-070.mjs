import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-external-test-learning-capsule-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-external-test-learning-capsule.mjs", "utf8");
const doc = readFileSync("docs/META_EXTERNAL_TEST_LEARNING_CAPSULE_PHASE_70.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_created" && template.execution.campaignChanged === false && template.execution.metaEventSent === false, "template permite acao externa");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes da capsula incompletas");
for (const marker of ["validateExternalTestLearningCapsule", "reviewed_summary_not_ready", "human_controlled_recommendation_required", "external_or_automatic_change_observed", "external_test_learning_capsule_valid_human_approval_required", "selfTestExternalTestLearningCapsule"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["cápsula mínima", "não altera campanhas, públicos, eventos da Meta ou produção", "aprovação humana", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-external-test-learning-capsule.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da capsula reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 70: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 70: aprovada — aprendizado resumido preparado, sem alterar Meta, campanhas ou producao.");
