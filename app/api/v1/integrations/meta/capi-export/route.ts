import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildCapiLeadEvents,
  isCapiEventCandidate,
  sendCapiBatch,
  type CapiBatch,
  type CapiDiscardEventRow,
  type CapiLeadRow,
} from "@/lib/integrations/meta/capi-feedback";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

// GET/POST /api/v1/integrations/meta/capi-export — onda 5 da estratégia Meta
// (docs/ESTRATEGIA_META_ANDROMEDA.md §3 e §5).
//
// GET  (dry-run): monta o lote CAPI da janela (?days, default 7, máx 90) a
//      partir de leads + lead_events VIVOS da organização e devolve os payloads
//      com identificadores JÁ hasheados (SHA-256 server-side) para revisão
//      humana. Nenhum envio acontece aqui, nunca.
// POST (envio):   reconstrói o MESMO lote no servidor (payload do cliente nunca
//      é aceito como evento) e chama sendCapiBatch — que só sai para a rede com
//      ATLAS_META_CAPI_ENABLED=true + META_CONVERSIONS_ACCESS_TOKEN +
//      META_CAPI_DATASET_ID válidos. Fora disso: 409 com o passo a passo do
//      runbook (§5). Janela do envio é limitada a 7 dias — a Meta descarta
//      event_time mais antigo que isso.
//
// PII: e-mail/telefone nunca aparecem em claro na resposta nem nos logs — só
// hashes e contagens. Tenant scoping explícito (.eq organization_id) em todas
// as queries, além do RLS do client autenticado.

const DAY = 86_400_000;
const META_SEND_WINDOW_DAYS = 7;

// budget_min/budget_max saíram do select porque orçamento DECLARADO deixou de
// ser valor de venda (lib/integrations/meta/capi-feedback.ts) — carregá-los só
// convidaria a reintroduzir a estimativa.
const LEAD_BASE_SELECT = "id,email,phone,status,score_ia,temperature,campaign_id,created_at";
// leads.metadata guarda o consentimento (metadata.meta.dataSharingConsent) e
// NÃO existe em todo ambiente — no banco de produção a coluna não está lá.
// Pedi-la direto no select derrubaria a rota inteira com 42703; por isso a
// disponibilidade é sondada antes e a ausência vira lacuna declarada.
const LEAD_SELECT_WITH_CONSENT = `${LEAD_BASE_SELECT},metadata`;

type ExportLeadRow = CapiLeadRow & { metadata?: unknown };

type ConsentState = "granted" | "denied" | "unverifiable";

/**
 * Estado do consentimento do lead. Ausência de campo, de coluna ou de objeto
 * NUNCA é lida como consentimento — é "negado" ou "não verificável", que
 * suprimem igual mas são contados em separado para o operador saber se o
 * problema é do dado ou do ambiente.
 */
function consentStateOf(lead: ExportLeadRow, columnAvailable: boolean): ConsentState {
  if (!columnAvailable) return "unverifiable";
  const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
  const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
  return meta.dataSharingConsent === true ? "granted" : "denied";
}

function clampDays(value: string | null | undefined, fallback: number, max: number) {
  // Number(null)/Number("") valem 0 — sem a guarda, chamada sem ?days viraria
  // janela de 1 dia (mesma lição do discard-report).
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.round(parsed)));
}

// Lição F1: o PostgREST corta silenciosamente no max-rows do servidor (1000 no
// Supabase). Sem .range() explícito o lote perderia linhas sem erro — falso
// "lote completo" numa exportação que será auditada. Paginamos até esgotar,
// com teto de segurança e flag de truncamento honesta.
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const ID_CHUNK = 200;

type QueryPage<T> = PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>;

async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => QueryPage<T>,
): Promise<{ rows: T[]; truncated: boolean; error: { message?: string; code?: string } | null }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) return { rows, truncated: false, error };
    if (!data?.length) return { rows, truncated: false, error: null };
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { rows, truncated: false, error: null };
  }
  return { rows, truncated: true, error: null };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

type ConsentReport = {
  required: boolean;
  policySource: "config" | "default_conservative";
  columnAvailable: boolean;
  suppressedLeads: { denied: number; unverifiable: number };
  suppressedDiscardEvents: number;
};

type WindowBatch = {
  batch: CapiBatch;
  period: { start: string; end: string; days: number };
  truncated: boolean;
  olderThanSendWindow: number;
  consent: ConsentReport;
  blockers: string[];
};

/**
 * Política de consentimento da organização. Sem linha legível em
 * meta_conversion_configs (tabela que não existe no banco de produção) o
 * default é EXIGIR consentimento: presumir o contrário faria a ausência de
 * configuração autorizar a saída de PII.
 */
