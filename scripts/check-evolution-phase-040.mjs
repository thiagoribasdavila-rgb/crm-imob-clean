import fs from "node:fs";
import { assinaRealtime, buscaDados, corposDeEfeito, efeitosQueTocamRede, itensDeArrayLiteral, semRede } from "./lib/jsx-estrutura.mjs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-040-activity-explainable-history.json", "utf8"));
const phaseThirtyNine = JSON.parse(fs.readFileSync("config/evolution-phase-039-agenda-time-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const activity = fs.readFileSync("app/(crm)/activity/page.tsx", "utf8");
const activityApi = fs.readFileSync("app/api/v1/activity/route.ts", "utf8");
const leadTimelineApi = fs.readFileSync("app/api/v1/leads/[id]/timeline/route.ts", "utf8");
const categorizer = fs.readFileSync("lib/atlas/activity-timeline.ts", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_040_ACTIVITY_EXPLAINABLE_HISTORY.md", "utf8");

// Os corpos de efeito, recortados pela ÁRVORE e não por `indexOf` de uma
// frase: o recorte antigo dependia da linha `}, []);` existir com essa
// pontuação exata e virava a string-sentinela — que reprova — a cada
// reformatação do Prettier.
const efeitos = corposDeEfeito(activity);
const efeitoDaIntencao = efeitos.find((corpo) => corpo.includes('alvoDaIntencao(lerIntencaoDaJanela(), "visao")')) ?? "";
const efeitosComRede = efeitosQueTocamRede(activity);
const sinaisDoPulso = itensDeArrayLiteral(activity, "pulso") ?? [];

const checks = [
  ["Fase 040 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha Atividades", phaseThirtyNine.nextPhase.phase === 40 && phaseThirtyNine.nextPhase.status === "planned"],
  // CC-6: layout renomeado explain-first -> cc6-reading-timeline; o banner "FASE 40 ..."
  // deu lugar ao PageHeader ("O histórico que explica a operação"). Fase 40 e a
  // natureza explicável continuam declaradas no markup.
  ["Atividades declara histórico explicável", activity.includes('data-evolution-phase="40"') && activity.includes('data-activity-layout="cc6-reading-timeline"') && activity.includes("O histórico que explica a operação")],
  // ── REAPONTADA EM 02/08/2026 — DA CLASSE CSS PARA O ARRAY QUE MANDA ───────
  //
  // Era `(activity.match(/cc6-metric-value/g)||[]).length === 3`: contar
  // ocorrências de uma classe CSS no texto do arquivo para afirmar quantos
  // sinais a tela mostra.
  //
  // CAUSA MEDIDA DO VERMELHO: os três sinais viraram `pulso.map(...)`. UMA
  // ocorrência da classe desenhando TRÊS itens. A contagem foi a 1, o portão
  // acendeu, e a tela nunca deixou de mostrar três. Pior no outro sentido:
  // acrescentar a classe num rótulo decorativo qualquer levaria a contagem de
  // volta a 3 com a tela mostrando dois sinais — a asserção não saberia.
  //
  // Quem sabe quantos sinais a tela mostra é o ARRAY, e agora é ele que
  // responde, lido pela árvore (`itensDeArrayLiteral`). Os três nomes são
  // exigidos por nome: contagem sozinha aceitaria três sinais quaisquer.
  ["Primeira visão mostra três sinais observados",
    sinaisDoPulso.length === 3
    && sinaisDoPulso.some((item) => item.includes("summary.today"))
    && sinaisDoPulso.some((item) => item.includes("summary.leadsInMotion"))
    && sinaisDoPulso.some((item) => item.includes("summary.total"))
    && activity.includes("pulso.map(")
    && config.activityContract.primarySignals === 3],
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
  // Histórico preservado (2026-07-29): o efeito de MONTAGEM que lê a intenção
  // da URL só define o período inicial quando o alvo existe na MESMA lista que
  // desenha os chips (`PERIODS`). Chave inventada não vira recorte — `escolhido`
  // fica indefinido e a tela abre como sempre abriu.
  // ── AS CONTAGENS DE `useState`/`useEffect` SAÍRAM EM 02/08/2026 ───────────
  //
  // `(activity.match(/useState/g)||[]).length === 9` e a contagem de
  // `useEffect(` contra o config não medem "uma leitura e uma assinatura" —
  // medem quantos hooks o arquivo tem. Na Agenda (fase 039) uma contagem
  // gêmea acendeu o portão da REDE porque um carimbo de estado nasceu de uma
  // correção de pureza. É questão de tempo aqui.
  //
  // No lugar, a propriedade nomeada pela etiqueta, medida na árvore: uma única
  // chamada de rede no arquivo, uma única assinatura, UM único efeito tocando
  // rede — e ele é a assinatura `commercial-activity-history`, porque o
  // `fetch` mora no `load` (useCallback). O efeito da intenção continua
  // nomeado e provado sem rede.
  ["Estrutura React usa uma leitura e uma assinatura",
    (activity.match(/fetch\(/g) || []).length === 1
    && (activity.match(/\.channel\(/g) || []).length === 1
    && config.structuralBaseline.networkRequests === 1
    && config.structuralBaseline.realtimeSubscriptions === 1
    && efeitosComRede.length === 1
    && efeitosComRede[0].includes('.channel("commercial-activity-history")')
    && assinaRealtime(efeitosComRede[0])
    && !buscaDados(efeitosComRede[0])
    && efeitoDaIntencao.includes("PERIODS.find(([chave]) => chave === alvo)")
    && semRede(efeitoDaIntencao)
    && config.postPhaseAdditions.addedEffectReadsNetwork === false],
  ["Layout possui responsividade, toque e movimento reduzido", (() => {
    /* ── REAPONTADA EM 01/08/2026, DA EXISTÊNCIA PARA A PROPRIEDADE ─────────
       A versão anterior era:

         styles.includes("/* Fase 040 — histórico explicável")
         && styles.includes(".atlas-activity-timeline")
         && styles.includes("min-height: 44px")
         && styles.includes("@media (prefers-reduced-motion: reduce)")

       Quatro `includes` DESACOPLADOS sobre um arquivo de 10.960 linhas. Medido
       no dia da correção: `min-height: 44px` aparece 45 vezes e
       `@media (prefers-reduced-motion: reduce)` 15 — QUALQUER uma delas, em
       qualquer canto do arquivo, satisfazia a asserção. Ela passaria intacta
       com a família `activity` sem um único alvo de toque e sem uma única
       regra de movimento reduzido.

       Pior: o primeiro `includes` procurava um COMENTÁRIO. Comentário como
       evidência de implementação é a classe de defeito que este repositório
       já pagou três vezes.

       Hoje as propriedades VALEM — `.atlas-activity-hero-actions`,
       `.atlas-activity-source-details` e `.atlas-activity-periods button` têm
       44px, e há regra de movimento reduzido citando
       `.atlas-activity-recent-item`. Então o veredito não muda: o que muda é
       que agora ele pode mudar. */
    const semComentarios = styles.replace(/\/\*[\s\S]*?\*\//g, "");

    // 1. A timeline existe como regra, não como menção solta.
    const temTimeline = /\.atlas-activity-timeline\s*[,{]/.test(semComentarios);

    // 2. Algum controle DA FAMÍLIA activity entrega 44px ou mais.
    const alvoNaFamilia = [...semComentarios.matchAll(/(\.atlas-activity[^{}]*)\{([^}]*)\}/g)]
      .some(([, , corpo]) => {
        const h = corpo.match(/min-height:\s*(\d+)px/);
        return h ? Number(h[1]) >= 44 : false;
      });

    // 3. Alguma regra de movimento reduzido alcança a família activity.
    const movimentoReduzido = [...semComentarios.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
      .some(([, corpo]) => /atlas-activity/.test(corpo));

    return temTimeline && alvoNaFamilia && movimentoReduzido;
  })()],
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
