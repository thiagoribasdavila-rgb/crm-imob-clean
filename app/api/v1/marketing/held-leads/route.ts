import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * FILA DE LEADS REPRESADAS — o que já foi pago e ainda não entrou.
 *
 * A fila de distribuição do CRM resolve lead que ENTROU e está sem dono. Não
 * enxerga a represa de verdade: 119 leads paradas em 25 formulários da Meta que
 * o CRM não atende. Elas já custaram verba, existem, têm nome e telefone — e
 * nenhuma tela do produto sabia dizer isso.
 *
 * Aqui a diretoria vê a represa por formulário e ABRE a comporta que quiser.
 *
 * ── POR QUE LIBERAR É ATO EXPLÍCITO, E NUNCA AUTOMÁTICO ────────────────────
 * Cada lead liberada nasce com relógio de primeiro contato correndo — 5 minutos
 * nas de mídia paga. Abrir os 25 formulários de uma vez com 3 corretores
 * significa 119 relógios estourando juntos e um SLA nascido vencido, que é
 * exatamente o estado que a operação levou semanas para acumular.
 *
 * Por isso: nenhum "liberar tudo". A diretoria nomeia os formulários, o sistema
 * diz quantas leads virão antes, e a distribuição é passo consciente — feito
 * aqui mesmo se `distribuir: true`, pelo motor governado que honra prioridade,
 * capacidade e reserva de aceite.
 */

const GRAPH = "https://graph.facebook.com";
/** Acima disto, a liberação vira enxurrada para uma equipe pequena. */
const TETO_POR_LIBERACAO = 200;

type FormularioDaMeta = { id: string; name?: string; leads_count?: number };

