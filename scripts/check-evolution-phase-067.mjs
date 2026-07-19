import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-067-governed-task-outcome-memory.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const route = read("app/api/v1/tasks/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_067_GOVERNED_TASK_OUTCOME_MEMORY.md");

const checks = [
  ["Fase 067 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 67", program.currentPhase >= 67],
  ["Autoridade de resultado existe somente para tarefa real com lead", dock.includes('"record-task-outcome"') && dock.includes("Boolean(governedLeadId)") && dock.includes('data-governed-write="task-outcome"')],
  ["Coleta aparece depois da conclusão governada", dock.includes("canRecordGovernedTaskOutcome && taskCompletionResult") && dock.includes("Qual foi o resultado observado?")],
  ["Interface exige taxonomia, limite e confirmação própria", dock.includes("taskOutcomeOptions") && dock.includes('maxLength={500}') && dock.includes("Confirmo que este resultado foi observado")],
  ["Cliente envia estado concluído, resultado e chave estável", dock.includes('action: "record_outcome"') && dock.includes("expectedStatus: taskCompletionContext.status") && dock.includes("outcome: taskOutcome") && dock.includes("taskOutcomeIdempotencyRef")],
  ["Backend restringe origem, confirmação e idempotência", route.includes("TASK_OUTCOME_SOURCE_INVALID") && route.includes("COPILOT_TASK_OUTCOME_CONFIRMATION_REQUIRED") && route.includes("COPILOT_TASK_IDEMPOTENCY_REQUIRED")],
  ["Escopo autenticado e tenant permanecem obrigatórios", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && !route.includes("getSupabaseAdmin")],
  ["Somente tarefa concluída e ligada à lead alimenta memória", route.includes("TASK_OUTCOME_REQUIRES_COMPLETION") && route.includes("TASK_OUTCOME_REQUIRES_LEAD") && route.includes("completedTaskStatuses.has(currentStatus)")],
  ["Repetição consulta a memória antes de inserir", route.includes('eq("event_type", "copilot_task_outcome_recorded")') && route.includes('.contains("metadata", { taskId: id, idempotencyFingerprint })') && route.includes("task.outcome_idempotent_replay")],
  ["Resultado observado entra no lead_events existente", route.includes('type: "copilot_task_outcome_recorded"') && route.includes("taskOutcomeLabels") && route.includes("outcomeRecord.data.id")],
  ["Falha de memória não é mascarada como sucesso", route.includes("TASK_OUTCOME_IDEMPOTENCY_CHECK_FAILED") && route.includes("TASK_OUTCOME_RECORD_FAILED") && route.includes("task.outcome_record_failed")],
  ["Registro não altera tarefa, score, pipeline ou mensagens", route.indexOf('if (action === "record_outcome")') < route.indexOf("const update = action") && report.includes("não atualiza responsável, prioridade, prazo, pipeline, score ou mensagens")],
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
console.log("Fase 067 verificada: resultado observado, confirmado, idempotente e preservado como memória comercial sem automação downstream.");
