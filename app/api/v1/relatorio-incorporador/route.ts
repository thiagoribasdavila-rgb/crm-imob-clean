import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  apurarFunil,
  classificarAtribuicao,
  custoPorClique,
  custoPorLead,
  custoPorMil,
  ETAPAS_DE_SAIDA,
  ETAPAS_DO_FUNIL,
  lerSerie,
  medianaEmMinutos,
  resumirAtribuicao,
  taxa,
  taxaDeClique,
  type ChaveDeEtapa,
  type DiaDaSerie,
  type Gasto,
  type LeadParaFunil,
  type LinhaDeCampanha,
  type LinhaDeEmpreendimento,
} from "@/lib/relatorio-incorporador/apuracao";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/relatorio-incorporador?dias=90&incorporador=<uuid|todos>
 *
 * O relatório do incorporador por CAMPANHA, GASTO e CONVERSÃO. A conta é pura e
 * mora em `lib/relatorio-incorporador/apuracao`; esta rota só busca o que o
 * banco sabe e passa adiante — inclusive o que ele NÃO sabe, que aqui vira
 * `null` com motivo, nunca zero.
 *
 * ── AS DUAS ARMADILHAS DESTE DOMÍNIO, E COMO ESTA ROTA DESVIA ──────────────
 *
 * 1. `developments` e `crm_projects` guardam OS MESMOS 4 empreendimentos com
 *    IDs DIFERENTES. A ponte é `crm_projects.development_id`. Conferido no
 *    catálogo em 02/08/2026:
 *
 *        leads.development_id            → developments.id
 *        leads.project_id                → crm_projects.id
 *        marketing_campaigns.project_id  → crm_projects.id
 *
 *    Ou seja, para saber o empreendimento de uma campanha são DOIS saltos.
 *    Comparar `campanha.project_id` com `development.id` direto devolve
 *    `false` para sempre, em silêncio.
 *
 * 2. `marketing_spend.leads_count` está NULL nas 98 linhas (medido em
 *    02/08/2026). Somar com `coalesce(...,0)` produziria "a plataforma reportou
 *    0 leads", que é uma afirmação que ninguém fez. Sai `null`.
 */

/** Teto por consulta. Bater no teto significa relatório truncado, e a tela precisa saber. */
const TETO_DE_LINHAS = 5000;

const JANELAS_ACEITAS = [30, 90, 365] as const;
type Janela = (typeof JANELAS_ACEITAS)[number];

const PAPEIS_AUTORIZADOS = ["director", "superintendent", "manager", "admin"];

/** Origens que representam entrada por mídia paga. */
const ORIGEM_DE_MIDIA = new Set(["meta_ads", "meta lead ads", "meta ads", "google_ads", "google ads"]);

const DIA_EM_MS = 86_400_000;

function lerJanela(bruto: string | null): Janela {
  const numero = Number(bruto);
  return (JANELAS_ACEITAS as readonly number[]).includes(numero) ? (numero as Janela) : 90;
}

/** AAAA-MM-DD no fuso de São Paulo — o dia do gasto é o dia comercial, não UTC. */
function diaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

type LeadDaJanela = {
  id: string;
  created_at: string;
  campaign_id: string | null;
  development_id: string | null;
  first_contacted_at: string | null;
  first_contact_due_at: string | null;
  source_normalized: string | null;
  import_batch_id: string | null;
};

