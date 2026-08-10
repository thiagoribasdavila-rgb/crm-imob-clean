import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = (file) => readFileSync(`${root}/${file}`, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const required = ["config/fixtures/meta-cycle-closeout-template.json", "docs/META_INTELLIGENCE_100_PHASE_CLOSEOUT.md", "scripts/check-meta-intelligence-phase-050.mjs", "scripts/check-meta-intelligence-phase-099.mjs"];
for (const file of required) expect(existsSync(`${root}/${file}`), `arquivo ausente: ${file}`);

if (!failures.length) {
  const closeout = JSON.parse(read("config/fixtures/meta-cycle-closeout-template.json"));
  const report = read("docs/META_INTELLIGENCE_100_PHASE_CLOSEOUT.md");
  const phase50 = read("scripts/check-meta-intelligence-phase-050.mjs");
  expect(closeout.phase === 100 && closeout.status === "governance_cycle_complete_homologation_pending", "status de fechamento invalido");
  expect(closeout.coverage.individualChecks === 95 && JSON.stringify(closeout.coverage.groupedPhases) === JSON.stringify([46, 47, 48, 49]) && closeout.coverage.groupedByPhase === 50 && closeout.coverage.logicalPhasesCovered === 99, "cobertura de fases invalida");
  expect(phase50.includes("sourcePhases") && phase50.includes("[45, 46, 47, 48, 49]"), "cobertura agrupada 46-49 nao comprovada");
  expect(closeout.release.localControlsValidated === true, "controles locais nao consolidados");
  for (const field of ["realLeadRoundTripValidated", "metaSignalReceiptValidated", "rollbackValidated", "productionMonitoringValidated", "productionAllowed", "zipAllowed"]) expect(closeout.release[field] === false, `gate externo liberado indevidamente: ${field}`);
  expect(Object.values(closeout.externalState).every((value) => value === false), "estado externo alterado durante fechamento");
  for (const marker of ["95 verificações individuais", "Fases 46–49", "produção e ZIP de implantação permanecem bloqueados", "Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado", "uma única validação completa de build"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}

const anchors = [1, 45, 50, 67, 80, 90, 99].map((phase) => `scripts/check-meta-intelligence-phase-${String(phase).padStart(3, "0")}.mjs`);
for (const checker of anchors) {
  if (!existsSync(`${root}/${checker}`)) { failures.push(`checker ancora ausente: ${checker}`); continue; }
  const child = spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8", env: process.env });
  if (child.status !== 0) failures.push(`${checker}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1200)}`);
}

const security = spawnSync(process.execPath, ["scripts/check-secret-governance.mjs"], { cwd: root, encoding: "utf8", env: process.env });
if (security.status !== 0) failures.push(`governanca de segredos: ${(security.stderr || security.stdout || "falha").trim().slice(0, 1200)}`);

if (failures.length) { console.error("META INTELLIGENCE Fase 100: REPROVADA"); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 100: aprovada — ciclo de governanca concluido; homologacao externa, producao, build e ZIP permanecem bloqueados ate evidencia real.");
