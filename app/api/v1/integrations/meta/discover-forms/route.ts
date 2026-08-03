import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolverPageId, validarFormId } from "@/lib/meta/identificadores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * DESCOBERTA DE FORMULÁRIOS DE LEAD DA META.
 *
 * O problema que resolve, medido em 2026-07-26:
 *
 *   - a página tem 25 formulários ativos, com ~122 leads acumulados;
 *   - o CRM conhecia UM, e o form_id registrado (279573218005583) não existe na
 *     Meta — faltam dois dígitos do id real (27957321800558327, 7 leads).
 *
 * As consequências desse id quebrado são silenciosas e caras: o backfill busca
 * num formulário inexistente e traz zero, e todo lead que chega pelo webhook de
 * um formulário não registrado cai em `meta.webhook.unmapped_payload` — some sem
 * virar lead no CRM.
 *
 * Registrar 25 formulários à mão ninguém faz. Esta rota lê a lista da própria
 * Meta e a concilia com o que o CRM tem.
 *
 * ── DUAS DECISÕES DE SEGURANÇA ─────────────────────────────────────────────
 *
 * 1. SIMULAÇÃO POR PADRÃO. Sem `aplicar: true` nada é escrito. Descobrir é
 *    leitura; registrar é decisão.
 *
 * 2. FORMULÁRIO NOVO NASCE INATIVO. Ativar os 25 de uma vez faria o backfill
 *    puxar ~122 leads e disparar 122 relógios de SLA sem ninguém pedir. A
 *    resposta traz o volume de cada um para a decisão ser informada — mesma
 *    doutrina do cadastro de usuário, onde nada nasce ativo por conta própria.
 *
 * Nada é apagado e nada é desativado: fonte que sumiu da Meta é REPORTADA como
 * órfã, não removida. Perder o histórico de atribuição por causa de um
 * formulário arquivado seria pior que conviver com a linha.
 */

const GRAPH = "https://graph.facebook.com";

type FormularioDaMeta = { id: string; name?: string; status?: string; leads_count?: number };

