import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { sendCapiBatch } from "@/lib/integrations/meta/capi-feedback";
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
//      dataset configurado em meta_conversion_configs. Fora disso: 409 com o passo a passo do
//      runbook (§5). Janela do envio é limitada a 7 dias — a Meta descarta
//      event_time mais antigo que isso.
//
// PII: e-mail/telefone nunca aparecem em claro na resposta nem nos logs — só
// hashes e contagens. Tenant scoping explícito (.eq organization_id) em todas
// as queries, além do RLS do client autenticado.
// O núcleo do lote — política de consentimento, filtro, montagem e bloqueios —
// vive em `lib/integrations/meta/capi-window.ts`, compartilhado com o worker.
// Duas cópias da régua de consentimento divergiriam, e o dia da divergência é
// o dia em que sai PII de quem não consentiu.
import { loadWindowBatch, loadOrgCapiConfig, META_SEND_WINDOW_DAYS } from "@/lib/integrations/meta/capi-window";

function clampDays(value: string | null | undefined, fallback: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
}

function envReadiness() {
  return {
    flagEnabled: process.env.ATLAS_META_CAPI_ENABLED === "true",
    tokenPresent: Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN),
    datasetConfigured: false, // agora vem de meta_conversion_configs, por organização — conferido na hora do envio

  };
}

const ACTIVATION_STEPS = [
  "1) Valide o dry-run (GET) por pelo menos 2 semanas — docs/ESTRATEGIA_META_ANDROMEDA.md §5.",
  "2) Defina ATLAS_META_CAPI_ENABLED=true no ambiente.",
  "3) Configure META_CONVERSIONS_ACCESS_TOKEN no servidor e o Dataset em Integrações › Meta › Conversões (o dataset é por organização, não do ambiente).",
  "4) Veja o primeiro evento chegar na aba de TESTE do Gerenciador de Eventos.",
  "5) Só então promova para produção — evento de teste não entra no aprendizado do algoritmo.",
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
    // Mesma config por organização que o worker usa. Antes daqui, o envio lia
    // dataset e modo do AMBIENTE e ignorava a tabela — então `mode='test'`
    // configurado ia como produção.
    const configDaOrg = await loadOrgCapiConfig(identity.supabase, organizationId);
    if (!configDaOrg) {
      return apiError("CAPI_NOT_CONFIGURED",
        "Esta organização não tem meta_conversion_configs — configure dataset e modo antes de enviar.",
        identity.meta, { status: 422 });
    }
    const outcome = await sendCapiBatch(batch.events, configDaOrg);

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
