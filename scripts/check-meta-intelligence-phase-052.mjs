import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const template = JSON.parse(readFileSync("config/fixtures/atlas-real-use-readiness-decision-template.json", "utf8"));
const code = readFileSync("scripts/preflight-atlas-real-use-readiness-decision.mjs", "utf8");
const doc = readFileSync("docs/REAL_USE_READINESS_DECISION_PHASE_52.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };

expect(template.status === "pending_evidence_review", "template de decisao foi aberto");
expect(template.execution.buildAllowed === false && template.execution.packageAllowed === false && template.execution.deploymentAllowed === false, "execucao foi liberada no template");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes sensiveis incompletas");
for (const marker of ["validateRealUseReadinessDecision", "readiness_decision_blocked", "isolated_staging_required", "human_release_authorization_missing", "execution_must_remain_blocked_until_release_gate", "sensitive_data_detected", "selfTestRealUseReadinessDecision"]) expect(code.includes(marker), `controle ausente: ${marker}`);
expect(doc.includes("não executa build") && doc.includes("não cria ZIP") && doc.includes("não publica"), "documentacao nao protege a release");
const test = spawnSync(process.execPath, ["scripts/preflight-atlas-real-use-readiness-decision.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 52: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 52: aprovada — decisao de prontidao rastreavel preparada, com gate humano e execucao ainda bloqueada.");