async function loadConsentPolicy(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("meta_conversion_configs")
    .select("consent_required")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) return { required: true, policySource: "default_conservative" as const };
  return { required: data.consent_required !== false, policySource: "config" as const };
}

async function loadWindowBatch(
  supabase: SupabaseClient,
  organizationId: string,
  days: number,
): Promise<{ ok: true; value: WindowBatch } | { ok: false; step: string; error: { message?: string; code?: string } }> {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY);
  const since = start.toISOString();

  const [policy, consentProbe] = await Promise.all([
    loadConsentPolicy(supabase, organizationId),
    supabase.from("leads").select("id,metadata").eq("organization_id", organizationId).limit(1),
  ]);
  const consentColumnAvailable = !consentProbe.error;
  const leadSelect = consentColumnAvailable ? LEAD_SELECT_WITH_CONSENT : LEAD_BASE_SELECT;

  const [leadResult, discardResult] = await Promise.all([
    // O select é escolhido em tempo de execução (a coluna de consentimento pode
    // não existir), então o parser de tipos do PostgREST não consegue derivar a
    // linha — o shape é declarado aqui por ExportLeadRow.
    fetchAllRows<ExportLeadRow>((from, to) =>
      supabase
        .from("leads")
        .select(leadSelect)
        .eq("organization_id", organizationId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to) as unknown as QueryPage<ExportLeadRow>,
    ),
    fetchAllRows<CapiDiscardEventRow & { id: string }>((from, to) =>
      supabase
        .from("lead_events")
        .select("id,lead_id,metadata,created_at")
        .eq("organization_id", organizationId)
        .eq("event_type", "lead_discarded")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (leadResult.error) return { ok: false, step: "leads", error: leadResult.error };
  if (discardResult.error) return { ok: false, step: "lead_events", error: discardResult.error };

  // Descarte na janela pode apontar para lead criado ANTES da janela — os
  // identificadores desse lead precisam ser carregados à parte (em chunks,
  // paginados) para o evento LeadDisqualified não ser perdido.
  const windowLeadIds = new Set(leadResult.rows.map((lead) => lead.id));
  const missingIds = [...new Set(
    discardResult.rows
      .map((row) => row.lead_id)
      .filter((value): value is string => Boolean(value) && !windowLeadIds.has(value as string)),
  )];
  const extraLeads: ExportLeadRow[] = [];
  for (const ids of chunk(missingIds, ID_CHUNK)) {
    const extraResult = await fetchAllRows<ExportLeadRow>((from, to) =>
      supabase
        .from("leads")
        .select(leadSelect)
        .eq("organization_id", organizationId)
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to) as unknown as QueryPage<ExportLeadRow>,
    );
    if (extraResult.error) return { ok: false, step: "leads_by_id", error: extraResult.error };
    extraLeads.push(...extraResult.rows);
  }

  // Leads fora da janela entram SOMENTE como fonte de identificadores para os
  // descartes: score/temperatura/status neutralizados para o builder não gerar
  // QualifiedLead/ConvertedLead retroativos com event_time fora da janela.
  const identifierOnlyLeads: ExportLeadRow[] = extraLeads
    .filter((lead) => !windowLeadIds.has(lead.id))
    .map((lead) => ({
      id: lead.id,
      email: lead.email,
      phone: lead.phone,
      campaign_id: lead.campaign_id,
      // metadata segue junto: mesmo entrando só como fonte de identificador, é
      // a PII deste lead que viajaria no evento de descarte, então o
      // consentimento dele também precisa ser avaliado.
      metadata: lead.metadata,
      status: null,
      score_ia: null,
      temperature: null,
      created_at: null,
    }));

  // Id da campanha NA META por lead: o builder só pode emitir
  // custom_data.campaign_id com o id externo, nunca com o uuid interno do CRM
  // (que a Meta não reconhece e que não deve vazar para terceiro). A leitura é
  // tolerante: sem marketing_campaigns legível o campo simplesmente fica nulo,
  // e nenhum evento é perdido por causa disso.
  const allLeads = [...leadResult.rows, ...identifierOnlyLeads];
  const campaignIds = [...new Set(allLeads.map((lead) => lead.campaign_id).filter(Boolean))] as string[];
  const externalByCampaignId = new Map<string, string>();
  for (const ids of chunk(campaignIds, ID_CHUNK)) {
    const campaignResult = await supabase
      .from("marketing_campaigns")
      .select("id,external_campaign_id")
      .eq("organization_id", organizationId)
      .in("id", ids);
    for (const row of campaignResult.data ?? []) {
      const external = String(row.external_campaign_id ?? "").trim();
      if (external) externalByCampaignId.set(String(row.id), external);
    }
  }

  // Consentimento: MESMA régua do caminho automático (lib/meta/conversions.ts),
  // que já bloqueia quando falta consentimento. Sem isto, este caminho — o
  // único que envia sinal sem test_event_code — hasheava e-mail e telefone de
  // qualquer lead da janela. Falha FECHADA: quem não tem consentimento
  // verificado não entra no lote, e a lacuna é contada e declarada.
  const suppressedLeads = { denied: 0, unverifiable: 0 };
  const allowedLeads = policy.required
    ? allLeads.filter((lead) => {
        const state = consentStateOf(lead, consentColumnAvailable);
        if (state === "granted") return true;
        // Só conta quem realmente geraria evento — contar a janela inteira
        // inflaria a lacuna e mentiria sobre o tamanho do problema.
        if (isCapiEventCandidate(lead)) {
          if (state === "unverifiable") suppressedLeads.unverifiable += 1;
          else suppressedLeads.denied += 1;
        }
        return false;
      })
    : allLeads;

  const knownLeadIds = new Set(allLeads.map((lead) => lead.id));
  const allowedLeadIds = new Set(allowedLeads.map((lead) => lead.id));
  let suppressedDiscardEvents = 0;
  const allowedDiscards = discardResult.rows.filter((row) => {
    // O evento de descarte carrega a PII hasheada do lead — sem consentimento
    // dele, o descarte também não sai. Lead desconhecido segue para o builder,
    // que já o contabiliza em skipped.discardLeadMissing.
    if (!row.lead_id || !knownLeadIds.has(row.lead_id)) return true;
    if (allowedLeadIds.has(row.lead_id)) return true;
    suppressedDiscardEvents += 1;
    return false;
  });

  const batch = buildCapiLeadEvents({
    organizationId,
    leads: allowedLeads.map((lead) => ({
      ...lead,
      campaign_external_id: lead.campaign_id ? externalByCampaignId.get(lead.campaign_id) ?? null : null,
      // Não há no banco vivo fonte de valor APURADO de venda (a tabela
      // opportunities não existe em produção e nenhum caminho do repositório a
      // escreve), então o campo vai ausente de propósito: o builder suprime e
      // conta a venda em vez de estimar valor.
    })),
    discardEvents: allowedDiscards,
  });

  const sendWindowFloor = Math.floor((Date.now() - META_SEND_WINDOW_DAYS * DAY) / 1000);
  const olderThanSendWindow = batch.events.filter((event) => event.event_time < sendWindowFloor).length;

  const blockers = [...batch.blockers];
  if (policy.required && !consentColumnAvailable) {
    blockers.push(
      "consentimento_nao_verificavel: leads.metadata não está disponível neste banco, então nenhum consentimento pôde ser verificado e NENHUM evento pode sair. Aplique a migration que cria a coluna antes de esperar lote.",
    );
  }
  if (policy.required && policy.policySource === "default_conservative") {
    blockers.push(
      "politica_de_consentimento_presumida: meta_conversion_configs não está legível para esta organização — o export assume consentimento OBRIGATÓRIO até que a configuração exista.",
    );
  }
  if (suppressedLeads.denied > 0 || suppressedDiscardEvents > 0) {
    blockers.push(
      `consentimento_ausente: ${suppressedLeads.denied} lead(s) e ${suppressedDiscardEvents} descarte(s) ficaram fora do lote por não terem consentimento de compartilhamento registrado.`,
    );
  }

  return {
    ok: true,
    value: {
      batch,
      period: { start: since, end: end.toISOString(), days },
      truncated: leadResult.truncated || discardResult.truncated,
      olderThanSendWindow,
      consent: {
        required: policy.required,
        policySource: policy.policySource,
        columnAvailable: consentColumnAvailable,
        suppressedLeads,
        suppressedDiscardEvents,
      },
      blockers,
    },
  };
}

function envReadiness() {
  return {
    flagEnabled: process.env.ATLAS_META_CAPI_ENABLED === "true",
    tokenPresent: Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN),
    datasetConfigured: /^\d{5,30}$/.test(String(process.env.META_CAPI_DATASET_ID ?? "").trim()),
  };
}

