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
import {
  comparacaoDeEstado,
  coorteDeEntrada,
  declaraLeituras,
  medidaDoInvestimento,
  montaEtapasDoFunil,
} from "@/lib/atlas/sala-de-comando-medicao";

type LeadRow = {
  id: string;
  status: string | null;
  assigned_to: string | null;
  assigned_user_id: string | null;
  created_at: string | null;
  sale_value_brl: number | null;
  development_id: string | null;
  first_contacted_at: string | null;
  /**
   * ── A COLUNA QUE IMPEDE UM DELTA DE MENTIR ──────────────────────────────
   *
   * Medido em 02/08/2026 na organização real: 406 leads criadas nos últimos 30
   * dias contra 59 nos 30 anteriores. Seiscentos por cento de "crescimento" —
   * e 270 dessas 406 entraram num ÚNICO lote de importação, em seis minutos.
   *
   * O delta é aritmeticamente correto e semanticamente falso: ele mede
   * IMPORTAÇÃO, não demanda. Sem esta coluna viajando junto, o número sai
   * como se o mercado tivesse sextuplicado. Com ela, a tela consegue dizer
   * "leads criadas na base" e mostrar o lote ao lado.
   */
  import_batch_id: string | null;
};
type DevelopmentRow = { id: string; name: string | null };
type ProfileRow = { id: string; name: string | null; full_name: string | null; active: boolean | null };
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
  const [leadsPaginados, configuracao, movimentosPaginados, gastoPaginado, atribuicaoPaginada, empreendimentos, perfis] = await Promise.all([
    fetchAllRows<LeadRow>((from, to) =>
      admin
        .from("leads")
        .select("id,status,assigned_to,assigned_user_id,created_at,sale_value_brl,development_id,first_contacted_at,import_batch_id")
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
    /**
     * ── AS DUAS ÚNICAS CONSULTAS NOVAS DESTA ROTA, E POR QUE ELAS SÃO NOMES ──
     *
     * `leads.development_id` e `leads.assigned_to` já viajam acima. O que falta
     * é só o NOME do empreendimento e o NOME do corretor — sem eles a tela
     * imprimiria UUID, que não é informação para ninguém.
     *
     * O que NÃO é lido aqui, de propósito: `developments.price_min/price_max`
     * (nulo em 2 dos 4) e `units.price` (só existe para um). Preço de tabela é
     * VALOR DE ESTOQUE, não VGV vendido nem em negociação — imprimir isso como
     * "VGV do projeto" seria exatamente a mentira que este produto já pagou.
     */
    admin.from("developments").select("id,name").eq("organization_id", organizationId),
    admin.from("profiles").select("id,name,full_name,active").eq("organization_id", organizationId),
  ]);
  const { rows: data, error } = leadsPaginados;

  /**
   * ── AS DUAS LEITURAS SEM AS QUAIS ESTA TELA NÃO EXISTE ────────────────────
   *
   * Leitura que falhou não pode virar "operação vazia": a tela diria que não há
   * lead nenhuma sobre uma consulta que ninguém conseguiu fazer.
   *
   * `pipeline_stage_settings` entrou nesta lista em 02/08/2026. O erro dela era
   * ENGOLIDO: `configuracao.data ?? []` cai em `mergePipelineStageSettings`, que
   * devolve a régua PADRÃO do código. Nesta organização a régua padrão e a
   * configurada são idênticas (medido: mesmas 9 chaves, mesmos rótulos, mesmas
   * posições) — o funil sairia igual e ninguém veria nada. A falha só apareceria
   * na empresa que tivesse configurado o funil de outro jeito, que é exatamente
   * quem mais precisa de um funil correto.
   *
   * E não é só o desenho: `emAberto` (o número de cabeçalho do painel) e
   * `equipe[].abertas` contam SOBRE essa régua. Publicá-los sobre uma régua
   * assumida seria a terceira verdade sobre o mesmo funil — a que este arquivo
   * já pagou para eliminar uma vez.
   */
  const leiturasFatais = [
    { fonte: "leads", erro: error },
    { fonte: "pipeline_stage_settings", erro: configuracao.error },
  ].filter((leitura) => leitura.erro);

  if (leiturasFatais.length > 0) {
    return apiError(
      "SALA_DE_COMANDO_INDISPONIVEL",
      leiturasFatais.some((l) => l.fonte === "pipeline_stage_settings") && !error
        ? "Não foi possível ler as etapas configuradas do funil. Desenhar o funil com a régua padrão mostraria etapas que talvez não sejam as desta empresa."
        : "Não foi possível medir a operação agora.",
      identity.meta,
      {
        status: 503,
        details: {
          motivo: leiturasFatais.map((l) => `${l.fonte}: ${l.erro?.message ?? "leitura falhou"}`).join(" · "),
          fontes: leiturasFatais.map((l) => l.fonte),
        },
      },
    );
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

  /**
   * ── O DENOMINADOR DO FUNIL ERA O ESTOQUE PARADO, NÃO O TOPO ───────────────
   *
   * `percentualDoTopo` dividia cada etapa por `porEtapa.get("novo")` — quantas
   * leads estão PARADAS na primeira coluna neste instante. Medido em 02/08/2026
   * na organização real (489 leads):
   *
   *     etapa          estoque   % do topo ANTES   % da coorte AGORA
   *     novo                34       100,0%              7,0%
   *     contato             25        73,5%              5,1%
   *     qualificação         8        23,5%              1,6%
   *
   * Quatorze vezes de diferença, e na direção que ESCONDE o problema: 73,5%
   * descreve uma operação que leva três de cada quatro leads ao primeiro
   * contato. A real leva uma de cada vinte. O denominador antigo ENCOLHE
   * conforme as leads avançam ou são descartadas — o número sobe quando a
   * operação piora, e bateria 100% no dia em que a coluna "novo" esvaziasse.
   *
   * A coorte é calculável e não depende de histórico: toda lead entra por
   * "novo", então quem entrou é quem existe. `created_at` não tem um único nulo
   * nesta base (medido: 0 de 489), e a janela da coorte viaja junto.
   */
  const coorte = coorteDeEntrada(leads);
  const funil = montaEtapasDoFunil({
    etapas: etapasDaOrganizacao,
    quantidadePorEtapa: porEtapa,
    jaPassaramPorEtapa: new Map([...jaPassaram].map(([chave, ids]) => [chave, ids.size])),
    coorte,
    movimentoMensuravel: registroDeMovimentoMensuravel,
    desdeQuando: dataDoRegistro,
    emNovo: topo,
    totalDeLeads: leads.length,
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
  /**
   * ── "NENHUM INVESTIMENTO IMPORTADO" É UM DIAGNÓSTICO, E PRECISA SER VERDADE ─
   *
   * `importado: rows.length > 0` sai FALSE de dois jeitos completamente
   * diferentes: a tabela estar vazia, e a leitura ter falhado. O erro de
   * `marketing_spend` e o de `lead_attribution_touches` NÃO eram conferidos em
   * lugar nenhum desta rota — `fetchAllRows` devolve `{rows: [], error}` e só as
   * linhas eram usadas.
   *
   * A consequência era medível: a tela imprime "Nenhum investimento importado
   * ainda. O worker investimento-de-midia grava o gasto da Meta uma vez por
   * dia..." — mandando alguém depurar o worker por causa de um erro de banco.
   * Hoje a tabela tem 102 linhas de gasto e 47 toques de atribuição: a frase
   * seria falsa E apontaria para o culpado errado.
   */
  const investimentoMedido = medidaDoInvestimento({
    gastoErro: gastoPaginado.error,
    atribuicaoErro: atribuicaoPaginada.error,
    linhasDeGasto: gastoPaginado.rows.length,
  });
  const investimento = {
    ...reconciliaInvestimento(gastosPorCampanha, leadsPorCampanha),
    /** Sem linha nenhuma, a tela precisa saber que é ausência de importação. */
    importado: investimentoMedido.importado,
    /** false = a leitura não respondeu. Nada abaixo disto é zero: é desconhecido. */
    mensuravel: investimentoMedido.mensuravel,
    porqueIndisponivel: investimentoMedido.porqueIndisponivel,
    amostraTruncada: gastoPaginado.truncated || atribuicaoPaginada.truncated,
    /**
     * A frase do CPL, quando a leitura falhou, não pode ser a do módulo de
     * reconciliação — ela diria "Sem investimento importado e sem lead com
     * campanha de origem", que é uma afirmação sobre duas tabelas que ninguém
     * conseguiu ler.
     */
    ...(investimentoMedido.porqueIndisponivel
      ? { porqueSemCpl: investimentoMedido.porqueIndisponivel }
      : {}),
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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE A REFERÊNCIA VISUAL PEDE, MEDIDO — E O QUE ELA PEDE E NÃO EXISTE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O mockup do dono pede série temporal, top de projetos por VGV, ranking de
   * equipe e delta "vs 30 dias" em todos os seis indicadores. Três dessas
   * quatro coisas têm lastro parcial e uma não tem nenhum. Os blocos abaixo
   * devolvem o lastro E a fronteira dele, para a tela não ter que adivinhar.
   */

  /** Dia no fuso da operação. `created_at::date` em UTC jogaria a lead da noite
   *  para o dia seguinte — e "quantas entraram ontem" é pergunta de calendário
   *  brasileiro, não de calendário do servidor. */
  const diaLocal = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const agora = Date.now();
  const DIA_MS = 86_400_000;
  const JANELA_DIAS = 30;
  const corteRecente = agora - JANELA_DIAS * DIA_MS;
  const corteAnterior = agora - 2 * JANELA_DIAS * DIA_MS;

  const criadas = leads.filter((l) => l.created_at);
  const ultimos30 = criadas.filter((l) => new Date(l.created_at!).getTime() >= corteRecente);
  const anteriores30 = criadas.filter((l) => {
    const t = new Date(l.created_at!).getTime();
    return t >= corteAnterior && t < corteRecente;
  });

  /**
   * ── O DELTA SAI COM O LOTE PENDURADO NELE, OU NÃO SAI ─────────────────────
   *
   * Medido em 02/08/2026: 406 contra 59 = +588%. Dessas 406, 270 vieram de UM
   * lote de importação. O rótulo desta métrica é "leads CRIADAS NA BASE", e o
   * lote viaja ao lado — não como nota de rodapé opcional, como campo.
   */
  const lotesNaJanela = new Map<string, number>();
  for (const l of ultimos30) {
    if (!l.import_batch_id) continue;
    lotesNaJanela.set(l.import_batch_id, (lotesNaJanela.get(l.import_batch_id) ?? 0) + 1);
  }
  const maiorLoteEntrada = [...lotesNaJanela.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const importadasNaJanela = [...lotesNaJanela.values()].reduce((s, n) => s + n, 0);

  const deltaLeadsTotais = {
    /** O rótulo é parte do dado: "criadas na base" ≠ "demanda". */
    rotulo: "leads criadas na base",
    janelaDias: JANELA_DIAS,
    ultimos30: ultimos30.length,
    anteriores30: anteriores30.length,
    /** `null` quando a janela anterior é ZERO: dividir por zero vira "+∞%". */
    variacaoPercentual:
      anteriores30.length > 0
        ? Math.round(((ultimos30.length - anteriores30.length) / anteriores30.length) * 1000) / 10
        : null,
    porqueSemVariacao:
      anteriores30.length > 0
        ? null
        : "Nenhuma lead criada na janela anterior — não há base de comparação, e variação sobre zero não é percentual.",
    importadasNaJanela,
    maiorLote: maiorLoteEntrada ? { id: maiorLoteEntrada[0], leads: maiorLoteEntrada[1] } : null,
    /** Sempre presente. Delta sem esta frase é opinião com seta. */
    ressalva:
      importadasNaJanela > 0
        ? `${importadasNaJanela} das ${ultimos30.length} leads da janela entraram por importação${maiorLoteEntrada ? `, ${maiorLoteEntrada[1]} delas num único lote` : ""}. Esta variação mede entrada na base, não demanda de mercado.`
        : "Nenhuma lead da janela veio de importação — a variação mede criação orgânica na base.",
  };

  /**
   * ── OS OUTROS CINCO DELTAS NÃO EXISTEM, E O MOTIVO É UM SÓ ────────────────
   *
   * Leads Ativos, Em Atendimento, Negociações, VGV e Conversão exigem saber o
   * ESTADO de cada lead 30 dias atrás. Só a série de movimentação sustenta
   * isso — e `pipeline_stage_moves` começou a registrar em 27/07/2026. Na
   * janela de 30 a 60 dias atrás há ZERO linhas. Qualquer delta ali seria
   * divisão por zero apresentada como crescimento.
   *
   * Nenhum backfill resolve: o passado não foi registrado.
   */
  const movimentosNaJanelaAnterior = movimentosPaginados.rows.filter((m) => {
    if (!m.occurred_at) return false;
    const t = new Date(m.occurred_at).getTime();
    return t >= corteAnterior && t < corteRecente;
  }).length;
  /**
   * A frase daqui AFIRMA sobre o banco: "Na janela anterior não há um único
   * movimento registrado". Ela nascia de `movimentosNaJanelaAnterior === 0` —
   * que é exatamente o valor que sai quando `pipeline_stage_moves` não pôde ser
   * lida. Afirmação sobre um banco que ninguém leu é chute com cara de medida.
   *
   * Nunca `null`. Um campo que às vezes some faz a tela cair num galho sem
   * frase, e painel sem frase é o painel que parece quebrado. A frase muda de
   * CONTEÚDO conforme o registro cresce (ou conforme a leitura falha); ela não
   * desaparece.
   */
  const deltasDeEstado = comparacaoDeEstado({
    movimentoMensuravel: registroDeMovimentoMensuravel,
    movimentosNaJanelaAnterior,
    inicioFormatado: inicioDoRegistro ? new Date(inicioDoRegistro).toLocaleDateString("pt-BR") : null,
  });

  /**
   * ── EVOLUÇÃO DE LEADS: UMA LINHA, PORQUE SÓ UMA TEM LASTRO NA JANELA ──────
   *
   * O mockup pede três linhas — novos, qualificados, negociações. "Novos" sai
   * de `created_at`, que cobre a base inteira sem um nulo. As outras duas só
   * poderiam sair de `pipeline_stage_moves`, que cobre poucos dias: desenhadas
   * no mesmo eixo, elas leriam como "caiu para zero" em todos os dias
   * anteriores ao registro — que é o oposto do que aconteceu.
   *
   * Sai uma linha só, e a série de movimentação viaja em separado, com a data
   * em que ela começa, para a tela poder demarcar o trecho medido.
   */
  const SERIE_MAX_DIAS = 90;
  const porDia = new Map<string, number>();
  const importadasPorDia = new Map<string, number>();
  let primeiroDia: string | null = null;
  for (const l of criadas) {
    const dia = diaLocal(l.created_at!);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    if (l.import_batch_id) importadasPorDia.set(dia, (importadasPorDia.get(dia) ?? 0) + 1);
    if (!primeiroDia || dia < primeiroDia) primeiroDia = dia;
  }
  const hojeLocal = diaLocal(new Date().toISOString());
  const dias: Array<{ dia: string; novos: number; importadas: number }> = [];
  if (primeiroDia) {
    // Série CONTÍNUA: o dia sem lead é um zero MEDIDO (`created_at` não tem um
    // único nulo), não um buraco. Pular o dia vazio encurtaria o eixo e faria a
    // linha parecer mais densa do que a operação é.
    const inicio = new Date(`${primeiroDia}T12:00:00Z`).getTime();
    const fim = new Date(`${hojeLocal}T12:00:00Z`).getTime();
    const primeiroPlotado = Math.max(inicio, fim - (SERIE_MAX_DIAS - 1) * DIA_MS);
    for (let t = primeiroPlotado; t <= fim; t += DIA_MS) {
      const dia = new Date(t).toISOString().slice(0, 10);
      dias.push({ dia, novos: porDia.get(dia) ?? 0, importadas: importadasPorDia.get(dia) ?? 0 });
    }
  }
  const evolucao = {
    dias,
    de: dias[0]?.dia ?? null,
    ate: dias[dias.length - 1]?.dia ?? null,
    /** Dias cobertos pela base, mesmo quando a série plotada é mais curta. */
    diasNaBase: primeiroDia ? Math.round((new Date(`${hojeLocal}T12:00:00Z`).getTime() - new Date(`${primeiroDia}T12:00:00Z`).getTime()) / DIA_MS) + 1 : 0,
    serieTruncada: Boolean(primeiroDia) && dias.length > 0 && dias[0]!.dia > primeiroDia!,
    linhasIndisponiveis: [
      {
        chave: "qualificados",
        porque: registroDeMovimentoMensuravel
          ? `A curva de qualificação só existe em \`pipeline_stage_moves\`, que começou${inicioDoRegistro ? ` em ${new Date(inicioDoRegistro).toLocaleDateString("pt-BR")}` : " a registrar recentemente"}. No mesmo eixo dos novos, ela leria como queda a zero onde na verdade é ausência de registro.`
          : "A curva de qualificação sai de `pipeline_stage_moves`, e esta leitura NÃO respondeu agora. Não é ausência de registro: é leitura indisponível — pode haver histórico e não estamos conseguindo vê-lo.",
      },
      {
        chave: "negociacoes",
        porque: registroDeMovimentoMensuravel
          ? "Mesma origem, mesma fronteira: sem histórico anterior ao início do registro, a linha inventaria um passado."
          : "Mesma origem, mesma falha: a leitura do histórico não respondeu, então a linha não pode ser nem desenhada nem declarada ausente.",
      },
    ],
    /** `null` sozinho não distingue "não começou" de "não consegui ler". */
    registroDeMovimentoDesde: inicioDoRegistro,
    registroDeMovimentoMensuravel,
  };

  /**
   * ── TOP PROJETOS: POR LEADS, COM O DENOMINADOR NA CARA ────────────────────
   *
   * O mockup pede "Top Projetos por VGV". Medido: `price_min/price_max` é nulo
   * em 2 dos 4 empreendimentos; `units.price` só existe para um; e a ÚNICA
   * venda com valor apurado tem `development_id` NULO — nem o VGV fechado pode
   * ser atribuído a um projeto. O ranking sai por LEADS, com o rótulo honesto,
   * e o VGV sai declarado sem lastro.
   */
  const leadsPorEmpreendimento = new Map<string, number>();
  let semEmpreendimento = 0;
  for (const l of leads) {
    if (!l.development_id) { semEmpreendimento += 1; continue; }
    leadsPorEmpreendimento.set(l.development_id, (leadsPorEmpreendimento.get(l.development_id) ?? 0) + 1);
  }
  const nomeDoEmpreendimento = new Map(
    ((empreendimentos.data ?? []) as DevelopmentRow[]).map((d) => [d.id, (d.name || "").trim() || "Empreendimento sem nome"]),
  );
  const topProjetos = {
    /** Sem isto, "nenhum projeto" leria como "nenhuma lead vinculada". */
    mensuravel: !empreendimentos.error,
    rotulo: "leads por empreendimento",
    projetos: [...nomeDoEmpreendimento.entries()]
      .map(([id, nome]) => ({ id, nome, leads: leadsPorEmpreendimento.get(id) ?? 0 }))
      .sort((a, b) => b.leads - a.leads || a.nome.localeCompare(b.nome, "pt-BR")),
    semVinculo: semEmpreendimento,
    base: leads.length,
    /** O que impede o painel POR VGV de existir, escrito. */
    porqueSemVgv:
      "Preço de tabela está em branco em parte dos empreendimentos, e a única venda com valor apurado não tem empreendimento vinculado — nem o VGV fechado pode ser atribuído a um projeto. Falta valor de negócio e empreendimento juntos na lead ganha.",
  };

  /**
   * ── PERFORMANCE DA EQUIPE: VOLUME SIM, CONVERSÃO POR PESSOA NÃO ───────────
   *
   * O ranking por carteira tem lastro e é justamente o desequilíbrio que ele
   * precisa mostrar. A COLUNA de conversão por corretor não tem: a organização
   * inteira soma 2 vendas. Taxa sobre amostra 0, 0, 0 e 2 não distingue
   * ninguém de ninguém — é a mesma armadilha que `conversao.afirmavel` já
   * bloqueia no agregado, com o MESMO limiar, aplicado agora por pessoa.
   */
  const chavesAbertas = new Set(etapasDaOrganizacao.map((e) => e.key));
  const porCorretor = new Map<string, { total: number; abertas: number; ganhos: number }>();
  let semDono = 0;
  for (const l of leads) {
    const dono = l.assigned_to ?? l.assigned_user_id;
    if (!dono) { semDono += 1; continue; }
    const linha = porCorretor.get(dono) ?? { total: 0, abertas: 0, ganhos: 0 };
    linha.total += 1;
    const etapa = etapaDaLead(l.status);
    if (chavesAbertas.has(etapa)) linha.abertas += 1;
    if (etapa === "ganho") linha.ganhos += 1;
    porCorretor.set(dono, linha);
  }
  const nomeDoPerfil = new Map(
    ((perfis.data ?? []) as ProfileRow[]).map((p) => [p.id, (p.full_name || p.name || "").trim()]),
  );
  const corretores = [...porCorretor.entries()]
    .map(([id, linha]) => ({
      id,
      nome: nomeDoPerfil.get(id) || "Corretor sem nome no cadastro",
      total: linha.total,
      abertas: linha.abertas,
      ganhos: linha.ganhos,
      /** A taxa por pessoa só é afirmável no MESMO limiar do agregado. */
      taxaAfirmavel: linha.ganhos >= VENDAS_PARA_AFIRMAR_TAXA,
      taxa: linha.ganhos >= VENDAS_PARA_AFIRMAR_TAXA && linha.total > 0
        ? Math.round((linha.ganhos / linha.total) * 1000) / 10
        : null,
    }))
    .sort((a, b) => b.abertas - a.abertas || b.total - a.total);
  const maiorCarteira = Math.max(0, ...corretores.map((c) => c.total));
  const equipe = {
    mensuravel: !perfis.error,
    corretores,
    semDono,
    base: leads.length,
    maiorCarteira,
    /** Proporção sem denominador esconde que quase tudo está com uma pessoa. */
    concentracaoDoMaior: leads.length > 0 ? Math.round((maiorCarteira / leads.length) * 1000) / 10 : null,
    limiarVendasParaTaxa: VENDAS_PARA_AFIRMAR_TAXA,
    porqueSemTaxaPorCorretor: corretores.some((c) => c.taxaAfirmavel)
      ? null
      : `Nenhum corretor chegou a ${VENDAS_PARA_AFIRMAR_TAXA} vendas. Taxa de conversão por pessoa sobre essa amostra não distingue ninguém de ninguém — é o mesmo limiar que já bloqueia a taxa no total.`,
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
      /** O denominador do funil, publicado: razão sem denominador é opinião. */
      coorteDoFunil: {
        entradas: coorte.entradas,
        semDataDeEntrada: coorte.semDataDeEntrada,
        de: coorte.de,
        ate: coorte.ate,
        rotulo: coorte.rotulo,
        porqueEsteDenominador:
          "O percentual de cada etapa é sobre quem ENTROU no funil, não sobre o estoque parado em \"novo\". "
          + "O estoque encolhe conforme as leads avançam ou são descartadas: usá-lo como base faz o número SUBIR quando a operação piora.",
      },
      saidasDoFunil,
      investimento,
      /** Os quatro blocos que a referência visual pede. Três com lastro
       *  parcial declarado, e o VGV por projeto recusado por escrito. */
      deltaLeadsTotais,
      deltasDeEstado,
      evolucao,
      topProjetos,
      equipe,
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
        /**
         * ── O ROSTER: QUANTAS DAS LEITURAS DESTA TELA FORAM MEDIDAS ────────
         *
         * A sala mostra um chip "5/5 operacionais" que conta MÓDULOS de outra
         * rota (`/api/v1/core-v2/module-health`) e não sabe nada sobre as sete
         * leituras que fazem os números daqui. Resultado: o chip continua verde
         * enquanto este painel diz "Não foi possível medir".
         *
         * Este roster é o lastro para um contador honesto: ele diz, leitura por
         * leitura, se ela respondeu POR INTEIRO — erro e truncamento contam
         * igual, porque agregado sobre amostra cortada não é medida.
         */
        leituras: declaraLeituras([
          { fonte: "leads", serve: "Todos os indicadores, o funil e a conversão", erro: leadsPaginados.error, truncada: leadsPaginados.truncated },
          { fonte: "pipeline_stage_settings", serve: "As etapas do funil desta empresa", erro: configuracao.error },
          { fonte: "pipeline_stage_moves", serve: "\"Já passaram\", as saídas do funil e a base de comparação", erro: movimentosPaginados.error, truncada: movimentosPaginados.truncated },
          { fonte: "marketing_spend", serve: "O investimento e o custo por lead", erro: gastoPaginado.error, truncada: gastoPaginado.truncated },
          { fonte: "lead_attribution_touches", serve: "A campanha de origem das leads", erro: atribuicaoPaginada.error, truncada: atribuicaoPaginada.truncated },
          { fonte: "developments", serve: "O ranking de projetos", erro: empreendimentos.error },
          { fonte: "profiles", serve: "O nome dos corretores no ranking de equipe", erro: perfis.error },
        ]),
      },
      geradoEm: new Date().toISOString(),
    },
    identity.meta,
  );
}
