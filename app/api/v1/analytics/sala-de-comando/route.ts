/**
 * SALA DE COMANDO — os números do topo e o funil, medidos.
 *
 * ── POR QUE ESTA ROTA EXISTE, E O QUE ELA SE RECUSA A FAZER ─────────────────
 *
 * O layout pedido mostra seis indicadores e um funil de seis etapas. Medido na
 * organização real em 2026-07-30:
 *
 *   novo 336 · contato 27 · qualificacao 6 · visita 0 · proposta 0
 *   negociacao 0 · ganho 1 · perdido 110
 *
 * Três das seis etapas do funil estão VAZIAS, e 336 das 482 leads nunca saíram de
 * "novo". Um funil desenhado sobre isso mostra três barras de largura zero — e a
 * tentação, sempre, é preencher com número de exemplo para a tela "ficar bonita".
 *
 * Esta rota devolve o zero E o motivo dele. Zero com explicação é diagnóstico;
 * zero mudo é uma tela que parece quebrada; número inventado é mentira que vira
 * decisão de verba.
 *
 * ── A CONVERSÃO SÓ É AFIRMADA QUANDO PODE SER ──────────────────────────────
 *
 * Uma venda em 482 leads dá 0,21%. Com amostra de UMA, esse número não distingue
 * uma operação de 0,2% de uma de 2%: ganhar a segunda venda dobraria a taxa. Por
 * isso `conversao.afirmavel` viaja junto — a tela mostra a taxa OU diz que ainda
 * não dá para afirmar, e nunca imprime um percentual com cara de medida.
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { canonicalPipelineStage, mergePipelineStageSettings } from "@/lib/atlas/pipeline-stages";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { reconciliaInvestimento, type GastoDeCampanha, type LeadsDeCampanha } from "@/lib/marketing/reconciliacao-de-investimento";

type LeadRow = {
  id: string;
  status: string | null;
  assigned_to: string | null;
  assigned_user_id: string | null;
  created_at: string | null;
  sale_value_brl: number | null;
  development_id: string | null;
  first_contacted_at: string | null;
};
type GastoRow = {
  amount: number | string | null;
  spend_date: string | null;
  campaign_id: string | null;
  /**
   * O PostgREST TIPA todo relacionamento embutido como array, mas ENTREGA um
   * objeto quando a relação é muitos-para-um. Declarar só uma das formas obriga
   * a um cast que mente sobre o dado; declarar as duas e normalizar na leitura
   * é o que sobrevive aos dois comportamentos.
   */
  marketing_campaigns:
    | { external_campaign_id: string | null; name: string | null }
    | { external_campaign_id: string | null; name: string | null }[]
    | null;
};
type AtribuicaoRow = { lead_id: string | null; campaign_external_id: string | null };
type MovimentoRow = {
  lead_id: string | null;
  from_stage: string | null;
  to_stage: string | null;
  reason: string | null;
  occurred_at: string | null;
};

export const dynamic = "force-dynamic";

/**
 * ── AS ETAPAS VÊM DA ORGANIZAÇÃO, NÃO DAQUI ────────────────────────────────
 *
 * A primeira versão desta rota cravou seis etapas no código, entre elas
 * `negociacao`. Medido em 2026-07-30 contra `pipeline_stage_settings` da
 * organização real: `negociacao` NÃO EXISTE — as etapas configuradas são novo,
 * contato, qualificação, visita, proposta e CONTRATO. A régua canônica
 * (`lib/atlas/pipeline-stages.ts`) trata `negociacao` como ALIAS de `proposta`,
 * não como etapa.
 *
 * Consequência do array cravado: a tela desenhava uma barra impossível (nenhum
 * lead pode ter um status que a organização não configurou) e escondia a etapa
 * `contrato`, por onde 3 leads passaram de fato. Foi uma terceira verdade sobre
 * o mesmo funil, criada por mim, ao lado da régua canônica e da configuração.
 *
 * Agora: `mergePipelineStageSettings` cruza a configuração da organização com a
 * régua canônica, e só as etapas ABERTAS e visíveis entram no funil — ganho,
 * perdido e comprou_outro são saída, não etapa.
 */

/** Abaixo disto, uma taxa de conversão é ruído estatístico com cara de medida. */
const VENDAS_PARA_AFIRMAR_TAXA = 5;

