import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-062-governed-copilot-actions.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const dock = read("components/AtlasCopilotDock.tsx");
const tasks = read("app/api/v1/tasks/route.ts");
const report = read("docs/EVOLUTION_PHASE_062_GOVERNED_COPILOT_ACTIONS.md");

const checks = [
  ["Fase 062 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 62", program.currentPhase >= 62],
  ["Prévia governada exige contexto de lead e confirmação", dock.includes("canCreateGovernedTask") && dock.includes('data-governed-write="task-create"') && dock.includes('data-human-confirmation="confirmed"')],
  ["Usuário revisa título, prazo e prioridade antes da gravação", dock.includes("taskTitle") && dock.includes("taskDueAt") && dock.includes("taskPriority") && dock.includes("taskReviewed")],
  ["UI envia confirmação explícita para a API existente", dock.includes('fetch("/api/v1/tasks"') && dock.includes('source: "atlas-copilot"') && dock.includes("humanConfirmed: true")],
  ["Backend bloqueia execução silenciosa do Copilot", tasks.includes("COPILOT_TASK_CONFIRMATION_REQUIRED") && tasks.includes('source === "atlas-copilot" && (!leadId || !humanConfirmed)')],
  ["Responsável único da lead continua preservado", tasks.includes("lead.data.assigned_user_id || identity.access.profile.id") && tasks.includes("ownerPreservedFromLead")],
  ["Decisão humana fica registrada no histórico", tasks.includes("recordLiveLeadEvent") && tasks.includes('type: source === "atlas-copilot" ? "copilot_task_confirmed"') && tasks.includes("auditRecorded")],
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
console.log("Fase 062 verificada: recomendação do Copilot vira tarefa somente após revisão humana, com tenant, responsável e auditoria preservados.");