async function tokenDaPagina(pageId: string, systemToken: string, versao: string) {
  const resposta = await fetch(`${GRAPH}/${versao}/${encodeURIComponent(pageId)}?fields=access_token`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${systemToken}` },
  });
  const corpo = await resposta.json().catch(() => ({})) as { access_token?: string };
  return corpo.access_token ?? null;
}

async function formulariosDaPagina(pageId: string, pageToken: string, versao: string) {
  const formularios: FormularioDaMeta[] = [];
  let after: string | null = null;
  for (let volta = 0; volta < 20; volta += 1) {
    const url = `${GRAPH}/${versao}/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name,leads_count&limit=50${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const resposta = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${pageToken}` } });
    const corpo = await resposta.json().catch(() => ({})) as { data?: FormularioDaMeta[]; paging?: { cursors?: { after?: string } } };
    formularios.push(...(corpo.data ?? []));
    after = corpo.paging?.cursors?.after ?? null;
    if (!after || !(corpo.data ?? []).length) break;
  }
  return formularios;
}

function podeLiberar(papel: string) {
  // Liberar represa move verba já gasta para a operação e dispara relógio de
  // SLA. É decisão de quem responde pelo resultado.
  return ["director", "superintendent", "admin"].includes(papel);
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 20, windowMs: 60_000, scope: "marketing.held-leads.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!podeLiberar(papel) && papel !== "manager") {
    return apiError("FORBIDDEN", "Fila de represadas é da liderança comercial.", access.meta, { status: 403, headers: rate.headers });
  }

  const systemToken = process.env.META_LEAD_ACCESS_TOKEN;
  const versao = process.env.META_GRAPH_API_VERSION || "v23.0";
  const pageId = String(process.env.META_PAGE_ID || "").trim();
  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();

  const fontes = await admin
    .from("meta_lead_sources")
    .select("id,form_id,name,active")
    .eq("organization_id", organizationId);
  if (fontes.error) {
    return apiError("META_FONTES_INDISPONIVEIS", "Aplique a migração de Meta Lead Ads.", access.meta, { status: 503, headers: rate.headers });
  }
  const porFormulario = new Map((fontes.data ?? []).map((f) => [String(f.form_id), f]));

  // Quantas já entraram, por formulário. É o que separa "represada" de "já veio".
  const entradas = await admin
    .from("meta_lead_events")
    .select("form_id")
    .eq("organization_id", organizationId)
    .limit(10000);
  const jaEntraram = new Map<string, number>();
  for (const linha of (entradas.data ?? []) as Array<{ form_id: string | null }>) {
    const chave = String(linha.form_id ?? "");
    if (chave) jaEntraram.set(chave, (jaEntraram.get(chave) ?? 0) + 1);
  }

  if (!systemToken || !pageId) {
    return apiSuccess({
      disponivel: false,
      motivo: "META_LEAD_ACCESS_TOKEN ou META_PAGE_ID ausente — sem eles não dá para saber o que está represado na Meta.",
      represadas: [], totalRepresado: 0,
    }, access.meta, { headers: rate.headers });
  }

  const pageToken = await tokenDaPagina(pageId, systemToken, versao);
  if (!pageToken) {
    return apiError("META_PAGE_TOKEN_INDISPONIVEL", "Não foi possível derivar o token da página.", access.meta, { status: 502, headers: rate.headers });
  }
  const formularios = await formulariosDaPagina(pageId, pageToken, versao);

  const represadas = formularios
    .map((f) => {
      const id = String(f.id);
      const fonte = porFormulario.get(id);
      const naMeta = Number(f.leads_count ?? 0);
      const entraram = jaEntraram.get(id) ?? 0;
      return {
        formId: id,
        nome: f.name ?? null,
        leadsNaMeta: naMeta,
        jaEntraram: entraram,
        // O que a Meta tem e o CRM não. Nunca negativo: lead pode entrar por
        // webhook e sumir do leads_count depois dos 90 dias de retenção.
        represadas: Math.max(0, naMeta - entraram),
        registrada: Boolean(fonte),
        ativa: Boolean(fonte?.active),
        // Formulário sem fonte registrada descarta lead nova em silêncio.
        descartaLeadNova: !fonte || !fonte.active,
      };
    })
    .filter((linha) => linha.represadas > 0)
    .sort((a, b) => b.represadas - a.represadas);

  const total = represadas.reduce((soma, l) => soma + l.represadas, 0);
  return apiSuccess({
    disponivel: true,
    totalRepresado: total,
    formulariosComRepresa: represadas.length,
    tetoPorLiberacao: TETO_POR_LIBERACAO,
    podeLiberar: podeLiberar(papel),
    represadas,
    aviso: total
      ? `${total} lead(s) já pagas e fora do CRM. Cada uma liberada nasce com o relógio de primeiro contato correndo — libere em ondas que a equipe consiga atender.`
      : null,
  }, access.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 6, windowMs: 60_000, scope: "marketing.held-leads.release" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!podeLiberar(papel)) {
    return apiError("FORBIDDEN", "Liberar represa é da diretoria — move verba já gasta para a operação.", access.meta, { status: 403, headers: rate.headers });
  }

  const body = (await request.json().catch(() => ({}))) as { formIds?: string[]; distribuir?: boolean; desdeUnix?: number };
  const formIds = (body.formIds ?? []).map((id) => String(id).trim()).filter(Boolean);
  if (!formIds.length) {
    return apiError("FORMULARIO_NAO_INFORMADO", "Escolha os formulários a liberar. Não existe 'liberar tudo' de propósito.", access.meta, { status: 400, headers: rate.headers });
  }

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();

  // Ativar a fonte é o que faz o backfill enxergar o formulário — e o que faz o
  // webhook parar de descartar lead nova dele.
  const ativacao = await admin
    .from("meta_lead_sources")
    .update({ active: true })
    .eq("organization_id", organizationId)
    .in("form_id", formIds)
    .select("form_id,name");
  if (ativacao.error) {
    return apiError("FONTE_NAO_ATIVADA", ativacao.error.message, access.meta, { status: 409, headers: rate.headers });
  }
  const ativadas = (ativacao.data ?? []).map((f) => String(f.form_id));
  const naoRegistrados = formIds.filter((id) => !ativadas.includes(id));

  // O backfill é a esteira existente: grava em meta_lead_events e enfileira no
  // outbox, de onde o worker cria as leads. Não duplico essa lógica aqui.
  const origem = new URL(request.url).origin;
  const backfill = await fetch(`${origem}/api/v1/integrations/meta/backfill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: request.headers.get("authorization") ?? "",
    },
    body: JSON.stringify({ sinceUnix: body.desdeUnix ?? Math.floor(Date.now() / 1000) - 90 * 86_400 }),
  });
  const resultado = await backfill.json().catch(() => ({})) as { fetched?: number; accepted?: number; duplicates?: number };

  let distribuicao: unknown = null;
  if (body.distribuir === true) {
    // Motor governado: honra prioridade, capacidade e reserva de aceite. Chamar
    // a RPC direto aqui pularia essas regras.
    const engine = await admin.rpc("distribute_project_leads_v4", {
      p_actor_id: access.access.profile.id,
      p_organization_id: organizationId,
      p_development_id: null,
      p_limit: TETO_POR_LIBERACAO,
      p_acceptance_minutes: 5,
    });
    distribuicao = engine.error
      ? { executada: false, motivo: engine.error.code === "42883" || engine.error.code === "PGRST202" ? "motor governado ausente neste banco" : engine.error.message }
      : { executada: true, resultado: engine.data };
  }

  structuredApiLog("info", "marketing.represa_liberada", request, access.meta, {
    organizationId, formularios: ativadas.length, buscadas: resultado.fetched ?? 0, distribuiu: body.distribuir === true,
  });

  return apiSuccess({
    formulariosAtivados: ativadas,
    naoRegistrados,
    buscadasNaMeta: resultado.fetched ?? 0,
    aceitas: resultado.accepted ?? 0,
    duplicadas: resultado.duplicates ?? 0,
    distribuicao,
    // A lead entra na fila do outbox; quem a transforma em lead do CRM é o
    // worker. Dizer isso evita a leitura de que "liberou, então já está lá".
    proximoPasso: body.distribuir === true
      ? "As leads entram pela fila de saída e são distribuídas em seguida. Confira em Distribuição."
      : "As leads entram pela fila de saída. Distribua em Distribuição — sem dono, ninguém é cobrado pelo SLA.",
    avisos: [
      naoRegistrados.length
        ? `${naoRegistrados.length} formulário(s) não estão registrados como fonte. Use Marketing → Formulários da Meta → Registrar antes de liberar.`
        : null,
      (resultado.accepted ?? 0) > 0 && body.distribuir !== true
        ? `${resultado.accepted} lead(s) liberadas SEM dono. O relógio de primeiro contato já está correndo para elas.`
        : null,
    ].filter(Boolean),
  }, access.meta, { headers: rate.headers });
}
