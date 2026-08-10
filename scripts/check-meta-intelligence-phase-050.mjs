import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(file, "utf8");
const phase = JSON.parse(read("config/meta-intelligence-phase-050-real-use-readiness.json"));
const phase45 = JSON.parse(read("config/meta-intelligence-phase-045.json"));
const release = JSON.parse(read("config/atlas-ai-os-release-gates.json"));
const report = read("docs/META_PHASES_046_050_REAL_USE_READINESS.md");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(phase.phase === 50 && phase.safeToApply === false && phase.status === "real_use_homologation_blocked_by_external_evidence", "estado da Fase 50 invalido");
expect(JSON.stringify(phase.sourcePhases) === JSON.stringify([45, 46, 47, 48, 49]), "cadeia 45-49 invalida");
expect(Object.values(phase.requiredExternalEvidence).every((value) => value === false), "evidencia externa foi alegada sem homologacao");
expect(Object.values(phase.prohibited).every((value) => value === true), "operacao real foi liberada indevidamente");
expect(phase45.safeToApply === false && phase45.environmentAudit.databaseTouched === false && phase45.environmentAudit.stagingTouched === false && phase45.environmentAudit.productionTouched === false && phase45.environmentAudit.metaTouched === false && phase45.environmentAudit.buildExecuted === false, "baseline da Fase 45 nao permanece bloqueado");
expect(release.approved === false && release.status === "blocked" && release.localBuildsRequired === 1 && Object.values(release.gates).some((value) => value === false), "release foi promovido sem evidencia");
for (const marker of ["Fase 46", "Fase 47", "Fase 48", "Fase 49", "Fase 50", "commit aprovado", "exatamente uma vez", "não tocados", "bloqueados"]) expect(report.includes(marker), `documentacao ausente: ${marker}`);
const previous = spawnSync(process.execPath, ["scripts/check-meta-intelligence-phase-045.mjs"], { encoding: "utf8" });
expect(previous.status === 0, "baseline da Fase 45 reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fases 46-50: REPROVADAS"); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
console.log("META INTELLIGENCE Fases 46-50: aprovadas — contrato de entrada em uso real preparado; execução, build e ZIP de release seguem bloqueados até evidências independentes.");
