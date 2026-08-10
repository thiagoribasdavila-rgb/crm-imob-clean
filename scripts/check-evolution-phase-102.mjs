import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const phase = json("config/evolution-phase-102-decision-first-layout.json");
const program = json("config/evolution-program-3000.json");
const report = read("docs/EVOLUTION_PHASE_102_DECISION_FIRST_LAYOUT_SYSTEM.md");
const pipeline = read("app/(crm)/pipeline/page.tsx");
const css = read("app/globals.css");
const pkg = read("package.json");

const checks = [
  ["Fase 102 registrada como concluída", phase.phase === 102 && phase.status === "completed"],
  ["Programa avançou para fase 102", program.currentPhase >= 102],
  ["Sem mutação de banco ao vivo", phase.liveDatabaseMutation === false && phase.liveMigrationApplied === false],
  ["Documentação orienta decisão antes de painel", report.includes("menos painel, mais decisão") && report.includes("Qual próxima ação")],
  ["Perfis comerciais contemplados", report.includes("Corretor") && report.includes("Gerente") && report.includes("Diretor")],
  ["Pipeline recebeu princípio decision-first", pipeline.includes("atlas-decision-page") && pipeline.includes("data-layout-principle=\"decision-first-ui\"")],
  ["Kanban tem faixa de decisão proativa", pipeline.includes("decisionCommand") && pipeline.includes("atlas-decision-command-strip") && pipeline.includes("Decisão agora")],
  ["Decisão prioriza SLA, risco e leads quentes", pipeline.includes("metrics.firstContactOverdue") && pipeline.includes("metrics.highRisk") && pipeline.includes("metrics.hot")],
  ["Estilo visual da faixa de decisão existe", css.includes(".atlas-decision-command-strip") && css.includes(".atlas-decision-command-metrics") && css.includes(".atlas-decision-command-action")],
  ["Script de validação está exposto no pacote", pkg.includes("\"evolution:phase-102:check\"")],
];

for (const [label, passed] of checks) {
  console.log(`${passed ? "✓" : "✗"} ${label}`);
  if (!passed) process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 102 verificada: layout decision-first aplicado ao Kanban sem mutar banco.");
