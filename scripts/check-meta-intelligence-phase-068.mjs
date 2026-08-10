import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-external-test-observation-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-external-test-observation.mjs", "utf8");
const doc = readFileSync("docs/META_EXTERNAL_TEST_OBSERVATION_PHASE_68.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_observed" && template.execution.attemptCount === 0 && template.execution.externalCallObserved === false, "template indica teste observado");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes do observador incompletas");
for (const marker of ["validateExternalTestObservation", "single_execution_proof_missing", "unsafe_execution_observed", "human_follow_up_required", "external_test_observation_valid_human_review_required", "selfTestExternalTestObservation"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["bloqueia repetição", "produção, retry e promoção automática", "Não armazena payload", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-external-test-observation.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do observador reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 68: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 68: aprovada — observacao unitaria e revisao humana obrigatoria, sem retry ou promocao automatica.");