/**
 * Status da lead → chave canônica. Absorve `negociacao`→`proposta`, `won`→`ganho`
 * e os demais apelidos.
 *
 * Esta rota tinha um `normalizar()` próprio (minúsculas + sem acento) usado em
 * paralelo com a régua. Ele não resolvia apelido: uma lead `won` contava como
 * ganha no funil e NÃO contava no VGV. Ficou UMA função só de propósito — duas
 * normalizações no mesmo arquivo é como a divergência nasce.
 */
const etapaDaLead = (status: unknown) => canonicalPipelineStage(status) ?? "novo";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "analytics.sala-de-comando" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, { roles: ["admin", "director", "superintendent", "manager"] });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();

  // `.limit(5000)` era LETRA MORTA: o PostgREST corta em 1000 sem erro, e o
  // agregado sairia errado em silêncio assim que a base passasse disso. Hoje são
  // 482 leads e o número coincidia — é o pior tipo de bug, o que só aparece
  // quando a operação cresce. `fetchAllRows` é o helper canônico e carrega a
  // flag de truncamento, que viaja até a tela.
  const [leadsPaginados, configuracao, movimentosPaginados, gastoPaginado, atribuicaoPaginada] = await Promise.all([
    fetchAllRows<LeadRow>((from, to) =>
      admin
        .from("leads")
        .select("id,status,assigned_to,assigned_user_id,created_at,sale_value_brl,development_id,first_contacted_at")
        .eq("organization_id", organizationId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    admin
      .from("pipeline_stage_settings")
      .select("stage_key,label,probability,position,visible")
      .eq("organization_id", organizationId),
    // "Já passaram por aqui" só existe porque esta tabela existe. Ela é NOVA: a
    // janela real viaja na resposta, senão "0 já passaram" mentiria sobre tudo
    // que aconteceu antes de o registro começar.
    fetchAllRows<MovimentoRow>((from, to) =>
      admin
        .from("pipeline_stage_moves")
        .select("lead_id,from_stage,to_stage,reason,occurred_at")
        .eq("organization_id", organizationId)
        .order("occurred_at", { ascending: true })
        .range(from, to),
    ),
    // ── O LADO DA COMPRA, que até 31/07/2026 não tinha como ser respondido ──
    //
    // O comentário que ficava aqui dizia que `marketing_spend` tinha ZERO linhas
    // e que por isso CPL e ROAS seriam inventados. Isso deixou de ser verdade
    // quando o importador passou a gravar: 94 linhas, R$ 3.612,01, 7 campanhas.
    //
    // O que NÃO deixou de ser verdade é a cautela. Ter gasto não basta para
    // afirmar custo por lead — é preciso que o gasto e a lead sejam da MESMA
    // campanha. Quem decide isso é `reconciliaInvestimento`, e ele recusa
    // quando as pontas não se encontram.
    fetchAllRows<GastoRow>((from, to) =>
      admin
        .from("marketing_spend")
        .select("amount,spend_date,campaign_id,marketing_campaigns(external_campaign_id,name)")
        .eq("organization_id", organizationId)
        .order("spend_date", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<AtribuicaoRow>((from, to) =>
      admin
        .from("lead_attribution_touches")
        .select("lead_id,campaign_external_id")
        .eq("organization_id", organizationId)
        .not("campaign_external_id", "is", null)
        .order("lead_id", { ascending: true })
        .range(from, to),
    ),
  ]);
  const { rows: data, error } = leadsPaginados;

  // Leitura que falhou não pode virar "operação vazia": a tela diria que não há
  // lead nenhuma sobre uma consulta que ninguém conseguiu fazer.
  if (error) {
    return apiError("SALA_DE_COMANDO_INDISPONIVEL", "Não foi possível medir a operação agora.", identity.meta, {
      status: 503,
      details: { motivo: error.message },
    });
  }

  const leads = data ?? [];
  const porEtapa = new Map<string, number>();
  for (const lead of leads) {
    // `etapaDaLead` normaliza pela régua canônica — é ela que sabe que
    // `negociacao` é apelido de `proposta`. `normalizar` sozinho deixaria um
    // status apelidado cair num balde que a tela nunca desenha.
    const st = etapaDaLead(lead.status);
    porEtapa.set(st, (porEtapa.get(st) ?? 0) + 1);
  }

  /**
   * ── QUEM JÁ PASSOU POR AQUI ────────────────────────────────────────────────
   *
   * Sem isto, a etapa vazia recebia a frase "o funil não está travado aqui, ele
   * não chegou até aqui" — que a medição REFUTOU: 2 leads alcançaram visita, 3
   * alcançaram proposta e 3 alcançaram contrato. Elas chegaram e saíram.
   *
   * "Não chegou" e "chegou e vazou" mandam a direção fazer coisas OPOSTAS: a
   * primeira manda empurrar topo de funil, a segunda manda descobrir quem largou
   * a lead depois da visita. Uma frase honesta na forma e falsa no conteúdo é
   * pior que barra muda, porque convence.
   */
  const jaPassaram = new Map<string, Set<string>>();
  for (const mov of movimentosPaginados.rows) {
    const destino = canonicalPipelineStage(mov.to_stage);
    if (!destino || !mov.lead_id) continue;
    if (!jaPassaram.has(destino)) jaPassaram.set(destino, new Set());
    jaPassaram.get(destino)!.add(mov.lead_id);
  }
  const inicioDoRegistro = movimentosPaginados.rows[0]?.occurred_at ?? null;
  const registroDeMovimentoMensuravel = !movimentosPaginados.error;

  // As etapas ABERTAS e visíveis que a organização configurou, na ordem dela.
  // ganho/perdido/comprou_outro ficam fora: são saída do funil, não etapa dele.
  const etapasDaOrganizacao = mergePipelineStageSettings(configuracao.data ?? []).filter(
    (etapa) => etapa.outcome === "open" && etapa.visible,
  );

  const ganhos = porEtapa.get("ganho") ?? 0;
  const perdidos = porEtapa.get("perdido") ?? 0;
  const emAberto = etapasDaOrganizacao.reduce((soma, e) => soma + (porEtapa.get(e.key) ?? 0), 0);
  const topo = porEtapa.get("novo") ?? 0;

  const dataDoRegistro = inicioDoRegistro
    ? new Date(inicioDoRegistro).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : null;

  const funil = etapasDaOrganizacao.map((etapa) => {
    const quantidade = porEtapa.get(etapa.key) ?? 0;
    const passaram = jaPassaram.get(etapa.key)?.size ?? 0;
    return {
      chave: etapa.key,
      rotulo: etapa.label,
      quantidade,
      /** Quantas leads DISTINTAS já alcançaram esta etapa, desde que há registro. */
      jaPassaram: passaram,
      /** Proporção contra o TOPO do funil, que é como funil se lê. */
      percentualDoTopo: topo > 0 ? Math.round((quantidade / topo) * 1000) / 10 : null,
      // Três frases, três diagnósticos diferentes. A do meio é a que faltava.
      porqueVazia:
        quantidade > 0
          ? null
          : !registroDeMovimentoMensuravel
            ? "Nenhuma lead nesta etapa agora. Não foi possível ler o histórico de movimentação, então não dá para dizer se alguma já passou por aqui."
            : passaram > 0
              ? `Nenhuma lead aqui agora, mas ${passaram} já passaram por esta etapa${dataDoRegistro ? ` desde ${dataDoRegistro}` : ""}. A etapa esvaziou — o funil vazou aqui, não deixou de chegar.`
              : `Nenhuma lead aqui, e nenhuma passou por esta etapa${dataDoRegistro ? ` desde ${dataDoRegistro}, quando o registro de movimentação começou` : ""}. ${topo} das ${leads.length} ainda estão em "novo".`,
    };
  });

  // Dinheiro na mesa: as etapas em que já existe oferta viva. Nesta régua são
  // `proposta` e `contrato` — `negociacao` NÃO entra, porque é apelido de
  // `proposta` e somá-la contaria a mesma lead duas vezes.
  const emNegociacao = (porEtapa.get("proposta") ?? 0) + (porEtapa.get("contrato") ?? 0);

  // ATENÇÃO: aqui era `normalizar(l.status) === "ganho"`, enquanto `porEtapa`
  // acima já usava a régua canônica. Uma lead com status `won` (apelido de
  // `ganho`) contava como ganha no funil e NÃO contava no VGV — dois caminhos
  // divergentes sobre o mesmo fato, dentro da mesma rota, que é a doença que
  // este projeto mais paga. Os três passam a ler pela mesma régua.
  const ganhasDeVerdade = leads.filter((l) => etapaDaLead(l.status) === "ganho");
  const vgvFechado = ganhasDeVerdade
    .filter((l) => Number(l.sale_value_brl) > 0)
    .reduce((soma, l) => soma + Number(l.sale_value_brl), 0);

  const semValor = ganhasDeVerdade.filter((l) => !(Number(l.sale_value_brl) > 0)).length;

  const donos = new Set(leads.map((l) => l.assigned_to ?? l.assigned_user_id).filter(Boolean));
  const comPrimeiroContato = leads.filter((l) => l.first_contacted_at).length;

  /**
   * ── POR ONDE A VERBA VAZA, MEDIDO PELO ÚNICO LADO QUE TEM DADO ─────────────
   *
   * A pergunta da direção é "onde estou desperdiçando dinheiro de anúncio". O
   * lado da COMPRA não tem como responder: `marketing_spend`, `campaigns`,
   * `meta_daily_reports` e `product_budgets` têm ZERO linhas. Sem custo não há
   * CPL, não há ROAS, e qualquer comparação de campanha seria inventada.
   *
   * O lado do ATENDIMENTO tem dado, e responde uma pergunta melhor: as leads que
   * saíram do funil chegaram a ser trabalhadas? Medido em 2026-07-30: das 104
   * saídas registradas, 100 nunca receberam um primeiro contato, e o tempo médio
   * entre chegar e ser descartada foi de 23 dias. Nenhum descarte foi impulsivo.
   *
   * Isso muda a decisão: não é "a campanha é ruim, troque de agência" — é "a
   * lead foi comprada, guardada três semanas e descartada sem uma ligação".
   * Comprar mais mídia antes de atender é jogar dinheiro no mesmo buraco.
   */
  const SAIDAS = new Set(["perdido", "comprou_outro"]);
  const leadPorId = new Map(leads.map((l) => [l.id, l]));
  const saidas = movimentosPaginados.rows.filter((m) => {
    const destino = canonicalPipelineStage(m.to_stage);
    return destino !== null && SAIDAS.has(destino);
  });

  const diasAteSair: number[] = [];
  let semPrimeiroContato = 0;
  let semMotivo = 0;
  let direitoDeNovo = 0;
  for (const m of saidas) {
    const lead = m.lead_id ? leadPorId.get(m.lead_id) : undefined;
    if (lead && !lead.first_contacted_at) semPrimeiroContato += 1;
    if (!m.reason || !String(m.reason).trim()) semMotivo += 1;
    if (canonicalPipelineStage(m.from_stage) === "novo") direitoDeNovo += 1;
    if (lead?.created_at && m.occurred_at) {
      const dias = (new Date(m.occurred_at).getTime() - new Date(lead.created_at).getTime()) / 86_400_000;
      if (Number.isFinite(dias) && dias >= 0) diasAteSair.push(dias);
    }
  }
  /**
   * ── RECONCILIAÇÃO ENTRE O DINHEIRO E AS LEADS ─────────────────────────────
   *
   * Uma lead pode ter mais de um toque de atribuição; contar linha contaria a
   * mesma lead duas vezes e faria o CPL cair pela metade. A contagem é de leads
   * DISTINTAS por campanha.
   *
   * Uma lead tocada por duas campanhas conta em cada uma — é a leitura por
   * campanha, não uma repartição de crédito. Repartir exigiria um modelo de
   * atribuição que este produto não tem, e inventar um aqui seria a quinta
   * verdade sobre a mesma lead.
   */
  const leadsPorCampanhaExterna = new Map<string, Set<string>>();
  for (const toque of atribuicaoPaginada.rows) {
    const externo = toque.campaign_external_id;
    if (!externo || !toque.lead_id) continue;
    if (!leadsPorCampanhaExterna.has(externo)) leadsPorCampanhaExterna.set(externo, new Set());
    leadsPorCampanhaExterna.get(externo)!.add(toque.lead_id);
  }
  const gastosPorCampanha: GastoDeCampanha[] = gastoPaginado.rows.flatMap((linha) => {
    const bruto = linha.marketing_campaigns;
    const campanha = Array.isArray(bruto) ? bruto[0] ?? null : bruto;
    const externo = campanha?.external_campaign_id;
    if (!externo) return [];
    return [{
      externalId: externo,
      nome: campanha?.name || `Campanha ${externo}`,
      reais: Number(linha.amount) || 0,
      de: linha.spend_date,
      ate: linha.spend_date,
    }];
  });
  const leadsPorCampanha: LeadsDeCampanha[] = [...leadsPorCampanhaExterna.entries()].map(([externalId, leads]) => ({ externalId, leads: leads.size }));
  const investimento = {
    ...reconciliaInvestimento(gastosPorCampanha, leadsPorCampanha),
    /** Sem linha nenhuma, a tela precisa saber que é ausência de importação. */
    importado: gastoPaginado.rows.length > 0,
    amostraTruncada: gastoPaginado.truncated || atribuicaoPaginada.truncated,
  };

  const arredonda = (n: number) => Math.round(n * 10) / 10;
  const saidasDoFunil = {
    total: saidas.length,
    semPrimeiroContato,
    semMotivoEscrito: semMotivo,
    direitoDeNovo,
    diasAteSair: diasAteSair.length
      ? {
          media: arredonda(diasAteSair.reduce((s, d) => s + d, 0) / diasAteSair.length),
          minimo: arredonda(Math.min(...diasAteSair)),
          maximo: arredonda(Math.max(...diasAteSair)),
          medidas: diasAteSair.length,
        }
      : null,
    /** Sem isto, "0 saídas" leria como "ninguém desistiu" em vez de "não medimos". */
    mensuravel: registroDeMovimentoMensuravel,
  };

  return apiSuccess(
    {
      indicadores: {
        leadsTotais: leads.length,
        emAberto,
        emAtendimento: porEtapa.get("contato") ?? 0,
        emNegociacao,
        vgvFechado,
        // O VGV que a tela do mockup chama "em negociação" é R$ 0 aqui, e o
        // motivo importa mais que o número: não há lead em proposta.
        vgvEmNegociacaoIndisponivel:
          emNegociacao === 0 ? "Nenhuma lead em proposta ou contrato — não há VGV em disputa para somar." : null,
        vendasSemValorInformado: semValor,
        corretoresComCarteira: donos.size,
        comPrimeiroContato,
      },
      conversao: {
        ganhos,
        perdidos,
        base: leads.length,
        taxa: leads.length > 0 ? Math.round((ganhos / leads.length) * 10000) / 100 : null,
        /**
         * Com uma venda, a taxa não distingue 0,2% de 2%: a segunda venda a
         * dobraria. A tela mostra a taxa OU diz que não dá para afirmar.
         */
        afirmavel: ganhos >= VENDAS_PARA_AFIRMAR_TAXA,
        porqueNaoAfirmavel:
          ganhos >= VENDAS_PARA_AFIRMAR_TAXA
            ? null
            : `${ganhos} venda${ganhos === 1 ? "" : "s"} fechada${ganhos === 1 ? "" : "s"}: a próxima mudaria a taxa em mais de 100%. Abaixo de ${VENDAS_PARA_AFIRMAR_TAXA} vendas isto é contagem, não taxa.`,
      },
      funil,
      saidasDoFunil,
      investimento,
      /**
       * ── O QUE ESTES NÚMEROS *NÃO* COBREM ────────────────────────────────
       *
       * Medida sem procedência é medida que engana quando a base cresce ou
       * quando alguém pergunta "desde quando?". Estes três campos existem para
       * a tela poder responder isso sem que ninguém precise abrir o código.
       */
      procedencia: {
        /** true = o PostgREST cortou a leitura e os agregados estão sobre amostra. */
        amostraTruncada: leadsPaginados.truncated,
        /** Desde quando existe registro de movimentação. Antes disto: cego. */
        registroDeMovimentoDesde: inicioDoRegistro,
        registroDeMovimentoMensuravel,
        movimentosLidos: movimentosPaginados.rows.length,
      },
      geradoEm: new Date().toISOString(),
    },
    identity.meta,
  );
}
