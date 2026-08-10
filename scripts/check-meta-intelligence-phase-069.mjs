import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-external-test-human-review-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-external-test-human-review.mjs", "utf8");
const doc = readFileSync("docs/META_EXTERNAL_TEST_HUMAN_REVIEW_PHASE_69.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "pending_review" && template.execution.nextExternalCallAllowed === false, "template permite nova chamada");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes da revisao incompletas");
for (const marker of ["validateExternalTestHumanReview", "human_review_not_recorded", "execution_must_remain_blocked_after_review", "external_test_human_review_valid_analysis_only", "selfTestExternalTestHumanReview"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["revisão humana", "produção, retry ou promoção automática", "Não armazena payload", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-external-test-human-review.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da revisao humana reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 69: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 69: aprovada — decisao humana registrada para analise, sem liberar nova chamada ou producao.");