async function paginaAccessToken(pageId: string, systemToken: string, versao: string) {
  // O endpoint de leadgen_forms exige Page Access Token; o token do system user
  // não serve. Derivá-lo é uma chamada, e evita guardar mais um segredo.
  const resposta = await fetch(`${GRAPH}/${versao}/${encodeURIComponent(pageId)}?fields=access_token`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${systemToken}` },
  });
  const corpo = await resposta.json().catch(() => ({})) as { access_token?: string; error?: { message?: string; code?: number } };
  if (!resposta.ok || !corpo.access_token) {
    return { token: null as string | null, erro: corpo.error?.message ?? `HTTP ${resposta.status}` };
  }
  return { token: corpo.access_token, erro: null as string | null };
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 10, windowMs: 60_000, scope: "meta.discover-forms" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!["director", "superintendent", "manager", "admin"].includes(papel)) {
    return apiError("FORBIDDEN", "Descoberta de formulários é da liderança comercial.", access.meta, { status: 403, headers: rate.headers });
  }

  const systemToken = process.env.META_LEAD_ACCESS_TOKEN;
  const versao = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!systemToken) {
    return apiError("META_TOKEN_AUSENTE", "META_LEAD_ACCESS_TOKEN não está configurada.", access.meta, { status: 503, headers: rate.headers });
  }

  const body = (await request.json().catch(() => ({}))) as {
    pageId?: string;
    formId?: string | null;
    sourceName?: string;
    allForms?: boolean;
    aplicar?: boolean;
  };
  const aplicar = body.aplicar === true;
  const todosOsFormularios = body.allForms !== false;

  /**
   * ── A ORDEM DE RESOLUÇÃO, E POR QUE O PEDIDO VENCE ────────────────────────
   *
   * Antes: `body.pageId || process.env.META_PAGE_ID`. Parecia equivalente e não
   * é — o `||` deixa a variável global vencer quando o pedido traz um valor
   * INVÁLIDO. A pessoa colaria a conta de anúncios, o servidor consultaria em
   * silêncio a Página do ambiente, a tela mostraria formulários DE OUTRA PÁGINA
   * e nada denunciaria. Contornar entrada errada é pior que recusá-la.
   *
   * `resolverPageId` (lib/meta/identificadores.ts) impõe a ordem — pedido,
   * origem salva, ambiente — e RECUSA um valor presente e inválido em vez de
   * pular para o próximo.
   *
   * A validação vive num módulo puro porque a tela também precisa dela: duas
   * cópias da mesma regra divergem, e este repositório já pagou por isso em
   * `score`/`score_ia` e no recorte de status declarado nove vezes.
   */
  const vereditoDaPagina = resolverPageId({
    doPedido: body.pageId,
    doAmbiente: process.env.META_PAGE_ID,
  });
  if (!vereditoDaPagina.ok) {
    return apiError(vereditoDaPagina.codigo, vereditoDaPagina.mensagem, access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }
  const pageId = vereditoDaPagina.valor;

  const vereditoDoFormulario = validarFormId(body.formId, todosOsFormularios);
  if (!vereditoDoFormulario.ok) {
    return apiError(vereditoDoFormulario.codigo, vereditoDoFormulario.mensagem, access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }

  if (!pageId) {
    return apiError("META_PAGE_AUSENTE", "Informe pageId ou configure META_PAGE_ID.", access.meta, { status: 400, headers: rate.headers });
  }

  const { token: pageToken, erro: erroDeToken } = await paginaAccessToken(pageId, systemToken, versao);
  if (!pageToken) {
    return apiError("META_PAGE_TOKEN_INDISPONIVEL", `Não foi possível derivar o token da página: ${erroDeToken}`, access.meta, { status: 502, headers: rate.headers });
  }

  // Paginação por cursor próprio: seguir `paging.next` cru embutiria o token na
  // URL registrada em log de proxy.
  const formularios: FormularioDaMeta[] = [];
  let after: string | null = null;
  for (let volta = 0; volta < 20; volta += 1) {
    const url = `${GRAPH}/${versao}/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name,status,leads_count&limit=50${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const resposta = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${pageToken}` },
    });
    const corpo = await resposta.json().catch(() => ({})) as { data?: FormularioDaMeta[]; paging?: { cursors?: { after?: string } }; error?: { message?: string } };
    if (!resposta.ok || corpo.error) {
      return apiError("META_FORMULARIOS_INDISPONIVEIS", corpo.error?.message ?? `HTTP ${resposta.status}`, access.meta, { status: 502, headers: rate.headers });
    }
    formularios.push(...(corpo.data ?? []));
    after = corpo.paging?.cursors?.after ?? null;
    if (!after || !(corpo.data ?? []).length) break;
  }

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();
  const registradas = await admin
    .from("meta_lead_sources")
    .select("id,page_id,form_id,name,active")
    .eq("organization_id", organizationId);
  if (registradas.error) {
    return apiError("META_FONTES_INDISPONIVEIS", "Aplique a migração de Meta Lead Ads.", access.meta, { status: 503, headers: rate.headers });
  }

  const jaRegistradas = new Map((registradas.data ?? []).map((f) => [String(f.form_id), f]));
  const idsNaMeta = new Set(formularios.map((f) => String(f.id)));

  const novos = formularios.filter((f) => !jaRegistradas.has(String(f.id)));
  const conhecidos = formularios.filter((f) => jaRegistradas.has(String(f.id)));
  // Fonte registrada cujo id não existe mais (ou nunca existiu) na Meta. É o
  // caso do id truncado: o backfill busca ali e traz zero, para sempre.
  const orfas = (registradas.data ?? [])
    .filter((f) => f.form_id && !idsNaMeta.has(String(f.form_id)))
    .map((f) => ({ formId: String(f.form_id), nome: f.name, ativa: f.active }));

  let inseridos = 0;
  if (aplicar && novos.length) {
    const linhas = novos.map((f) => ({
      organization_id: organizationId,
      page_id: pageId,
      form_id: String(f.id),
      name: f.name || `Formulário ${f.id}`,
      // Inativo de propósito: ver o cabeçalho.
      active: false,
    }));
    const insercao = await admin.from("meta_lead_sources").insert(linhas).select("id");
    if (insercao.error) {
      return apiError("META_FONTES_NAO_REGISTRADAS", insercao.error.message, access.meta, { status: 409, headers: rate.headers });
    }
    inseridos = insercao.data.length;
  }

  const leadsNaMeta = formularios.reduce((soma, f) => soma + Number(f.leads_count ?? 0), 0);
  structuredApiLog("info", "meta.formularios_descobertos", request, access.meta, {
    organizationId, pageId, encontrados: formularios.length, novos: novos.length, orfas: orfas.length, aplicado: aplicar,
  });

  return apiSuccess({
    pageId,
    simulacao: !aplicar,
    encontradosNaMeta: formularios.length,
    leadsAcumuladosNaMeta: leadsNaMeta,
    jaRegistrados: conhecidos.length,
    novos: novos
      .map((f) => ({ formId: String(f.id), nome: f.name ?? null, status: f.status ?? null, leads: Number(f.leads_count ?? 0) }))
      .sort((a, b) => b.leads - a.leads),
    registrados: inseridos,
    // Um id registrado que não existe na Meta não dá erro em lugar nenhum: só
    // devolve lista vazia. Por isso precisa ser dito em voz alta.
    fontesOrfas: orfas,
    avisos: [
      orfas.length
        ? `${orfas.length} fonte(s) registrada(s) apontam para formulário inexistente na Meta — o backfill delas sempre trará zero.`
        : null,
      !aplicar && novos.length
        ? `Simulação: ${novos.length} formulário(s) novo(s) NÃO foram registrados. Reenvie com aplicar=true.`
        : null,
      aplicar && inseridos
        ? `${inseridos} formulário(s) registrados INATIVOS. Ative apenas os que a operação vai atender — ativar todos dispara o relógio de SLA de ${leadsNaMeta} leads.`
        : null,
    ].filter(Boolean),
  }, access.meta, { headers: rate.headers });
}
