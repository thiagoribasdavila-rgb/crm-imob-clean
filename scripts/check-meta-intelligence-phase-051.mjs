import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/atlas-real-use-evidence-intake-template.json", "utf8"));
const code = readFileSync("scripts/preflight-atlas-real-use-evidence-intake.mjs", "utf8");
const doc = readFileSync("docs/REAL_USE_EVIDENCE_INTAKE_PHASE_51.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_collected" && template.environment === "staging" && Object.values(template.evidence).every((value) => value === false), "template abriu evidencia");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes sensiveis incompletas");
for (const marker of ["validateRealUseEvidenceIntake", "evidence_intake_blocked", "isolated_staging_required", "sensitive_data_detected", "releaseReady: false", "buildAllowed: false", "packageAllowed: false", "selfTestRealUseEvidenceIntake"]) expect(code.includes(marker), `controle ausente: ${marker}`);
expect(doc.includes("não cria ZIP") && doc.includes("não executa build") && doc.includes("não lê segredos"), "documentacao insegura");
const test = spawnSync(process.execPath, ["scripts/preflight-atlas-real-use-evidence-intake.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 51: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 51: aprovada — intake de evidencias seguro preparado, sem acesso a dados, staging, producao, Meta, build ou ZIP.");
