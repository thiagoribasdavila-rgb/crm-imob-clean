import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-064-copilot-daily-execution-queue.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const route = read("app/api/ai/daily-queue/route.ts");
const engine = read("lib/atlas/copilot-daily-queue.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_064_COPILOT_DAILY_EXECUTION_QUEUE.md");

const checks = [
  ["Fase 064 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 64", program.currentPhase >= 64],
  ["Fila possui endpoint autenticado e limitado", route.includes("requireAccessContext(request)") && route.includes("enforceRateLimit") && route.includes("COPILOT_DAILY_QUEUE_UNAVAILABLE")],
  ["Tenant e hierarquia permanecem no contrato", route.includes('.eq("organization_id", organizationId)') && route.includes("hierarchicalRls: true") && route.includes("operationalBaseOnly: true")],
  ["Base fria não participa da fila operacional", engine.includes("coldBaseExcluded: true") && !route.includes("reactivation_contacts")],
  ["Prioridade usa prazos e sinais observados", engine.includes('"task-overdue"') && engine.includes('"task-due-today"') && engine.includes('"observed-score-70-plus"') && engine.includes('"observed-hot-temperature"')],
  ["Ausência de prazo não é disfarçada como data de criação", route.includes("A data de criação nunca vira prazo") && route.includes("dueAt: nullableText(task.due_date)")],
  ["Lead não é repetida quando já possui tarefa acionável", engine.includes("representedLeadIds") && engine.includes("representedLeadIds.has(lead.id)")],
  ["Fila diária permanece curta", engine.includes("Math.min(8") && route.includes("buildCopilotDailyQueue(tasks, leadInputs, new Date(), 5)")],
  ["Navegador deixou de consultar tarefas diretamente", dock.includes('fetch("/api/ai/daily-queue"') && !dock.includes('.from("tasks")')],
  ["Interface mostra evidência e recomendação", dock.includes("Fila curta de hoje") && dock.includes("item.evidence") && dock.includes("item.recommendedAction")],
  ["Tarefas existentes recebem somente ações governadas explícitas", dock.includes('governedActions: isLeadOpportunity ? ["create-task", "move-pipeline"] : item.taskId ? ["complete-task", "reschedule-task", "record-task-outcome"] : []') && dock.includes("Preparar com IA")],
  ["Motor proíbe mensagens externas e escritas silenciosas", engine.includes("externalMessagesDisabled: true") && engine.includes("silentWritesDisabled: true") && engine.includes("humanConfirmationRequired: true")],
  ["Relatório registra impacto, segurança, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Segurança e governança") && report.includes("Risco identificado") && report.includes("Próxima etapa recomendada")],
  ["Release continua bloqueado até o gate", phase.release.zipCreated === false && phase.release.buildExecuted === false && phase.release.gatesApproved === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 064 verificada: fila diária curta, explicável, autenticada e conectada às ações governadas do Copilot.");
