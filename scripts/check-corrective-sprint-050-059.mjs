import fs from "node:fs";
import { mediaAlcanca } from "./lib/css-propriedade.mjs";

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
  // ── REAPONTADA EM 2026-07-29 — a RPC deixou de estar ausente ───────────────
  //
  // A asserção proibia `rpc("move_pipeline_lead")`. Isso estava certo quando o
  // sprint foi escrito: config/evolution-phase-050-live-lead-contract.json
  // registra, em 18/07/2026, `missingRpcFunctions: [create_lead_atomic,
  // move_pipeline_lead, touch_commercial_presence]` — chamar a RPC era chamar
  // função inexistente.
  //
  // MEDIDO NO BANCO VIVO (pozbrcsfthnhmnebfoxv, 29/07/2026): as TRÊS existem
  // hoje, e `move_pipeline_lead` tem exatamente a assinatura que a rota chama
  // (p_actor_id, p_organization_id, p_lead_id, p_to_stage,
  // p_expected_from_stage, p_reason, p_reversal_of). A causa da vermelha é que
  // a migration chegou depois do sprint, não que a rota tenha regredido.
  //
  // A propriedade que o sprint quer é "mover não perde histórico". A RPC a
  // atende MELHOR que o caminho antigo: troca de etapa e auditoria na mesma
  // transação, sem a janela em que a lead fica numa etapa que o histórico não
  // conhece. Então a asserção passa a exigir o que de fato protege:
  //   · o caminho atômico existe;
  //   · o caminho compensatório continua existindo, para base sem a RPC;
  //   · o recuo só acontece quando a FUNÇÃO FALTA (42883/PGRST202). Recuar
  //     também em recusa de regra faria a escrita manual passar por cima de um
  //     "não pode" do banco — mover a lead que a RPC acabou de barrar.
  [
    "Movimentação detecta conflito, registra histórico e suporta undo",
    pipelineApi.includes("PIPELINE_STAGE_CONFLICT") &&
      pipelineApi.includes('.from("pipeline_history")') &&
      pipelineApi.includes("reversalOf") &&
      pipelineApi.includes('rpc("move_pipeline_lead"') &&
      pipelineApi.includes('atomicMove.error.code !== "42883" && atomicMove.error.code !== "PGRST202"'),
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
    // ── REAPONTADA EM 02/08/2026 ─────────────────────────────────────────
    // Quatro `includes` soltos: três classes e um breakpoint, sem nenhuma
    // relação exigida entre eles. "Tratamento responsivo" É a relação — a
    // navegação móvel do Kanban tem de estar DENTRO do bloco de 820px. Do
    // jeito antigo, apagar o bloco @media inteiro e deixar um `@media
    // (max-width: 820px)` decorativo em qualquer outro canto passava.
    styles.includes("atlas-pipeline-lead[data-risk") &&
      mediaAlcanca(styles, "max-width: 820px", ".atlas-kanban-board") &&
      mediaAlcanca(styles, "max-width: 820px", ".atlas-kanban-mobile-nav"),
  ],
  [
    "Tarefas e agenda usam due_date e user_id ativos",
    tasksApi.includes("readCompatibleTasks") &&
      calendarApi.includes("readCompatibleTasks") &&
      liveRepositories.includes("due_date") &&
      liveRepositories.includes("user_id") &&
      !tasksApi.includes('.select("id,title,status,due_at'),
  ],
  // ── REAPONTADA EM 2026-07-29 — a tabela viva é `developments` ──────────────
  //
  // A asserção exigia que o repositório lesse `crm_projects`. MEDIDO no banco
  // vivo (pozbrcsfthnhmnebfoxv, 29/07/2026): as duas tabelas têm 4 linhas cada,
  // com os MESMOS empreendimentos sob IDs DIFERENTES — e é a FK que decide:
  //
  //   leads.development_id casando com developments ... 192 de 192
  //   leads.development_id casando com crm_projects ...   0 de 192
  //
  // Ler `crm_projects` devolveria 4 empreendimentos que nenhuma lead
  // referencia: a tela do portfólio listaria os projetos certos com contagem
  // zero em todos. Por isso lib/atlas/core-v2/live-repositories.ts lê
  // `developments`, e o comentário dele explica a mesma medição.
  //
  // O rótulo antigo dizia "sem developments" e virou o oposto do que o banco
  // pede; ele agora nomeia a propriedade real. A última cláusula CONTINUA
  // valendo e não é contradição: a ROTA não consulta a tabela direto, ela passa
  // por `readCompatibleDevelopments`, que é onde a escolha entre as duas
  // tabelas fica documentada num lugar só.
  [
    "Projetos leem a tabela de empreendimento que as leads referenciam",
    projectsApi.includes("readCompatibleDevelopments") &&
      liveRepositories.includes('.from("developments")') &&
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
