import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-039-agenda-time-workspace.json", "utf8"));
const phaseThirtyEight = JSON.parse(fs.readFileSync("config/evolution-phase-038-task-execution-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const calendar = fs.readFileSync("app/(crm)/calendar/page.tsx", "utf8");
const calendarApi = fs.readFileSync("app/api/v1/calendar/route.ts", "utf8");
const liveRepositories = fs.readFileSync("lib/atlas/core-v2/live-repositories.ts", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_039_AGENDA_TIME_WORKSPACE.md", "utf8");

const checks = [
  ["Fase 039 concluída sem mutação estrutural", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false && config.dataFetchingChanged === false],
  ["Fase anterior encaminha a Agenda", phaseThirtyEight.nextPhase.phase === 39 && phaseThirtyEight.nextPhase.status === "planned"],
  // Reconciliação CC-6: o comentário "FASE 39 · AGENDA TEMPORAL" deu lugar aos atributos
  // data-evolution-phase="39"/data-calendar-layout="time-first" e ao cabeçalho "Linha do tempo".
  ["Agenda declara hierarquia temporal", calendar.includes('data-evolution-phase="39"') && calendar.includes('data-calendar-layout="time-first"') && calendar.includes("Linha do tempo")],
  // Reconciliação CC-6: os cartões "atlas-calendar-signal" foram consolidados na navegação de
  // períodos, alimentada pelo useMemo `signals` com três contagens temporais (overdue/today/nextSevenDays);
  // o antigo 4º sinal ("visits") passou a compor a barra de composição. primarySignals atualizado para 3.
  ["Primeira visão mostra sinais temporais", calendar.includes("signals.overdue") && calendar.includes("signals.today") && calendar.includes("signals.nextSevenDays") && config.calendarContract.primarySignals === 3],
  // Reconciliação CC-6: a seção "O que exige ação agora" tornou-se a fixação de atrasos ("Em atraso ·
  // resolver primeiro"), agora mostrando TODOS os atrasos ordenados por prazo (deixou de truncar em 3).
  // A atenção continua priorizando atraso+hoje (immediateAttentionShowsOverdueAndToday).
  ["Atenção imediata prioriza os atrasos", calendar.includes("overdueItems") && calendar.includes("resolver primeiro") && calendar.includes('aria-labelledby="atlas-calendar-overdue-title"') && config.informationHierarchy.immediateAttentionShowsOverdueAndToday === true],
  // Reconciliação CC-6: a ordenação por prazo passou a usar `.filter((item) => item.overdue)` para fixar
  // atrasos primeiro (antes `item.overdue ||`). Segue sem previsão/score.
  ["Atenção usa atraso e hoje sem previsão", calendar.includes(".filter((item) => item.overdue)") && config.truthPolicy.orderingUsesDeadlineNotPrediction === true && config.truthPolicy.assistantPresentedAsAutonomousAi === false],
  ["Cinco períodos operacionais foram preservados", config.calendarContract.periods.length === 5 && ["today", "week", "month", "overdue", "all"].every((period) => calendar.includes(`\"${period}\"`))],
  // Reconciliação CC-6: o elemento <time> foi reformatado pelo Prettier (multilinha); a asserção
  // aponta para dateTime={item.at}, que segue como horário semântico.
  ["Linha do tempo agrupa por dia e usa horário semântico", calendar.includes("dayKey(item.at)") && calendar.includes("dateTime={item.at}") && config.informationHierarchy.timelineGroupedByLocalDay === true],
  ["Tarefa, visita e follow-up continuam unificados", ["task", "visit", "follow_up"].every((kind) => calendar.includes(kind)) && config.calendarContract.sources.length === 3],
  // Reconciliação CC-6: a composição por fonte deixou de ser um <details> (divulgação progressiva) e
  // passou a ser exibida sempre, inline (aria-label="Composição da agenda", composition.map). Tarefas,
  // Visitas, Follow-ups e Total permanecem visíveis. sourceCompositionProgressivelyDisclosed atualizado para false.
  ["Composição por fonte permanece visível", calendar.includes('aria-label="Composição da agenda"') && calendar.includes("composition.map") && config.informationHierarchy.sourceCompositionProgressivelyDisclosed === false],
  // Reconciliação CC-6: o comentário "FASE 46 · AGENDA COMERCIAL UNIFICADA" foi substituído pelo
  // atributo data-phase="46-commercial-calendar" e pelo eyebrow "Agenda comercial · Fonte única".
  ["Contrato legado da Agenda permanece identificável", calendar.includes('data-phase="46-commercial-calendar"') && calendar.includes("Agenda comercial · Fonte única")],
  ["Realtime e atualização manual foram preservados", calendar.includes('supabase.channel("commercial-calendar")') && calendar.includes("removeChannel") && calendar.includes("Atualizar") && config.calendarContract.existingRealtimePreserved === true],
  ["API mantém autenticação, organização e três tipos de agenda", calendarApi.includes("requireAccessContext") && calendarApi.includes("readCompatibleTasks") && calendarApi.includes("readCompatibleLeads") && liveRepositories.includes('.eq("organization_id", organizationId)') && calendarApi.includes('kind: "task"') && calendarApi.includes('kind: "visit"') && calendarApi.includes('kind: "follow_up"')],
  ["Deduplicação de visita e follow-up permanece ativa", calendarApi.includes("activeVisitKeys") && calendarApi.includes("next_action_at") && config.calendarContract.visitFollowUpDeduplicationPreserved === true],
  ["Nenhuma nova chamada, estado ou efeito foi adicionado", (calendar.match(/fetch\(/g) || []).length === 1 && (calendar.match(/useState/g) || []).length === 6 && (calendar.match(/useEffect\(/g) || []).length === 2 && config.structuralBaseline.newNetworkRequestAdded === false && config.structuralBaseline.newStateAdded === false && config.structuralBaseline.newEffectAdded === false],
  // Reconciliação CC-6: o Prettier quebrou "nenhum cliente é" entre linhas; a asserção aponta para
  // "nenhuma ação é concluída" + "contatado automaticamente", que seguem no aviso de não-automação.
  ["A Agenda não executa trabalho automaticamente", calendar.includes("nenhuma ação é concluída") && calendar.includes("contatado automaticamente") && config.executionPolicy.automaticTaskCompletion === false && config.executionPolicy.automaticVisitConfirmation === false && config.executionPolicy.automaticCustomerContact === false],
  ["Layout possui responsividade, toque e movimento reduzido", styles.includes("/* Fase 039 — agenda temporal") && styles.includes(".atlas-calendar-period") && styles.includes("min-height: 44px") && styles.includes("@media (prefers-reduced-motion: reduce)")],
  ["Relatório registra limites e próxima fase", report.includes("não publica alegação de produtividade") && report.includes("Fase 040") && config.nextPhase.phase === 40],
  ["RBAC, tenant e rotas permanecem preservados", config.safetyPolicy.rbacPreserved === true && config.safetyPolicy.tenantIsolationPreserved === true && config.safetyPolicy.routesPreserved === true],
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

if (process.exitCode) throw new Error("Fase 039 reprovada");

console.log("Fase 039 aprovada: Agenda temporal, unificada e governada.");
