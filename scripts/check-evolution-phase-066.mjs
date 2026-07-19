import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-066-governed-task-reschedule.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const route = read("app/api/v1/tasks/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_066_GOVERNED_TASK_RESCHEDULE.md");

const checks = [
  ["Fase 066 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 66", program.currentPhase >= 66],
  ["Autoridade de reagendamento existe somente para tarefa real", dock.includes('["complete-task", "reschedule-task", "record-task-outcome"]') && dock.includes('externalContext.governedActions.includes("reschedule-task")') && dock.includes('data-governed-write="task-reschedule"')],
  ["Interface mostra prazo atual e exige um novo prazo revisado", dock.includes("Prazo atual:") && dock.includes('type="datetime-local"') && dock.includes("Revisei o novo prazo e confirmo o reagendamento")],
  ["Cliente envia status, prazo observado, novo prazo e chave estável", dock.includes('action: "reschedule"') && dock.includes("expectedDueAt: taskCompletionContext.dueAt") && dock.includes('"Idempotency-Key": idempotencyKey') && dock.includes("taskRescheduleIdempotencyRef")],
  ["Backend exige confirmação, prazo e idempotência", route.includes("COPILOT_TASK_RESCHEDULE_CONFIRMATION_REQUIRED") && route.includes("COPILOT_TASK_DUE_DATE_REQUIRED") && route.includes("COPILOT_TASK_IDEMPOTENCY_REQUIRED")],
  ["Escopo autenticado e tenant permanecem obrigatórios", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && !route.includes("getSupabaseAdmin")],
  ["Prazo novo precisa ser futuro e tarefa concluída é protegida", route.includes("TASK_RESCHEDULE_INVALID") && route.includes("TASK_ALREADY_COMPLETED") && route.includes('action === "reschedule" && completedTaskStatuses.has(currentStatus)')],
  ["Concorrência compara status e prazo observados", route.includes("TASK_DUE_DATE_CONFLICT") && route.includes('mutation.eq("status", current.data.status)') && route.includes('mutation.eq("due_date", current.data.due_date)') && route.includes('mutation.is("due_date", null)')],
  ["Repetição no mesmo prazo não duplica transição", route.includes("task.reschedule_idempotent_replay") && route.includes("alreadyScheduled: true") && route.includes("idempotentReplay: true")],
  ["Reagendamento vinculado entra no histórico com fallback", route.includes('type: "copilot_task_rescheduled"') && route.includes("task.reschedule_audit_fallback") && route.includes('auditTrail = auditRecorded ? "lead_events" : "structured_log-fallback"')],
  ["Responsável, prioridade, lead e pipeline não entram no update", route.includes('action === "reschedule"') && route.includes('? { due_date: requestedDueAt as string }') && !route.includes('action === "reschedule" ? { user_id')],
  ["Fila do Copilot é sincronizada após o reagendamento", dock.includes('const refreshedItem = queuePayload.data?.items?.find') && dock.includes("setDailyQueue(queuePayload.data?.items ?? [])") && dock.includes("setDailyQueueSummary(queuePayload.data?.summary ?? null)")],
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
console.log("Fase 066 verificada: reagendamento confirmado, atômico, idempotente, auditável e refletido na fila do Copilot.");
