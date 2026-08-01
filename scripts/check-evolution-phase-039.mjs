import fs from "node:fs";
import { temAlvoDeToque, mediaAlcanca } from "./lib/css-propriedade.mjs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-039-agenda-time-workspace.json", "utf8"));
const phaseThirtyEight = JSON.parse(fs.readFileSync("config/evolution-phase-038-task-execution-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const calendar = fs.readFileSync("app/(crm)/calendar/page.tsx", "utf8");
const calendarApi = fs.readFileSync("app/api/v1/calendar/route.ts", "utf8");
const liveRepositories = fs.readFileSync("lib/atlas/core-v2/live-repositories.ts", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_039_AGENDA_TIME_WORKSPACE.md", "utf8");

// O CORPO do efeito que encaminha a intenção da URL, recortado para ser
// inspecionado sozinho: é ele que precisa provar que NÃO busca dados. Contar
// `fetch(` na página inteira não distinguiria o efeito novo do `load()` que
// sempre existiu.
const inicioDoEfeito = calendar.indexOf("if (!pedeCriar(lerIntencaoDaJanela())");
const fimDoEfeito = calendar.indexOf("}, [router]);", inicioDoEfeito);
const efeitoDaIntencao = inicioDoEfeito >= 0 && fimDoEfeito > inicioDoEfeito
  ? calendar.slice(inicioDoEfeito, fimDoEfeito)
  : "EFEITO-DE-INTENCAO-NAO-ENCONTRADO fetch(";

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
  // ── POR QUE ESTE NÚMERO MUDOU (2026-07-29) ─────────────────────────────────
  // A garantia desta fase é que a Agenda NÃO PASSOU A BUSCAR MAIS DADOS: ela é
  // fase de apresentação (`dataFetchingChanged: false`). Quem carrega essa
  // garantia é `fetch(` === 1, e esse número está INTOCADO.
  //
  // Estado e efeito subiram (5 → 6 e 2 → 3), com causa medida: o catálogo
  // declara a ação primária deste destino como `/calendar?create=1` ("Novo
  // compromisso") e a tela ignorava o parâmetro — quem clicava chegava na linha
  // do tempo com nada aberto. O acréscimo é UM estado (`encaminhandoCriacao`) e
  // UM efeito que lê a intenção pelo módulo compartilhado e faz
  // `router.replace("/tasks?create=1")`: NAVEGAÇÃO, não rede.
  //
  // O número novo não foi fixado às cegas. A asserção NOMEIA o acréscimo e
  // prova a propriedade que importa: o efeito novo é o encaminhamento da
  // intenção e não contém nenhuma chamada de rede.
  ["Nenhuma nova chamada de rede; o estado e o efeito novos são o encaminhamento da intenção",
    (calendar.match(/fetch\(/g) || []).length === 1
    && config.postPhaseAdditions.networkRequests === 1
    && config.structuralBaseline.newNetworkRequestAdded === false
    && (calendar.match(/useState/g) || []).length === config.postPhaseAdditions.useStateOccurrences
    && (calendar.match(/useEffect\(/g) || []).length === config.postPhaseAdditions.useEffectOccurrences
    && calendar.includes("const [encaminhandoCriacao, setEncaminhandoCriacao] = useState(false)")
    && calendar.includes("pedeCriar(lerIntencaoDaJanela())")
    && calendar.includes('router.replace("/tasks?create=1")')
    && !efeitoDaIntencao.includes("fetch(")
    && config.postPhaseAdditions.addedEffectFetches === false],
  // Reconciliação CC-6: o Prettier quebrou "nenhum cliente é" entre linhas; a asserção aponta para
  // "nenhuma ação é concluída" + "contatado automaticamente", que seguem no aviso de não-automação.
  ["A Agenda não executa trabalho automaticamente", calendar.includes("nenhuma ação é concluída") && calendar.includes("contatado automaticamente") && config.executionPolicy.automaticTaskCompletion === false && config.executionPolicy.automaticVisitConfirmation === false && config.executionPolicy.automaticCustomerContact === false],
  ["Layout possui responsividade, toque e movimento reduzido", temAlvoDeToque(styles, ".atlas-calendar", 44) && mediaAlcanca(styles, "prefers-reduced-motion: reduce", ".atlas-calendar")],
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
