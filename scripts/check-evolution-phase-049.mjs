import fs from "node:fs";

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-049-efficient-continuous-delivery.json", "utf8"));
const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
const gates = JSON.parse(fs.readFileSync("config/atlas-ai-os-release-gates.json", "utf8"));
const checkpoints = JSON.parse(fs.readFileSync("config/evolution-zip-checkpoints.json", "utf8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const daily = fs.readFileSync("scripts/run-daily-phase-validation.mjs", "utf8");
const release = fs.readFileSync("scripts/release-atlas-ai-os.mjs", "utf8");
const packageScript = fs.readFileSync("scripts/package-evolution-checkpoint.mjs", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_049_EFFICIENT_CONTINUOUS_DELIVERY.md", "utf8");

const checks = [
  ["Fase 049 concluída sem tocar dados ou schema", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Evolução passa a ter horizonte contínuo", program.horizon === "continuous" && program.deliveryCadence === "one-phase-per-day"],
  ["Trabalho em andamento fica limitado a uma fase", program.workInProgressLimit === 1 && phase.deliveryContract.dailyWorkInProgressLimit === 1],
  ["Entrega diária não executa build", program.dailyValidation.build === false && phase.deliveryContract.dailyBuilds === 0 && daily.includes("buildExecuted: false") && !daily.includes('["run", "build"]')],
  ["Validação diária usa regressão direcionada", daily.includes("targetedChecks") && daily.includes("changedCode") && daily.includes("scan-secrets")],
  ["Comandos diário e pré-release não escondem build", !packageJson.scripts["daily:check"].includes("build") && !packageJson.scripts["release:prebuild-check"].includes("build")],
  ["Release exige exatamente um build", program.releasePolicy.localBuildsAtClose === 1 && gates.localBuildsRequired === 1 && phase.deliveryContract.releaseBuilds === 1],
  ["Orquestrador de release chama build uma vez", (release.match(/\["run", "build"\]/g) || []).length === 1],
  ["Gates bloqueiam release prematuro", gates.approved === false && gates.status === "blocked" && release.includes("Release bloqueado")],
  ["Pacotes recorrentes foram desativados", checkpoints.active === false && packageScript.includes("Pacotes recorrentes por fase foram encerrados")],
  ["Prioridade começa por operação e conversão", program.priorityOrder[0] === "P0-operational-blocker" && program.priorityOrder[1] === "P1-lead-conversion"],
  ["Relatório define resultado e próxima etapa", report.includes("Impacto operacional") && phase.nextPhase.phase === 50],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 049 verificada: ciclo diário direcionado, release governado e somente um build local no fechamento.");
