import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const sprint = JSON.parse(read("config/corrective-sprint-050-059.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const pipelineApi = read("app/api/v1/pipeline/route.ts");
const pipelinePage = read("app/(crm)/pipeline/page.tsx");
const styles = read("app/globals.css");
const tasksApi = read("app/api/v1/tasks/route.ts");
const calendarApi = read("app/api/v1/calendar/route.ts");
const projectsApi = read("app/api/v1/launch-os/route.ts");
const liveRepositories = read("lib/atlas/core-v2/live-repositories.ts");
const managerApi = read("app/api/v1/analytics/manager-daily/route.ts");
const brokerApi = read("app/api/v1/analytics/broker-daily/route.ts");
const report = read("docs/ATLAS_CORRECTIVE_SPRINT_050_059.md");

const checks = [
  [
    "As dez fases corretivas estão concluídas com evidência",
    sprint.phases.length === 10 &&
      sprint.phases.every((phase) => phase.status === "completed") &&
      program.currentPhase >= 59,
  ],
  [
    "Pipeline usa somente leads reais e exclui a memória arquivada",
    pipelineApi.includes('.from("leads")') &&
      pipelineApi.includes("archivedMemoryExcluded") &&
      !pipelineApi.includes('.from("opportunities")'),
  ],
  [
    "Movimentação detecta conflito, registra histórico e suporta undo",
    pipelineApi.includes("PIPELINE_STAGE_CONFLICT") &&
      pipelineApi.includes('.from("pipeline_history")') &&
      pipelineApi.includes("reversalOf") &&
      !pipelineApi.includes('rpc("move_pipeline_lead"'),
  ],
  [
    "Kanban possui drag, teclado, ações rápidas e detalhes progressivos",
    pipelinePage.includes("draggable") &&
      pipelinePage.includes("event.altKey") &&
      pipelinePage.includes("Desfazer") &&
      pipelinePage.includes("atlas-kanban-primary-actions") &&
      pipelinePage.includes("atlas-kanban-card-details"),
  ],
  [
    "Kanban tem tratamento responsivo e cartão de risco",
    styles.includes("atlas-kanban-board") &&
      styles.includes("atlas-pipeline-lead[data-risk") &&
      styles.includes("atlas-kanban-mobile-nav") &&
      styles.includes("@media (max-width: 820px)"),
  ],
  [
    "Tarefas e agenda usam due_date e user_id ativos",
    tasksApi.includes("readCompatibleTasks") &&
      calendarApi.includes("readCompatibleTasks") &&
      liveRepositories.includes("due_date") &&
      liveRepositories.includes("user_id") &&
      !tasksApi.includes('.select("id,title,status,due_at'),
  ],
  [
    "Projetos usam o portfólio ativo sem developments",
    projectsApi.includes("readCompatibleDevelopments") &&
      liveRepositories.includes('.from("crm_projects")') &&
      projectsApi.includes('.from("inventory_units")') &&
      projectsApi.includes('.from("knowledge_documents")') &&
      !projectsApi.includes('.from("developments")'),
  ],
  [
    "Painéis de gerente e corretor usam colunas vivas",
    managerApi.includes("LIVE_LEAD_SELECT") &&
      managerApi.includes("LIVE_PROFILE_SELECT") &&
      brokerApi.includes("assigned_user_id") &&
      brokerApi.includes("due_date") &&
      !managerApi.includes('.from("commercial_presence")'),
  ],
  [
    "Relatório documenta limites sem alegar dados inexistentes",
    report.includes("Limites honestos da base atual") &&
      report.includes("compliance de SLA permanece nulo") &&
      report.includes("build e ZIP continuam corretamente bloqueados"),
  ],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(
  "Sprint corretivo 50–59 verificado: base ativa conectada e Kanban protegido, responsivo e auditável.",
);
