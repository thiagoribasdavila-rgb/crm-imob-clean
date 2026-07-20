import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildCapiLeadEvents,
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

const LEAD_SELECT = "id,email,phone,status,score_ia,temperature,campaign_id,created_at,budget_min,budget_max";

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

type WindowBatch = {
  batch: CapiBatch;
  period: { start: string; end: string; days: number };
  truncated: boolean;
  olderThanSendWindow: number;
};

async function loadWindowBatch(
  supabase: SupabaseClient,
  organizationId: string,
  days: number,
): Promise<{ ok: true; value: WindowBatch } | { ok: false; step: string; error: { message?: string; code?: string } }> {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY);
  const since = start.toISOString();

  const [leadResult, discardResult] = await Promise.all([
    fetchAllRows<CapiLeadRow>((from, to) =>
      supabase
        .from("leads")
        .select(LEAD_SELECT)
        .eq("organization_id", organizationId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
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
  const extraLeads: CapiLeadRow[] = [];
  for (const ids of chunk(missingIds, ID_CHUNK)) {
    const extraResult = await fetchAllRows<CapiLeadRow>((from, to) =>
      supabase
        .from("leads")
        .select(LEAD_SELECT)
        .eq("organization_id", organizationId)
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (extraResult.error) return { ok: false, step: "leads_by_id", error: extraResult.error };
    extraLeads.push(...extraResult.rows);
  }

  // Leads fora da janela entram SOMENTE como fonte de identificadores para os
  // descartes: score/temperatura/status neutralizados para o builder não gerar
  // QualifiedLead/ConvertedLead retroativos com event_time fora da janela.
  const identifierOnlyLeads: CapiLeadRow[] = extraLeads
    .filter((lead) => !windowLeadIds.has(lead.id))
    .map((lead) => ({
      id: lead.id,
      email: lead.email,
      phone: lead.phone,
      campaign_id: lead.campaign_id,
      status: null,
      score_ia: null,
      temperature: null,
      created_at: null,
      budget_min: null,
      budget_max: null,
    }));

  const batch = buildCapiLeadEvents({
    organizationId,
    leads: [...leadResult.rows, ...identifierOnlyLeads],
    discardEvents: discardResult.rows,
  });

  const sendWindowFloor = Math.floor((Date.now() - META_SEND_WINDOW_DAYS * DAY) / 1000);
  const olderThanSendWindow = batch.events.filter((event) => event.event_time < sendWindowFloor).length;

  return {
    ok: true,
    value: {
      batch,
      period: { start: since, end: end.toISOString(), days },
      truncated: leadResult.truncated || discardResult.truncated,
      olderThanSendWindow,
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

  const { batch, period, truncated, olderThanSendWindow } = loaded.value;
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

  const identity = await requireAccessContext(request, {
    roles: ["director", "superintendent", "manager"],
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

  const { batch, period } = loaded.value;

  try {
    const outcome = await sendCapiBatch(batch.events);

    if (!outcome.sent) {
      if (outcome.reason === "empty_batch") {
        return apiSuccess(
          { mode: "send", sent: false, reason: outcome.reason, message: outcome.message, period, summary: batch.summary, ...readiness },
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
