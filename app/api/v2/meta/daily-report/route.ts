import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildMetaCampaignIntelligence } from "@/lib/meta/campaign-intelligence";
import { logger } from "@/lib/observability/logger";
import { generateAIText } from "@/lib/ai/provider-router";
import { fetchMetaCampaignInsights } from "@/lib/meta/insights";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";

export const dynamic = "force-dynamic";

/**
 * RELATÓRIO DIÁRIO DE MÍDIA PARA O DIRETOR.
 *
 * ── POR QUE ESTE ARQUIVO MUDOU EM 02/08/2026 ────────────────────────────────
 *
 * A premissa com que eu comecei era "`meta_daily_reports` nunca teve linha".
 * ELA ESTÁ VENCIDA, e conferir antes de escrever mudou o trabalho inteiro.
 *
 * MEDIDO no banco em 02/08/2026 (projeto atlas-v3-homologacao,
 * pozbrcsfthnhmnebfoxv): `meta_daily_reports` tem 4 linhas, TODAS com
 * `status = 'ready'` — duas organizações em 01/08 e as mesmas duas em 02/08.
 * Este vigia roda, grava e responde 200. O problema dele não é morrer calado;
 * é o oposto, e é pior: ele entrega um relatório confiante feito de buracos.
 *
 * Nas mesmas 4 linhas, também medido:
 *
 *   · `payload.periods.month[0].spend` é `null` nas quatro. Nenhum número de
 *     gasto da Meta entrou em nenhum relatório.
 *   · `payload.aiConsensus[0].provider` é `"local"` e o modelo é
 *     `"deterministic-safe-fallback"` nas quatro. A metade "estratégica" do
 *     relatório do diretor é um texto enlatado de indisponibilidade — não uma
 *     análise. E o `aiConsensus` de fallback DESTA rota (`provider:
 *     "unavailable"`) nunca apareceu, porque quem caiu foi o roteador de
 *     provedores lá dentro, que resolve devolvendo texto em vez de lançar.
 *
 * Os dois casos saíram como `status: 'ready'` e HTTP 200, com `generated: 2`.
 * Um diretor lendo `spend: null` lê "não gastamos"; a verdade medida é "não
 * perguntamos". `atlas_worker_runs` tem 6 linhas e NENHUMA deste vigia.
 *
 * ── OS SILÊNCIOS QUE EXISTIAM, e onde cada um ficava ────────────────────────
 *
 * 1. As TRÊS consultas do `Promise.all` (leads, meta_conversion_events,
 *    campaign_events) vinham como `[{ data: leads }, { data: recentEvents },
 *    { data: followUps }]`: o `error` era jogado fora na desestruturação.
 *    Banco fora do ar virava `undefined`, `undefined` virava `[]`, e o
 *    relatório era gravado como PRONTO afirmando que não há lead nenhuma da
 *    Meta. Relatório errado é pior que relatório ausente — o ausente ninguém
 *    usa para decidir. Agora cada consulta é conferida e um erro vira `throw`.
 *
 * 2. `paidResults` (as 3 janelas de insights pagos) mapeava promessa rejeitada
 *    para `[]`. Token vencido, conta de anúncio errada e Graph fora do ar
 *    ficavam idênticos a "não houve gasto". É a repetição exata do caso das
 *    duas contas de anúncio: R$ 3.612 gastos e o produto respondendo R$ 0.
 *    Agora a rejeição é CONTADA, o primeiro motivo é preservado, e o payload
 *    carrega `evidenceGaps` para que a tela não leia ausência como zero.
 *
 * 3. `analyses` mapeava rejeição para um texto de fallback — e não contava
 *    nada. Somado ao fallback interno do roteador (`provider: "local"`), dava
 *    o que está medido acima: quatro relatórios "de IA" sem IA nenhuma, e
 *    nenhum número na resposta dizendo isso.
 *
 * 4. O `update` final tem `.eq("status", "generating")`, que é a trava contra
 *    escrita concorrente. Quando ela NÃO casa, o PostgREST não devolve erro:
 *    devolve zero linhas. O código lia "sem erro" e fazia `generated += 1`.
 *    Contava um relatório que não foi gravado. Agora ele pede as linhas de
 *    volta (`.select("id")`) e zero linha é falha, não sucesso.
 *
 * 5. A RPC de reserva podia devolver NENHUMA linha (não é o contrato dela,
 *    mas o código não exigia o contrato): `claimRows[0]` virava `undefined`,
 *    `!claim?.claimed` era verdadeiro e a organização entrava em `skipped`,
 *    indistinguível de "o relatório de hoje já está pronto".
 *
 * 6. `failed` era contado e devolvido DENTRO de um HTTP 200. O agendador
 *    (.github/workflows/atlas-vigias.yml) só olha o código: qualquer coisa
 *    diferente de 200 é FALHA e o job fica vermelho. Com 200, um relatório
 *    que falhou para todas as organizações não acendia nada. Agora vai 500.
 *
 * 7. A recusa por limite de chamadas (429) não deixava rastro nenhum, e ela é
 *    exatamente a execução que some: o vigia foi chamado, recusou, e a fila
 *    seguiu vazia sem explicação.
 *
 * 8. `ATLAS_CRON_SECRET` ausente devolve 401 para SEMPRE — mesma resposta de
 *    "token errado". A resposta continua igual (não se conta segredo a quem
 *    não se autenticou), mas agora o servidor registra a diferença no log.
 *
 * 9. `reportDate()` era chamado dentro do laço e de novo no fim. Com dois
 *    provedores de IA a 25s cada, uma execução que atravesse a meia-noite de
 *    São Paulo reservaria uma data e reportaria outra. Passou a ser uma só.
 *
 * ── POR QUE OS QUATRO DESFECHOS AGORA SÃO DISTINGUÍVEIS ─────────────────────
 *
 *   fora_da_janela  recusa declarada por limite de chamadas (429). Não é falha:
 *                   o vigia acordou e foi barrado por uma regra nossa.
 *   sem_trabalho    ou não há organização nenhuma, ou o relatório de hoje já
 *                   estava pronto para todas (`skipped`), com o motivo de cada
 *                   pulo contado em `puladosPorMotivo`. Não é falha.
 *   ok              gerou pelo menos um relatório. `motivo` ainda separa o
 *                   "ok" cheio de quatro degradações que antes passavam por
 *                   relatório completo: `ok_sem_dados_pagos`,
 *                   `ok_com_dados_pagos_incompletos`, `ok_sem_analise_de_ia` e
 *                   `ok_com_analise_de_ia_parcial`. O quarto é o estado MEDIDO
 *                   hoje — uma das duas análises voltou determinística.
 *   falhou          erro de consulta, RPC sem contrato, gravação que não pegou
 *                   ou exceção. Devolve 500 para o agendador acender.
 *
 * O padrão do registro vem de `app/api/v2/ai/nightly-handoff`. O `iniciadoEm`
 * é capturado ANTES da primeira decisão, porque "recusei" também é execução.
 *
 * NOTA HONESTA sobre o 429: `enforceRateLimit` devolve uma resposta pronta,
 * com `Retry-After` e o envelope de erro do produto. Reconstruí-la para
 * pendurar o `livro` no corpo mudaria o contrato de uma rota de segurança, e a
 * regra aqui é não mudar comportamento. Então naquele caminho o resultado do
 * registro vai para o log em vez do corpo — ele não é descartado, só não é
 * publicado. E ele só é escrito quando o chamador está autenticado: registrar
 * antes disso daria a qualquer anônimo uma escrita no livro por requisição.
 */
