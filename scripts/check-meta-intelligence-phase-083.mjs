import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-learning-review-queue-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-learning-review-queue.mjs", "utf8");
const doc = readFileSync("docs/META_LEARNING_REVIEW_QUEUE_PHASE_83.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_prepared" && template.execution.taskCreated === false, "template cria tarefa automaticamente");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes da fila incompletas");
for (const marker of ["validateMetaLearningReviewQueue", "critical_memory_requires_urgent_review", "automatic_action_observed", "meta_learning_review_queue_valid_human_action_required", "selfTestMetaLearningReviewQueue"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["fila agregada", "prioridade urgente", "não cria tarefas", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-learning-review-queue.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da fila reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 83: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 83: aprovada — fila de revisao priorizada sem acao automatica.");