const ACTIVATION_STEPS = [
  "1) Valide o dry-run (GET) por pelo menos 2 semanas — docs/ESTRATEGIA_META_ANDROMEDA.md §5.",
  "2) Defina ATLAS_META_CAPI_ENABLED=true no ambiente.",
  "3) Configure META_CONVERSIONS_ACCESS_TOKEN e META_CAPI_DATASET_ID (somente dígitos).",
  "4) Reinicie o app e repita o POST.",
];

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "meta-capi-export" });
  if (!rate.ok) return rate.response;

  // Gestor para cima — mesmo padrão de discard-report/broker-daily: roles
  // compara com o commercialRole efetivo e admin resolve para "director".
  const identity = await requireAccessContext(request, {
    roles: ["director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const days = clampDays(request.nextUrl.searchParams.get("days"), 7, 90);

  const loaded = await loadWindowBatch(identity.supabase, organizationId, days);
  if (!loaded.ok) {
    logger.warn("meta.capi_export.read_failed", {
      organizationId,
      step: loaded.step,
      code: loaded.error.code,
      message: loaded.error.message,
    });
    return apiError(
      "META_CAPI_EXPORT_LOAD_FAILED",
      "O lote CAPI está temporariamente indisponível.",
      identity.meta,
      { status: 503 },
    );
  }

  const { batch, period, truncated, olderThanSendWindow, consent, blockers } = loaded.value;
  return apiSuccess(
    {
      mode: "dry-run",
      scope: { organizationId, actorId: identity.access.profile.id, minimumRole: "manager" },
      period,
      ...envReadiness(),
      events: batch.events,
      summary: {
        ...batch.summary,
        olderThanSendWindow,
        sendWindowDays: META_SEND_WINDOW_DAYS,
      },
      consent,
      blockers,
      truncated,
      taxonomyVersion: batch.taxonomyVersion,
      signalVersion: batch.signalVersion,
      privacy: "e-mail/telefone hasheados SHA-256 no servidor; PII nunca sai em claro",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  // Rate limit apertado: envio externo é irreversível do lado da Meta.
  const rate = enforceRateLimit(request, { limit: 5, windowMs: 60_000, scope: "meta-capi-send" });
  if (!rate.ok) return rate.response;

  // Enviar é efeito externo irreversível sobre dado pessoal de terceiro: sai da
  // alçada de gestor e fica com a diretoria, a mesma régua de quem executa
  // mudança na conta de anúncios. A prévia (GET) segue aberta à liderança.
  const identity = await requireAccessContext(request, {
    roles: ["director", "superintendent"],
  });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const readiness = envReadiness();

  const body = (await request.json().catch(() => ({}))) as { days?: unknown };
  // Envio real limitado à janela que a Meta aceita (7 dias) — janelas maiores
  // são exclusivas do dry-run de revisão.
  const requestedDays = clampDays(body.days === undefined ? null : String(body.days), META_SEND_WINDOW_DAYS, 90);
  const days = Math.min(requestedDays, META_SEND_WINDOW_DAYS);

  const loaded = await loadWindowBatch(identity.supabase, organizationId, days);
  if (!loaded.ok) {
    logger.warn("meta.capi_send.read_failed", {
      organizationId,
      step: loaded.step,
      code: loaded.error.code,
      message: loaded.error.message,
    });
    return apiError(
      "META_CAPI_EXPORT_LOAD_FAILED",
      "O lote CAPI está temporariamente indisponível — nada foi enviado.",
      identity.meta,
      { status: 503 },
    );
  }

  const { batch, period, consent, blockers } = loaded.value;

  try {
    const outcome = await sendCapiBatch(batch.events);

    if (!outcome.sent) {
      if (outcome.reason === "empty_batch") {
        return apiSuccess(
          { mode: "send", sent: false, reason: outcome.reason, message: outcome.message, period, summary: batch.summary, consent, blockers, ...readiness },
          identity.meta,
          { headers: { ...rate.headers, "Cache-Control": "no-store" } },
        );
      }
      // Flag desligada / credencial ausente: 409 com o caminho de ativação do
      // runbook — e garantidamente zero side effect de rede.
      return apiError(
        "META_CAPI_SEND_BLOCKED",
        outcome.message,
        identity.meta,
        {
          status: 409,
          details: { reason: outcome.reason, ...readiness, activation: ACTIVATION_STEPS },
          headers: { ...rate.headers, "Cache-Control": "no-store" },
        },
      );
    }

    logger.info("meta.capi_send.delivered", {
      organizationId,
      actorId: identity.access.profile.id,
      eventsSent: outcome.eventsSent,
      batches: outcome.batches,
      days,
    });
    return apiSuccess(
      {
        mode: "send",
        sent: true,
        eventsSent: outcome.eventsSent,
        batches: outcome.batches,
        period,
        requestedDays,
        windowClampedTo: requestedDays > days ? days : null,
        summary: batch.summary,
        consent,
        blockers,
        metaResponses: outcome.responses,
        signalVersion: batch.signalVersion,
        generatedAt: new Date().toISOString(),
      },
      identity.meta,
      { headers: { ...rate.headers, "Cache-Control": "no-store" } },
    );
  } catch (sendError) {
    logger.error("meta.capi_send.failed", sendError, {
      organizationId,
      eventCount: batch.summary.total,
      days,
    });
    return apiError(
      "META_CAPI_SEND_FAILED",
      "A Meta não aceitou o lote de conversões. Nenhum dado pessoal em claro foi transmitido; tente novamente.",
      identity.meta,
      { status: 502, headers: { ...rate.headers, "Cache-Control": "no-store" } },
    );
  }
}
