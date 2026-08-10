import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-commercial-signal-quality-gate-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-commercial-signal-quality-gate.mjs", "utf8");
const doc = readFileSync("docs/META_COMMERCIAL_SIGNAL_QUALITY_PHASE_62.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_evaluated" && template.decision.eligibleForFeedback === false, "template inicia elegivel");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de decisao incompletas");
for (const marker of ["validateCommercialSignalQualityGate", "commercialEvidencePresent", "revenue_value_not_verified", "automatic_promotion_forbidden", "automaticBudgetChange", "commercial_signal_quality_gate_valid_feedback_dispatch_still_requires_external_gate"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["não classifica pessoas", "não muda orçamento", "feedback externo continua bloqueado", "não chama Meta"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-commercial-signal-quality-gate.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da qualidade reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 62: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 62: aprovada — apenas sinais comerciais comprovados tornam-se elegiveis, sem otimizacao automatica.");