function authorized(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  return Boolean(
    process.env.ATLAS_CRON_SECRET && token === process.env.ATLAS_CRON_SECRET,
  );
}
function reportDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: NextRequest) {
  // O relógio começa ANTES de qualquer decisão — inclusive antes do limite de
  // chamadas. "Recusei por limite" também é execução, e é justamente a que some
  // sem deixar rastro.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou", resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "meta-daily-report", rota: "/api/v2/meta/daily-report", origem, iniciadoEm, desfecho, resposta, erro });

  // Rota de IA paga (cron): limite próprio para impedir consumo de orçamento de LLM em loop.
  const rate = enforceRateLimit(request, { limit: 15, windowMs: 60_000, scope: "meta-daily-report" });
  if (!rate.ok) {
    // A ordem NÃO muda: o 429 continua vindo antes do 401. Inverter faria um
    // chamador anônimo receber um código diferente do que recebe hoje.
    if (authorized(request)) {
      const registro = await livro("fora_da_janela", { motivo: "limite_de_chamadas", limite: 15, janelaMs: 60_000 });
      if (!registro.gravado) logger.error("meta.daily_report_livro_nao_gravado", { motivo: registro.motivo, detalhe: registro.detalhe });
    }
    return rate.response;
  }
  if (!authorized(request)) {
    // 401 por segredo AUSENTE e 401 por token errado são a mesma resposta para
    // quem chama — e devem ser. Para quem opera, não: sem o segredo o vigia
    // nunca roda, e isso não é um chamador curioso, é um deploy quebrado.
    if (!process.env.ATLAS_CRON_SECRET) logger.error("meta.daily_report_segredo_ausente", { rota: "/api/v2/meta/daily-report" });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // Uma data só para a execução inteira: reserva e resposta falando o mesmo dia.
  const dataDoRelatorio = reportDate();

  try {
    const admin = getSupabaseAdmin();
    const consultaDeOrganizacoes = await admin.from("organizations").select("id");
    if (consultaDeOrganizacoes.error) {
      const corpoDoErro = { error: consultaDeOrganizacoes.error.message, motivo: "consulta_de_organizacoes_falhou", reportDate: dataDoRelatorio };
      return NextResponse.json(
        { ...corpoDoErro, livro: await livro("falhou", corpoDoErro, consultaDeOrganizacoes.error.message) },
        { status: 500 },
      );
    }
    const organizations = consultaDeOrganizacoes.data ?? [];

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    // "Pulei" sem motivo é a mesma ambiguidade de "não rodei": aqui cada pulo
    // carrega o status que a RPC devolveu (ready, reviewed, generating…).
    const puladosPorMotivo: Record<string, number> = {};
    const falhas: { organizationId: string; motivo: string }[] = [];
    let periodosPagosPedidos = 0;
    let periodosPagosFalhos = 0;
    let primeiraFalhaPaga: string | null = null;
    let analisesPedidas = 0;
    let analisesIndisponiveis = 0;
    let analisesDeterministicas = 0;
    let marcasDeFalhaNaoGravadas = 0;

    for (const organization of organizations) {
      let reportId: string | null = null;
      try {
        const reserva = await admin.rpc(
          "claim_meta_daily_report",
          { p_organization_id: organization.id, p_report_date: dataDoRelatorio },
        );
        if (reserva.error) throw reserva.error;
        const claim = (Array.isArray(reserva.data) ? reserva.data[0] : reserva.data) as {
          report_id?: string;
          claimed?: boolean;
          reason?: string;
        } | null;
        // A RPC devolve SEMPRE uma linha (created, retry ou o status atual).
        // Nenhuma linha é quebra de contrato, não "já está pronto" — e cair no
        // `skipped` abaixo enterraria a diferença.
        if (!claim) throw new Error("claim_meta_daily_report não devolveu linha para a organização.");
        if (!claim?.claimed || !claim.report_id) {
          skipped += 1;
          const motivoDoPulo = String(claim.reason || "sem_motivo");
          puladosPorMotivo[motivoDoPulo] = (puladosPorMotivo[motivoDoPulo] || 0) + 1;
          continue;
        }
        reportId = claim.report_id;
        const since = new Date(Date.now() - 86_400_000).toISOString();
        const [consultaDeLeads, consultaDeEventos, consultaDeSeguimentos] =
          await Promise.all([
            admin
              .from("leads")
              .select("status,score,metadata,created_at,last_interaction_at")
              .eq("organization_id", organization.id)
              .eq("source", "Meta Lead Ads")
              .limit(5000),
            admin
              .from("meta_conversion_events")
              .select("status,event_name")
              .eq("organization_id", organization.id)
              .gte("created_at", since)
              .limit(1000),
            admin
              .from("campaign_events")
              .select("payload")
              .eq("organization_id", organization.id)
              .in("source", ["crm-funnel", "crm-followup"])
              .gte("occurred_at", since)
              .limit(1000),
          ]);
        // Sem estes três `throw`, banco fora do ar produzia um relatório PRONTO
        // dizendo que a Meta não trouxe lead nenhuma.
        if (consultaDeLeads.error) throw consultaDeLeads.error;
        if (consultaDeEventos.error) throw consultaDeEventos.error;
        if (consultaDeSeguimentos.error) throw consultaDeSeguimentos.error;
        const leads = consultaDeLeads.data;
        const recentEvents = consultaDeEventos.data;
        const followUps = consultaDeSeguimentos.data;
        const now = Date.now();
        const paidResults = await Promise.allSettled([
          fetchMetaCampaignInsights(1),
          fetchMetaCampaignInsights(7),
          fetchMetaCampaignInsights(30),
        ]);
        // Rejeição aqui virava `[]`, e `[]` vira `spend: null` no relatório:
        // "não perguntamos" lido como "não gastamos". Continua não sendo fatal
        // — a inteligência do lado do CRM ainda vale —, mas para de ser mudo.
        const falhasPagasDaOrganizacao = paidResults.filter((resultado) => resultado.status === "rejected").length;
        periodosPagosPedidos += paidResults.length;
        periodosPagosFalhos += falhasPagasDaOrganizacao;
        for (const resultado of paidResults) {
          if (resultado.status === "rejected" && !primeiraFalhaPaga) primeiraFalhaPaga = String(resultado.reason).slice(0, 300);
        }
        if (falhasPagasDaOrganizacao) {
          logger.error("meta.daily_report_insights_pagos_indisponiveis", {
            organizationId: organization.id,
            falharam: falhasPagasDaOrganizacao,
            de: paidResults.length,
          });
        }
        const paid = paidResults.map((result) =>
          result.status === "fulfilled" ? result.value : [],
        );
        const period = (days: number, insights: (typeof paid)[number]) =>
          buildMetaCampaignIntelligence(
            (leads ?? []).filter(
              (lead) =>
                lead.created_at &&
                new Date(lead.created_at).getTime() >= now - days * 86_400_000,
            ),
            insights,
          );
        const periods = {
          day: period(1, paid[0]),
          week: period(7, paid[1]),
          month: period(30, paid[2]),
        };
        const campaigns = periods.month;
        const signalCounts: Record<string, number> = {};
        for (const event of followUps ?? []) {
          const payload =
            event.payload && typeof event.payload === "object"
              ? (event.payload as Record<string, unknown>)
              : {};
          for (const signal of Array.isArray(payload.decision_signals)
            ? payload.decision_signals
            : [])
            if (
              typeof signal === "string" &&
              signal !== "motivo_nao_classificado"
            )
              signalCounts[signal] = (signalCounts[signal] || 0) + 1;
        }
        const recommendations = campaigns
          .filter((campaign) => campaign.sampleStatus !== "insufficient")
          .slice(0, 10)
          .map((campaign) => ({
            campaignId: campaign.campaignId,
            recommendation: campaign.recommendation,
            qualityRate: campaign.qualityRate,
            conversionRate: campaign.conversionRate,
            decisionRequired: true,
          }));
        const topSignals = Object.entries(signalCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([signal, count]) => ({ signal, count }));
        const anonymousEvidence = {
          periods: Object.fromEntries(
            Object.entries(periods).map(([key, rows]) => [
              key,
              rows
                .slice(0, 10)
                .map((row, index) => ({
                  campaign: `campaign_${index + 1}`,
                  total: row.total,
                  qualityRate: row.qualityRate,
                  conversionRate: row.conversionRate,
                  averageResponseMinutes: row.averageResponseMinutes,
                  responseCoverage: row.responseCoverage,
                  sla5Rate: row.sla5Rate,
                  sla15Rate: row.sla15Rate,
                  performanceScore: row.performanceScore,
                  sampleStatus: row.sampleStatus,
                })),
            ]),
          ),
          topSignals,
        };
        const aiInput = JSON.stringify(anonymousEvidence);
        const analyses = await Promise.allSettled([
          generateAIText({
            task: "reasoning",
            organizationId: organization.id,
            feature: "meta_daily_director_report",
            system:
              "Você é um estrategista sênior de mídia imobiliária. Analise somente agregados. Diferencie fatos, hipóteses e testes. Não recomende mudanças automáticas e nunca invente custo, ROAS ou causalidade.",
            prompt: `Produza recomendações executivas curtas para decisão do diretor, comparando dia, semana e mês: ${aiInput}`,
            containsPersonalData: false,
            timeoutMs: 25_000,
          }),
          generateAIText({
            task: "research",
            organizationId: organization.id,
            feature: "meta_daily_market_research",
            system:
              "Pesquise práticas atuais oficiais e confiáveis para Meta Advantage+, Conversions API, criativos e otimização de leads imobiliários. Use os agregados anônimos apenas para contexto. Não presuma causalidade.",
            prompt: `Traga até 5 sugestões atuais que possam ser testadas pelo diretor: ${aiInput}`,
            containsPersonalData: false,
            timeoutMs: 25_000,
          }),
        ]);
        const aiConsensus = analyses.map((result) =>
          result.status === "fulfilled"
            ? {
                provider: result.value.provider,
                model: result.value.model,
                analysis: result.value.text,
                citations: result.value.citations,
              }
            : {
                provider: "unavailable",
                model: "fallback",
                analysis:
                  "Análise externa indisponível; usar recomendações determinísticas do cockpit.",
                citations: [],
              },
        );
        // Duas formas de "sem IA", e elas são diferentes: a promessa REJEITOU
        // (rede, timeout) ou o roteador de provedores resolveu devolvendo o
        // texto determinístico (`provider: "local"` — teto de orçamento,
        // provedor fora, guarda de entrada). A segunda é a que está medida nos
        // 4 relatórios já gravados, e ela nunca aparecia em número nenhum.
        const analisesRejeitadasDaOrganizacao = analyses.filter((resultado) => resultado.status === "rejected").length;
        const analisesLocaisDaOrganizacao = aiConsensus.filter((analise) => analise.provider === "local").length;
        analisesPedidas += analyses.length;
        analisesIndisponiveis += analisesRejeitadasDaOrganizacao;
        analisesDeterministicas += analisesLocaisDaOrganizacao;
        if (analisesRejeitadasDaOrganizacao || analisesLocaisDaOrganizacao) {
          logger.error("meta.daily_report_analise_sem_ia", {
            organizationId: organization.id,
            rejeitadas: analisesRejeitadasDaOrganizacao,
            deterministicas: analisesLocaisDaOrganizacao,
            de: analyses.length,
          });
        }
        const payload = {
          generatedAt: new Date().toISOString(),
          windowHours: 24,
          periods,
          campaigns,
          recommendations,
          topSignals,
          aiConsensus,
          // O que o relatório NÃO conseguiu perguntar, dito dentro do próprio
          // relatório: quem lê o payload precisa distinguir "gasto zero" de
          // "não obtivemos o gasto" sem ter de ler o log do servidor.
          evidenceGaps: {
            paidPeriodsRequested: paidResults.length,
            paidPeriodsFailed: falhasPagasDaOrganizacao,
            aiAnalysesRequested: analyses.length,
            aiAnalysesUnavailable: analisesRejeitadasDaOrganizacao,
            aiAnalysesDeterministic: analisesLocaisDaOrganizacao,
          },
          delivery: (recentEvents ?? []).reduce(
            (total, event) => ({
              ...total,
              [event.status]: (total[event.status] || 0) + 1,
            }),
            {} as Record<string, number>,
          ),
          governance: {
            decisionRole: "director",
            automaticCampaignChanges: false,
            evidenceOnly: true,
          },
        };
        const marcouPronto = await admin
          .from("meta_daily_reports")
          .update({
            status: "ready",
            payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", reportId)
          .eq("organization_id", organization.id)
          .eq("status", "generating")
          .select("id");
        if (marcouPronto.error) throw marcouPronto.error;
        // Zero linha aqui não é erro do PostgREST: é a trava `status =
        // 'generating'` não tendo casado. O relatório NÃO foi gravado, e
        // `generated += 1` estava contando esse caso como sucesso.
        if (!marcouPronto.data?.length)
          throw new Error("relatório não foi marcado como pronto: nenhuma linha em 'generating' correspondeu à reserva.");
        generated += 1;
      } catch (reportError) {
        failed += 1;
        falhas.push({ organizationId: organization.id, motivo: String(reportError).slice(0, 300) });
        // Este é o registro de que o relatório FALHOU. Se ele próprio falhar em
        // silêncio, o relatório fica preso no estado anterior e a falha não
        // existe para ninguém — mesma forma da carta morta do outbox: não há
        // camada abaixo desta para pegar.
        //
        // O `if` era de uma linha só, sem chaves. Ao capturar o retorno numa
        // `const` eu o transformei em bloco sem abrir bloco, e o `tsc` reprovou
        // com "'const' declarations can only be declared inside a block". Vale
        // registrar: o portão `vigia-silencio:check` ficou VERDE nesse estado,
        // porque ele lê a FORMA do código e não o compila. Catraca não substitui
        // degrau — a escada tem os dois.
        if (reportId) {
          const marcouFalha = await admin
            .from("meta_daily_reports")
            .update({
              status: "failed",
              payload: {
                failedAt: new Date().toISOString(),
                reason: "generation_failed",
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", reportId)
            .eq("organization_id", organization.id);
          if (marcouFalha.error) {
            marcasDeFalhaNaoGravadas += 1;
            logger.error("meta.daily_report_falha_nao_gravada", { code: marcouFalha.error.code });
          }
        }
        logger.error("meta.daily_report_failed", reportError, {
          organizationId: organization.id,
        });
      }
    }

    // `motivo` existe para que "não fiz nada" — e "fiz pela metade" — nunca
    // mais sejam ambíguos. Inteiro antes de parcial, e dado pago antes de
    // análise: o número de dinheiro é o que move verba.
    //
    // O caso PARCIAL não é hipótese: nos 4 relatórios medidos hoje, UMA das
    // duas análises voltou determinística e a outra veio da Perplexity. Se este
    // rótulo só reagisse ao caso inteiro, o estado real de hoje continuaria
    // saindo como "ok" limpo.
    const semAnaliseReal = analisesIndisponiveis + analisesDeterministicas;
    const motivo = failed
      ? "relatorios_falharam"
      : organizations.length === 0
        ? "sem_organizacoes"
        : generated === 0
          ? "todos_ja_prontos"
          : periodosPagosFalhos > 0 && periodosPagosFalhos === periodosPagosPedidos
            ? "ok_sem_dados_pagos"
            : periodosPagosFalhos > 0
              ? "ok_com_dados_pagos_incompletos"
              : semAnaliseReal > 0 && semAnaliseReal === analisesPedidas
                ? "ok_sem_analise_de_ia"
                : semAnaliseReal > 0
                  ? "ok_com_analise_de_ia_parcial"
                  : "ok";

    const corpo = {
      reportDate: dataDoRelatorio,
      organizations: organizations.length,
      generated,
      skipped,
      failed,
      puladosPorMotivo,
      dadosPagos: { pedidos: periodosPagosPedidos, falharam: periodosPagosFalhos, primeiraFalha: primeiraFalhaPaga },
      analisesDeIA: { pedidas: analisesPedidas, indisponiveis: analisesIndisponiveis, deterministicas: analisesDeterministicas },
      marcasDeFalhaNaoGravadas,
      motivo,
      // Contrato auditável: este vigia não altera campanha nem move verba.
      automaticCampaignChanges: false,
    };

    if (failed) {
      logger.error("meta.daily_report_relatorios_falharam", { failed, primeiro: falhas[0]?.motivo });
      // Era 200 com `failed: N` no corpo. O agendador só olha o código HTTP —
      // com 200 ele passava verde por cima de um relatório que não existe.
      return NextResponse.json({ ...corpo, falhas, livro: await livro("falhou", corpo) }, { status: 500 });
    }
    // `sem_trabalho` NÃO é falha: ou não há organização, ou o relatório do dia
    // já estava pronto para todas. É o desfecho que se confundia com "nunca
    // rodou" — e, medido hoje, é o que uma segunda chamada no mesmo dia produz.
    return NextResponse.json({ ...corpo, livro: await livro(generated ? "ok" : "sem_trabalho", corpo) });
  } catch (erro) {
    logger.error("meta.daily_report_worker_failed", erro);
    const registro = await livro("falhou", { reportDate: dataDoRelatorio }, String(erro));
    return NextResponse.json(
      { error: "Falha ao gerar o relatório diário da Meta.", motivo: "excecao", reportDate: dataDoRelatorio, livro: registro },
      { status: 500 },
    );
  }
}
