import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-065-governed-task-completion.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const route = read("app/api/v1/tasks/route.ts");
const engine = read("lib/atlas/copilot-daily-queue.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_065_GOVERNED_TASK_COMPLETION.md");

const checks = [
  ["Fase 065 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 65", program.currentPhase >= 65],
  ["Fila entrega o status observado somente para tarefas", engine.includes("taskStatus: task.status") && engine.includes("taskStatus: null")],
  ["Copilot preserva a conclusão governada da tarefa", dock.includes('"complete-task"') && dock.includes('externalContext.governedActions.includes("complete-task")') && dock.includes('data-governed-write="task-complete"')],
  ["Interface exige confirmação humana explícita", dock.includes("taskCompletionReviewed") && dock.includes("Executei a tarefa e confirmo sua conclusão") && dock.includes('data-human-confirmation="confirmed"')],
  ["Cliente envia status revisado e chave estável", dock.includes('"Idempotency-Key": idempotencyKey') && dock.includes("expectedStatus: taskCompletionContext.status") && dock.includes("taskCompletionIdempotencyRef")],
  ["Backend bloqueia conclusão silenciosa ou sem idempotência", route.includes("COPILOT_TASK_COMPLETION_CONFIRMATION_REQUIRED") && route.includes("COPILOT_TASK_IDEMPOTENCY_REQUIRED") && route.includes('source === "atlas-copilot" && action === "complete" && (!humanConfirmed || !expectedStatus)')],
  ["Escopo autenticado e tenant permanecem obrigatórios", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && !route.includes("getSupabaseAdmin")],
  ["Concorrência usa o status revisado como trava atômica", route.includes('mutation.eq("status", current.data.status)') && route.includes("TASK_STATUS_CONFLICT") && route.includes("expectedNormalized !== currentStatus")],
  ["Repetição concluída não duplica transição", route.includes("task.completion_idempotent_replay") && route.includes("transitionApplied: false") && route.includes("idempotentReplay: true")],
  ["Conclusão vinculada entra no histórico com fallback", route.includes('type: "copilot_task_completed"') && route.includes("recordLiveLeadEvent") && route.includes('auditTrail = auditRecorded ? "lead_events" : "structured_log-fallback"')],
  ["Fila do Copilot é sincronizada após a conclusão", dock.includes('fetch("/api/ai/daily-queue"') && dock.includes("setDailyQueue((current) => current.filter") && dock.includes("setDailyQueueSummary(queuePayload.data?.summary")],
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
console.log("Fase 065 verificada: conclusão de tarefa confirmada, atômica, idempotente, auditável e refletida na fila do Copilot.");
