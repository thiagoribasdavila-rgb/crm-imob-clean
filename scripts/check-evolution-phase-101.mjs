import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const phase = json("config/evolution-phase-101-homologation-package.json");
const program = json("config/evolution-program-3000.json");
const gates = json("config/atlas-ai-os-release-gates.json");
const report = read("docs/EVOLUTION_PHASE_101_HOMOLOGATION_PACKAGE.md");
const ignore = read(".gitignore");
const packageScript = read("scripts/package-hostinger.mjs");

const checks = [
  ["Fase 101 limita-se à homologação", phase.phase === 101 && phase.status === "completed" && phase.scope === "homologation-package-only" && phase.productionApproved === false],
  ["Gate não foi contornado", phase.releaseGateOverridden === false && gates.status === "blocked" && gates.approved === false],
  ["Banco e autenticação não foram mutados", phase.liveDatabaseMutation === false && phase.liveMigrationApplied === false],
  ["Compatibilidade ao vivo foi comprovada", phase.evidence.liveCompatibilityAdapters === "passed-read-only-17150-leads-2-tasks-1-project"],
  ["Smoke bloqueado permanece transparente", phase.evidence.authenticatedSmoke === "blocked-missing-dedicated-test-account"],
  ["Pacote exclui segredos e clientes", phase.package.secretsIncluded === false && phase.package.customerDataIncluded === false],
  ["Gates restantes estão explícitos", phase.remainingReleaseGates.includes("run-authenticated-https-smoke-after-upload") && phase.remainingReleaseGates.includes("record-explicit-production-approval")],
  ["Programa avançou", program.currentPhase >= 101],
  ["Saídas privadas são ignoradas", ignore.includes("/outputs/") && ignore.includes("/tmp/")],
  ["Empacotador bloqueia conteúdo privado", packageScript.includes("privateDataIncluded: false") && packageScript.includes("tmp|outputs|dist")],
  ["Relatório diferencia homologação e produção", report.includes("sem declarar produção aprovada") && report.includes("smoke HTTPS autenticado") && report.includes("bases privadas")],
];

for (const [label, passed] of checks) {
  console.log(`${passed ? "✓" : "✗"} ${label}`);
  if (!passed) process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 101 verificada: pacote de homologação permitido; release de produção continua bloqueado.");
