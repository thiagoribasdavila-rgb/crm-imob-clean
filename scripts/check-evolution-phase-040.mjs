import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-040-activity-explainable-history.json", "utf8"));
const phaseThirtyNine = JSON.parse(fs.readFileSync("config/evolution-phase-039-agenda-time-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const activity = fs.readFileSync("app/(crm)/activity/page.tsx", "utf8");
const activityApi = fs.readFileSync("app/api/v1/activity/route.ts", "utf8");
const leadTimelineApi = fs.readFileSync("app/api/v1/leads/[id]/timeline/route.ts", "utf8");
const categorizer = fs.readFileSync("lib/atlas/activity-timeline.ts", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_040_ACTIVITY_EXPLAINABLE_HISTORY.md", "utf8");

const checks = [
  ["Fase 040 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha Atividades", phaseThirtyNine.nextPhase.phase === 40 && phaseThirtyNine.nextPhase.status === "planned"],
  // CC-6: layout renomeado explain-first -> cc6-reading-timeline; o banner "FASE 40 ..."
  // deu lugar ao PageHeader ("O histórico que explica a operação"). Fase 40 e a
  // natureza explicável continuam declaradas no markup.
  ["Atividades declara histórico explicável", activity.includes('data-evolution-phase="40"') && activity.includes('data-activity-layout="cc6-reading-timeline"') && activity.includes("O histórico que explica a operação")],
  // CC-6: o tile redundante "Contatos" (== chip Contatos na API) foi consolidado;
  // restam 3 sinais (hoje, clientes em movimento, total). Dado preservado no chip.
  ["Primeira visão mostra três sinais observados", (activity.match(/cc6-metric-value/g) || []).length === 3 && config.activityContract.primarySignals === 3],
  // CC-6: o card "Contexto recente" (top-3 via slice(0,3)) duplicava a própria
  // timeline e foi removido; a governança anti-score migra para o rodapé
  // "ordem cronológica, sem prioridade". Ordenação cronológica preservada.
  ["Movimentações em ordem cronológica, sem ranking", activity.includes("ordem cronológica, sem prioridade") && config.informationHierarchy.latestMovementsUseChronologicalOrder === true],
  // CC-6: rodapé passou a "até 500 registros no escopo" (minúsculo). Limite mantido.
  ["Quatro períodos e seis categorias permanecem pesquisáveis", config.activityContract.periods.length === 4 && config.activityContract.categories.length === 6 && config.activityContract.maximumVisibleRecords === 500 && activity.includes("Buscar no histórico") && activity.includes("até 500 registros")],
  // CC-6: <time> agora em JSX multi-linha; a semântica dateTime segue presente.
  ["Linha do tempo agrupa por dia e usa horário semântico", activity.includes("dayKey(event.occurredAt)") && activity.includes("dateTime={event.occurredAt}") && config.informationHierarchy.timelineGroupedByLocalDay === true],
  // CC-6: o <details> colapsável repetia os contadores já visíveis nos chips de
  // categoria e foi removido; a composição agora fica sempre visível nos chips.
  ["Composição por categoria visível nos chips", activity.includes("{categoryCount(key)}") && activity.includes("CATEGORIES.map") && config.informationHierarchy.categoryCompositionAlwaysVisible === true],
  // CC-6: botão de refresh manual renomeado "Atualizar histórico" -> "Atualizar".
  ["Realtime e atualização manual foram implementados", activity.includes('"commercial-activity-history"') && activity.includes("removeChannel") && activity.includes("Atualizar") && config.activityContract.realtimePreserved === true],
  ["API lê e enriquece apenas pelo contexto RLS da organização", activityApi.includes("requireAccessContext") && activityApi.includes('from("lead_events")') && activityApi.includes('identity.supabase.from("leads")') && activityApi.includes('identity.supabase.from("profiles")') && activityApi.includes('eq("organization_id", organizationId)') && activityApi.includes('scope: "activity-history-read"')],
  ["API é somente leitura e não devolve metadados brutos", !activityApi.includes(".insert(") && !activityApi.includes(".update(") && !activityApi.includes(".delete(") && activityApi.includes("mapLiveLeadEvent") && !activityApi.includes("metadata: row.metadata") && !activityApi.includes("...row") && config.activityContract.rawMetadataReturned === false],
  ["Classificador é compartilhado com Lead 360", categorizer.includes("activityCategoryForType") && activityApi.includes("activityCategoryForType") && leadTimelineApi.includes("activityCategoryForType")],
  // CC-6: disclaimer anti-execução consolidado no rodapé "ordem cronológica, sem prioridade ou ação automática".
  ["Nenhuma execução comercial automática foi adicionada", activity.includes("ordem cronológica, sem prioridade") && config.executionPolicy.automaticTaskCreation === false && config.executionPolicy.automaticCustomerContact === false && config.executionPolicy.automaticDecision === false],
  // CC-6: +1 useState (nowMs) e +1 useEffect (relógio de 1min p/ "há 2h"/HOJE frescos).
  // Não adiciona rede nem realtime — segue 1 fetch e 1 assinatura.
  ["Estrutura React usa uma leitura e uma assinatura", (activity.match(/useState/g) || []).length === 9 && (activity.match(/useEffect\(/g) || []).length === 3 && (activity.match(/fetch\(/g) || []).length === 1 && config.structuralBaseline.networkRequests === 1 && config.structuralBaseline.realtimeSubscriptions === 1],
  ["Layout possui responsividade, toque e movimento reduzido", styles.includes("/* Fase 040 — histórico explicável") && styles.includes(".atlas-activity-timeline") && styles.includes("min-height: 44px") && styles.includes("@media (prefers-reduced-motion: reduce)")],
  ["Relatório registra limites e próxima fase", report.includes("não publica alegação de produtividade") && report.includes("Fase 041") && config.nextPhase.phase === 41],
  ["RBAC, tenant, RLS e timeline existente foram preservados", config.safetyPolicy.rbacPreserved === true && config.safetyPolicy.tenantIsolationPreserved === true && config.safetyPolicy.rlsPreserved === true && config.safetyPolicy.existingLeadTimelinePreserved === true],
  ["Gate de homologação não foi contornado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
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
console.log("Fase 040 verificada: histórico explicável, pesquisável e somente leitura.");