type Movimento = { lead_id: string | null; to_stage: string | null; occurred_at: string | null };

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "relatorio-incorporador.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!PAPEIS_AUTORIZADOS.includes(papel)) {
    return apiError(
      "FORBIDDEN",
      "O relatório do incorporador é da liderança comercial — ele mostra gasto de mídia do parceiro.",
      access.meta,
      { status: 403, headers: rate.headers },
    );
  }

  const parametros = new URL(request.url).searchParams;
  const dias = lerJanela(parametros.get("dias"));
  const incorporadorPedido = parametros.get("incorporador");

  const fim = new Date();
  // `dias - 1`, e não `dias`: a janela é INCLUSIVA nas duas pontas, então
  // subtrair 90 dias de hoje produz 91 dias de série. A tela dizia "janela de 90
  // dias" logo abaixo de "31 dos 91 dias" — duas contagens da mesma coisa, e
  // basta uma delas para o leitor desconfiar do resto.
  const inicio = new Date(fim.getTime() - (dias - 1) * DIA_EM_MS);
  const inicioIso = inicio.toISOString();
  const fimIso = fim.toISOString();
  const inicioDia = diaLocal(inicioIso);
  const fimDia = diaLocal(fimIso);

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();

  const [incorporadoras, empreendimentos, projetos, campanhas, gastos, leads, movimentos] =
    await Promise.all([
      admin.from("developers")
        .select("id,trade_name,legal_name,status")
        .eq("organization_id", organizationId),
      admin.from("developments")
        .select("id,name,developer_id,developer_name,city,status")
        .eq("organization_id", organizationId),
      // A ponte entre os dois cadastros de empreendimento. Sem ela, campanha e
      // empreendimento nunca se encontram.
      admin.from("crm_projects")
        .select("id,name,development_id")
        .eq("organization_id", organizationId),
      admin.from("marketing_campaigns")
        .select("id,name,platform,status,external_campaign_id,project_id")
        .eq("organization_id", organizationId),
      admin.from("marketing_spend")
        .select("campaign_id,spend_date,amount,impressions,clicks,leads_count")
        .eq("organization_id", organizationId)
        .gte("spend_date", inicioDia)
        .lte("spend_date", fimDia)
        .limit(TETO_DE_LINHAS),
      admin.from("leads")
        .select("id,created_at,campaign_id,development_id,first_contacted_at,first_contact_due_at,source_normalized,import_batch_id")
        .eq("organization_id", organizationId)
        .gte("created_at", inicioIso)
        .lte("created_at", fimIso)
        .limit(TETO_DE_LINHAS),
      // Sem filtro por lead_id: 490 UUIDs num `in()` estouram a URL do PostgREST.
      // A organização já isola, e o corte por lead é feito em memória.
      admin.from("pipeline_stage_moves")
        .select("lead_id,to_stage,occurred_at")
        .eq("organization_id", organizationId)
        .limit(TETO_DE_LINHAS),
    ]);

  if (leads.error) {
    return apiError("LEADS_LOOKUP_FAILED", "Não foi possível ler as leads da janela.", access.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  const linhasDeLead = (leads.data ?? []) as LeadDaJanela[];
  const linhasDeGasto = gastos.data ?? [];
  const linhasDeMovimento = (movimentos.data ?? []) as Movimento[];

  // ── Empreendimento: developments é o cadastro canônico; crm_projects é a ponte.
  const empreendimentoDoProjeto = new Map<string, string>();
  for (const projeto of projetos.data ?? []) {
    if (projeto.development_id) empreendimentoDoProjeto.set(projeto.id, projeto.development_id);
  }

  const nomeDaIncorporadora = new Map<string, string>();
  for (const item of incorporadoras.data ?? []) {
    nomeDaIncorporadora.set(item.id, item.trade_name || item.legal_name);
  }

  const todosOsEmpreendimentos = (empreendimentos.data ?? []).filter((e) =>
    !incorporadorPedido || incorporadorPedido === "todos" ? true : e.developer_id === incorporadorPedido,
  );
  const idsDeEmpreendimento = new Set(todosOsEmpreendimentos.map((e) => e.id));

  // Filtrar por incorporadora recorta as leads também — senão o funil geral
  // contaria lead de empreendimento que não é do parceiro selecionado.
  const filtrandoPorIncorporadora = Boolean(incorporadorPedido && incorporadorPedido !== "todos");
  const leadsDoRecorte = filtrandoPorIncorporadora
    ? linhasDeLead.filter((l) => l.development_id && idsDeEmpreendimento.has(l.development_id))
    : linhasDeLead;
  const idsDeLead = new Set(leadsDoRecorte.map((l) => l.id));

  // ── Movimentação: primeira chegada de cada lead em cada etapa.
  const chegadaPorLead = new Map<string, Partial<Record<ChaveDeEtapa, number>>>();
  const saiuPorLead = new Set<string>();
  const comMovimento = new Set<string>();
  const etapasConhecidas = new Set<string>(ETAPAS_DO_FUNIL.map((e) => e.chave));

  // Desde quando existe medição de movimento. MEDIDO em 02/08/2026: a primeira
  // linha é de 27/07/2026 13:55 UTC, e a base tem lead desde 22/05. Sem este
  // recorte, "tempo até o contato" de uma lead de maio mede a distância até o
  // dia em que o livro passou a existir — 13,8 dias de mediana que não são
  // latência de atendimento nenhuma.
  const registroDesde = linhasDeMovimento.reduce<number | null>((menor, m) => {
    if (!m.occurred_at) return menor;
    const instante = new Date(m.occurred_at).getTime();
    return menor === null || instante < menor ? instante : menor;
  }, null);

  for (const movimento of linhasDeMovimento) {
    if (!movimento.lead_id || !movimento.occurred_at || !idsDeLead.has(movimento.lead_id)) continue;
    comMovimento.add(movimento.lead_id);
    const estagio = String(movimento.to_stage ?? "");
    if ((ETAPAS_DE_SAIDA as readonly string[]).includes(estagio)) saiuPorLead.add(movimento.lead_id);
    if (!etapasConhecidas.has(estagio)) continue;
    const instante = new Date(movimento.occurred_at).getTime();
    const atual = chegadaPorLead.get(movimento.lead_id) ?? {};
    const chave = estagio as ChaveDeEtapa;
    // A PRIMEIRA chegada é a que conta: a lead que volta para "contato" depois
    // de uma proposta não recomeça o relógio dela.
    if (atual[chave] === undefined || instante < (atual[chave] as number)) atual[chave] = instante;
    chegadaPorLead.set(movimento.lead_id, atual);
  }

  const paraFunil = (conjunto: LeadDaJanela[]): LeadParaFunil[] =>
    conjunto.map((l) => ({
      id: l.id,
      criadaEm: new Date(l.created_at).getTime(),
      chegouEm: chegadaPorLead.get(l.id) ?? {},
      saiu: saiuPorLead.has(l.id),
      temMovimento: comMovimento.has(l.id),
    }));

  const contarFunil = (conjunto: LeadDaJanela[]): Record<ChaveDeEtapa, number> => {
    const contagem = {} as Record<ChaveDeEtapa, number>;
    for (const etapa of ETAPAS_DO_FUNIL) {
      contagem[etapa.chave] = conjunto.filter((l) => chegadaPorLead.get(l.id)?.[etapa.chave] !== undefined).length;
    }
    return contagem;
  };

  // ── Campanhas.
  const gastoPorCampanha = new Map<string, {
    valor: number;
    linhas: number;
    impressoes: number;
    cliques: number;
    leadsDaPlataforma: number | null;
    dias: Set<string>;
    primeiro: string | null;
    ultimo: string | null;
  }>();
  for (const linha of linhasDeGasto) {
    if (!linha.campaign_id) continue;
    const atual = gastoPorCampanha.get(linha.campaign_id) ?? {
      valor: 0, linhas: 0, impressoes: 0, cliques: 0, leadsDaPlataforma: null,
      dias: new Set<string>(), primeiro: null, ultimo: null,
    };
    atual.valor += Number(linha.amount ?? 0);
    atual.linhas += 1;
    atual.impressoes += Number(linha.impressions ?? 0);
    atual.cliques += Number(linha.clicks ?? 0);
    // Só vira número quando ALGUMA linha informou. NULL em todas continua null.
    if (linha.leads_count !== null && linha.leads_count !== undefined) {
      atual.leadsDaPlataforma = (atual.leadsDaPlataforma ?? 0) + Number(linha.leads_count);
    }
    const dia = String(linha.spend_date);
    atual.dias.add(dia);
    atual.primeiro = atual.primeiro && atual.primeiro < dia ? atual.primeiro : dia;
    atual.ultimo = atual.ultimo && atual.ultimo > dia ? atual.ultimo : dia;
    gastoPorCampanha.set(linha.campaign_id, atual);
  }

  const nomeDoEmpreendimento = new Map(todosOsEmpreendimentos.map((e) => [e.id, e.name] as const));

  /* Filtrar por incorporadora tem de recortar a CAMPANHA também. Sem isto, pedir
     o relatório da Kallas devolveria as 7 campanhas e os R$ 3.845,19 inteiros —
     o gasto do portfólio todo carimbado como se fosse de um parceiro só. Uma
     campanha pertence ao parceiro quando aponta um projeto dele (dois saltos) ou
     quando alguma lead dele carrega a campanha. Medido em 02/08/2026: nenhuma
     campanha satisfaz nenhum dos dois, e o relatório filtrado diz isso. */
  const campanhaEDoParceiro = (campanha: { id: string; project_id: string | null }) => {
    if (!filtrandoPorIncorporadora) return true;
    const empreendimentoId = campanha.project_id ? empreendimentoDoProjeto.get(campanha.project_id) : null;
    if (empreendimentoId && idsDeEmpreendimento.has(empreendimentoId)) return true;
    return leadsDoRecorte.some((l) => l.campaign_id === campanha.id);
  };

  const linhasDeCampanha: LinhaDeCampanha[] = (campanhas.data ?? []).filter(campanhaEDoParceiro).map((campanha) => {
    const agregado = gastoPorCampanha.get(campanha.id);
    const gasto: Gasto = agregado
      ? { valor: agregado.valor, linhas: agregado.linhas }
      : { valor: null, linhas: 0 };
    const minhasLeads = leadsDoRecorte.filter((l) => l.campaign_id === campanha.id);
    const impressoes = agregado?.impressoes ?? 0;
    const cliques = agregado?.cliques ?? 0;

    return {
      id: campanha.id,
      nome: campanha.name,
      plataforma: campanha.platform,
      status: campanha.status,
      idExterno: campanha.external_campaign_id,
      gasto,
      diasComGasto: agregado?.dias.size ?? 0,
      primeiroDiaDeGasto: agregado?.primeiro ?? null,
      ultimoDiaDeGasto: agregado?.ultimo ?? null,
      impressoes,
      cliques,
      leadsDaPlataforma: agregado?.leadsDaPlataforma ?? null,
      leadsAtribuidas: minhasLeads.length,
      leadsContatadas: minhasLeads.filter((l) => l.first_contacted_at).length,
      atribuicao: classificarAtribuicao(gasto, minhasLeads.length),
      cpl: custoPorLead(gasto, minhasLeads.length),
      cpc: custoPorClique(gasto, cliques),
      cpm: custoPorMil(gasto, impressoes),
      ctr: taxaDeClique(cliques, impressoes),
      funil: contarFunil(minhasLeads),
      saidas: minhasLeads.filter((l) => saiuPorLead.has(l.id)).length,
      empreendimentos: [
        ...new Set(
          minhasLeads
            .map((l) => (l.development_id ? nomeDoEmpreendimento.get(l.development_id) : null))
            .filter((nome): nome is string => Boolean(nome)),
        ),
      ],
    };
  });

  // Campanha sem gasto E sem lead na janela não é notícia — é ruído de cadastro.
  const campanhasComAlgo = linhasDeCampanha.filter((c) => c.atribuicao !== "sem_dado");

  // ── Empreendimentos.
  //
  // O gasto ligado ao empreendimento passa pelos DOIS saltos
  // (campanha → crm_projects → developments). Medido em 02/08/2026: as 8
  // campanhas têm `project_id` NULL, então este mapa sai VAZIO e todo
  // empreendimento reporta gasto não medido. Está certo assim — o dia em que
  // alguém amarrar campanha a projeto, o número aparece sozinho.
  const gastoPorEmpreendimento = new Map<string, Gasto>();
  for (const campanha of campanhas.data ?? []) {
    const empreendimentoId = campanha.project_id ? empreendimentoDoProjeto.get(campanha.project_id) : null;
    const agregado = gastoPorCampanha.get(campanha.id);
    if (!empreendimentoId || !agregado) continue;
    const atual = gastoPorEmpreendimento.get(empreendimentoId) ?? { valor: 0, linhas: 0 };
    gastoPorEmpreendimento.set(empreendimentoId, {
      valor: (atual.valor ?? 0) + agregado.valor,
      linhas: atual.linhas + agregado.linhas,
    });
  }

  const agora = Date.now();
  const linhasDeEmpreendimento: LinhaDeEmpreendimento[] = todosOsEmpreendimentos.map((e) => {
    const minhas = leadsDoRecorte.filter((l) => l.development_id === e.id);
    const contatadas = minhas.filter((l) => l.first_contacted_at);
    return {
      id: e.id,
      nome: e.name,
      // `developer_id` é o vínculo canônico; `developer_name` é o nome legado que
      // sobrou da migração e é o único que alguns empreendimentos têm.
      incorporadora: (e.developer_id ? nomeDaIncorporadora.get(e.developer_id) : null) ?? e.developer_name,
      incorporadoraId: e.developer_id,
      cidade: e.city,
      status: e.status,
      leads: minhas.length,
      leadsContatadas: contatadas.length,
      taxaDeAtendimento: taxa(contatadas.length, minhas.length),
      tempoAtePrimeiroContato: medianaEmMinutos(
        contatadas.map(
          (l) => new Date(l.first_contacted_at as string).getTime() - new Date(l.created_at).getTime(),
        ),
      ),
      foraDoPrazo: minhas.filter(
        (l) => !l.first_contacted_at && l.first_contact_due_at && new Date(l.first_contact_due_at).getTime() < agora,
      ).length,
      funil: apurarFunil(paraFunil(minhas), registroDesde),
      leadsComCampanha: minhas.filter((l) => l.campaign_id).length,
      gastoLigado: gastoPorEmpreendimento.get(e.id) ?? { valor: null, linhas: 0 },
    };
  });

  // ── Série diária. É o insumo do único gráfico do relatório.
  const serie: DiaDaSerie[] = [];
  // A série de gasto tem de obedecer ao MESMO recorte da tabela de campanhas.
  // Sem esta linha, pedir o relatório de um parceiro mostraria a tabela dizendo
  // "nenhuma campanha alcança este recorte" e, logo abaixo, o gráfico desenhando
  // o gasto diário do portfólio inteiro — duas afirmações opostas na mesma tela.
  const campanhasDoRecorte = new Set(linhasDeCampanha.map((c) => c.id));
  const gastoPorDia = new Map<string, { valor: number; impressoes: number; cliques: number }>();
  for (const linha of linhasDeGasto) {
    if (!linha.campaign_id || !campanhasDoRecorte.has(linha.campaign_id)) continue;
    const dia = String(linha.spend_date);
    const atual = gastoPorDia.get(dia) ?? { valor: 0, impressoes: 0, cliques: 0 };
    atual.valor += Number(linha.amount ?? 0);
    atual.impressoes += Number(linha.impressions ?? 0);
    atual.cliques += Number(linha.clicks ?? 0);
    gastoPorDia.set(dia, atual);
  }
  const leadsPorDia = new Map<string, { midia: number; importadas: number; outras: number }>();
  for (const lead of leadsDoRecorte) {
    const dia = diaLocal(lead.created_at);
    const atual = leadsPorDia.get(dia) ?? { midia: 0, importadas: 0, outras: 0 };
    // Importação vem primeiro: uma planilha com 270 linhas entra num dia só e,
    // contada como mídia, faz o dia parecer o melhor da campanha.
    if (lead.import_batch_id) atual.importadas += 1;
    else if (ORIGEM_DE_MIDIA.has(String(lead.source_normalized ?? ""))) atual.midia += 1;
    else atual.outras += 1;
    leadsPorDia.set(dia, atual);
  }
  // A cobertura do feed é o intervalo que a conta de anúncio de fato respondeu.
  // Dentro dele, dia sem linha é zero medido; fora dele, é desconhecido. Medido
  // em 02/08/2026: o feed cobre 01–31/07 e a janela padrão pede 90 dias — 59 dias
  // fora, que virariam "gasto zero" se esta distinção não existisse.
  const diasComLinhaDeGasto = [...gastoPorDia.keys()].sort();
  const coberturaDe = diasComLinhaDeGasto[0] ?? null;
  const coberturaAte = diasComLinhaDeGasto[diasComLinhaDeGasto.length - 1] ?? null;

  for (let instante = inicio.getTime(); instante <= fim.getTime(); instante += DIA_EM_MS) {
    const dia = diaLocal(new Date(instante).toISOString());
    const g = gastoPorDia.get(dia);
    const l = leadsPorDia.get(dia);
    const medido = Boolean(coberturaDe && coberturaAte && dia >= coberturaDe && dia <= coberturaAte);
    serie.push({
      dia,
      gasto: medido ? (g?.valor ?? 0) : null,
      gastoMedido: medido,
      impressoes: g?.impressoes ?? 0,
      cliques: g?.cliques ?? 0,
      leadsDeMidia: l?.midia ?? 0,
      leadsImportadas: l?.importadas ?? 0,
      leadsOutras: l?.outras ?? 0,
    });
  }

  const funilGeral = apurarFunil(paraFunil(leadsDoRecorte), registroDesde);

  const truncou = [
    linhasDeGasto.length >= TETO_DE_LINHAS ? "gasto de mídia" : null,
    linhasDeLead.length >= TETO_DE_LINHAS ? "leads" : null,
    linhasDeMovimento.length >= TETO_DE_LINHAS ? "movimentações do funil" : null,
  ].filter((item): item is string => Boolean(item));

  const naoMedido: string[] = [];
  if (filtrandoPorIncorporadora && !campanhasComAlgo.length) {
    naoMedido.push(
      "Nenhuma campanha está ligada a esta incorporadora — nem por projeto, nem por lead atribuída. O gasto de mídia da janela existe, mas não há como dizer que parte dele é deste parceiro; por isso ele não aparece aqui em vez de aparecer inteiro.",
    );
  }
  if (truncou.length) {
    naoMedido.push(
      `A janela pedida trouxe mais de ${TETO_DE_LINHAS} linhas de ${truncou.join(", ")} — os números abaixo estão truncados. Reduza a janela.`,
    );
  }
  if (linhasDeCampanha.every((c) => c.leadsDaPlataforma === null)) {
    naoMedido.push(
      "A contagem de leads da própria plataforma de anúncio não chegou em nenhuma linha de gasto. O relatório usa só a atribuição do CRM.",
    );
  }
  if (!gastoPorEmpreendimento.size) {
    naoMedido.push(
      "Nenhuma campanha aponta um projeto, então o gasto não desce até o empreendimento. Vincule a campanha ao projeto para que a coluna de gasto por empreendimento passe a existir.",
    );
  }
  const semDevelopment = leadsDoRecorte.filter((l) => !l.development_id).length;
  if (semDevelopment) {
    naoMedido.push(
      `${semDevelopment} das ${leadsDoRecorte.length} leads da janela não apontam empreendimento — elas contam no total e no funil geral, e ficam fora da quebra por empreendimento.`,
    );
  }
  if (funilGeral.intervalosDescartados) {
    naoMedido.push(
      `${funilGeral.intervalosDescartados} movimentação(ões) ocorreram antes da criação da própria lead e saíram do cálculo de tempo.`,
    );
  }
  if (registroDesde && funilGeral.anterioresAoRegistro) {
    const desde = new Date(registroDesde).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    naoMedido.push(
      `O livro de movimentação começa em ${desde}. ${funilGeral.anterioresAoRegistro} das ${funilGeral.entraram} leads da janela nasceram antes disso: elas contam nas etapas alcançadas, mas ficam fora de qualquer tempo medido a partir da criação.`,
    );
  }
  if (!registroDesde) {
    naoMedido.push("Nenhuma movimentação de funil registrada nesta organização — o funil abaixo é só o topo.");
  }

  const dados = {
    janela: { dias, inicio: inicioDia, fim: fimDia },
    incorporadoras: (incorporadoras.data ?? []).map((i) => ({
      id: i.id,
      nome: i.trade_name || i.legal_name,
      status: i.status,
    })),
    filtro: { incorporador: filtrandoPorIncorporadora ? incorporadorPedido : "todos" },
    cobertura: {
      leads: leadsDoRecorte.length,
      comEmpreendimento: leadsDoRecorte.filter((l) => l.development_id).length,
      comCampanha: leadsDoRecorte.filter((l) => l.campaign_id).length,
      comPrimeiroContato: leadsDoRecorte.filter((l) => l.first_contacted_at).length,
      comMovimento: leadsDoRecorte.filter((l) => comMovimento.has(l.id)).length,
      importadas: leadsDoRecorte.filter((l) => l.import_batch_id).length,
    },
    campanhas: campanhasComAlgo,
    campanhasSilenciosas: linhasDeCampanha.length - campanhasComAlgo.length,
    atribuicao: resumirAtribuicao(campanhasComAlgo),
    empreendimentos: linhasDeEmpreendimento,
    funil: funilGeral,
    registroDeMovimentoDesde: registroDesde ? new Date(registroDesde).toISOString() : null,
    serie,
    leituraDaSerie: lerSerie(serie),
    naoMedido,
    geradoEm: new Date().toISOString(),
  };

  structuredApiLog("info", "relatorio_incorporador.gerado", request, access.meta, {
    organizationId,
    dias,
    campanhas: campanhasComAlgo.length,
    gastoSemAtribuicao: dados.atribuicao.gastoSemAtribuicao,
    leads: leadsDoRecorte.length,
  });

  return apiSuccess(dados, access.meta, { headers: rate.headers });
}
