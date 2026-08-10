import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { validateLeadRoundtripHomologationPlan } from "./preflight-lead-roundtrip-homologation.mjs";

const root = process.cwd();
const read = (file) => readFileSync(`${root}/${file}`, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const required = [
  "config/fixtures/lead-roundtrip-homologation-template.json",
  "docs/LEAD_ROUNDTRIP_HOMOLOGATION_STAGE_1.md",
  "scripts/preflight-lead-roundtrip-homologation.mjs",
  "scripts/check-meta-intelligence-phase-100.mjs"
];
for (const file of required) expect(existsSync(`${root}/${file}`), `arquivo ausente: ${file}`);

if (!failures.length) {
  const plan = JSON.parse(read("config/fixtures/lead-roundtrip-homologation-template.json"));
  const result = validateLeadRoundtripHomologationPlan(plan);
  const report = read("docs/LEAD_ROUNDTRIP_HOMOLOGATION_STAGE_1.md");
  expect(result.approved === true && result.routeStepCount === 8 && result.realExecutionAllowed === false, "contrato de ensaio inseguro ou incompleto");
  expect(Object.values(plan.evidence).every((value) => value === false), "evidencia real alegada sem execucao");
  expect(plan.invariants.singleBroker === true && plan.invariants.singleCopilot === true, "responsabilidade unica nao preservada");
  expect(plan.execution.databaseWritesAllowed === false && plan.execution.externalWritesAllowed === false && plan.signals.metaEmissionEnabled === false, "escrita externa liberada indevidamente");
  for (const marker of ["oito passos", "lead sintética", "um único corretor e um único Copilot", "não executa o ensaio real", "Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado", "build e o ZIP continuam bloqueados"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}

for (const command of [
  ["scripts/preflight-lead-roundtrip-homologation.mjs", "--self-test"],
  ["scripts/check-meta-intelligence-phase-100.mjs"],
  ["scripts/check-secret-governance.mjs"]
]) {
  const child = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8", env: process.env });
  if (child.status !== 0) failures.push(`${command[0]}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1200)}`);
}

if (failures.length) {
  console.error("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 1: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 1: aprovada — percurso comercial preparado com dados sintéticos; execução real e integrações externas permanecem bloqueadas.");
