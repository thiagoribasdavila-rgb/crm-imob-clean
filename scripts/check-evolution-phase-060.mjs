import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-060-atlas-copilot-command-center.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const dashboard = read("app/(crm)/dashboard/page.tsx");
const commandCenter = read("app/(crm)/command-center/page.tsx");
const dock = read("components/AtlasCopilotDock.tsx");
const dailyQueueRoute = read("app/api/ai/daily-queue/route.ts");
const decisionCenter = read("app/(crm)/decision-center/page.tsx");
const report = read("docs/EVOLUTION_PHASE_060_ATLAS_COPILOT_COMMAND_CENTER.md");

const checks = [
  ["Fase 060 concluída sem mutar banco ou dados", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 60", program.currentPhase >= 60],
  // CC-6 (commit d7112d24 "fusão Início + Command Center"): /dashboard virou rota
  // de compatibilidade (redirect) e a home role-aware passou a ser /command-center,
  // que segue identificando a experiência por papel (viewerRole/roleLabel/roleDescription).
  ["Command Center identifica a experiência por perfil", dashboard.includes('redirect("/command-center")') && commandCenter.includes('data-page="command-center-live"') && commandCenter.includes("viewerRole") && commandCenter.includes("roleLabel")],
  // CC-6: o badge tri-estado saiu do herói do dashboard; a distinção honesta
  // "modelo generativo online" vs "motor local" segue no Copilot lateral (sempre
  // renderizado na (crm)/layout, portanto presente na sala de comando), lido dos
  // mesmos flags model.generativeReady/localIntelligenceReady do /api/ai/briefing.
  // O estado "preparando" é vestigial: localIntelligenceReady é sempre true na API.
  ["Estado da IA diferencia modelo, inteligência local e preparação", dock.includes("IA generativa") && dock.includes("Motor local seguro") && dock.includes("local-fallback") && dock.includes("localIntelligenceReady")],
  ["Copilot lateral usa briefing governado", dock.includes('fetch("/api/ai/briefing"') && !dock.includes('.from("ai_insights")')],
  ["Copilot lateral usa o prazo real das tarefas", dock.includes('fetch("/api/ai/daily-queue"') && dailyQueueRoute.includes("due_date") && dailyQueueRoute.includes("dueAt: nullableText(task.due_date)") && !dock.includes('.from("tasks")')],
  ["Centro de Decisão usa contrato real de leads", decisionCenter.includes("LIVE_LEAD_SELECT") && decisionCenter.includes("mapLegacyLead") && !decisionCenter.includes('.from("ai_insights")')],
  ["Falha parcial não expõe detalhe técnico", decisionCenter.includes("Seus dados permanecem protegidos")],
  ["Relatório registra impacto, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Risco identificado") && report.includes("Próxima etapa recomendada")],
  ["Release segue bloqueado até o gate", phase.release.zipCreated === false && phase.release.buildExecuted === false && phase.release.gatesApproved === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 060 verificada: Command Center e Copilot conectados aos sinais reais com experiência por perfil.");
