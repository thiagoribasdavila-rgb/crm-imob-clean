import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { queueMetaConversion } from "@/lib/meta/conversions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 3, windowMs: 60 * 60_000, scope: "meta-conversion-test" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Ensaio da Conversions API é exclusivo da diretoria.", identity.meta, { status: 403 });

  const body = await request.json().catch(() => null) as { leadId?: string } | null;
  const leadId = String(body?.leadId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return apiError("INVALID_LEAD", "Selecione uma lead Meta consentida para o ensaio.", identity.meta, { status: 400 });
  const cronSecret = process.env.ATLAS_CRON_SECRET;
  const baseUrl = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
  if (!process.env.META_CONVERSIONS_ACCESS_TOKEN || !cronSecret || !/^https:\/\//i.test(baseUrl)) return apiError("META_CAPI_NOT_READY", "Configure token de conversões, worker e URL HTTPS na Hostinger.", identity.meta, { status: 503 });

  const admin = getSupabaseAdmin();
  const [{ data: config }, { data: lead }] = await Promise.all([
    admin.from("meta_conversion_configs").select("dataset_id,mode,enabled,test_event_code,consent_required").eq("organization_id", identity.access.organization.id).maybeSingle(),
    admin.from("leads").select("id,email,phone,source,metadata").eq("id", leadId).eq("organization_id", identity.access.organization.id).maybeSingle(),
  ]);
  if (!config?.enabled || config.mode !== "test" || !config.test_event_code) return apiError("META_TEST_MODE_REQUIRED", "Ative o Dataset e o código de teste antes do ensaio.", identity.meta, { status: 400 });
  const metadata = lead?.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
  const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
  if (!lead || lead.source !== "Meta Lead Ads" || meta.dataSharingConsent !== true || (!lead.email && !lead.phone)) return apiError("LEAD_NOT_ELIGIBLE", "A lead precisa ser da Meta, possuir identificador e consentimento registrado.", identity.meta, { status: 400 });

  const eventKey = `phase-25-${leadId}-${crypto.randomUUID()}`;
  try {
    const queued = await queueMetaConversion({ organizationId: identity.access.organization.id, leadId, eventName: "Lead", eventId: eventKey, customData: { atlas_homologation_phase: 25 } });
    if (!queued.queued || !queued.eventId) throw new Error(`Evento não enfileirado: ${queued.reason || "indisponível"}`);
    const workerResponse = await fetch(`${baseUrl}/api/v2/outbox/process`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` }, cache: "no-store" });
    if (!workerResponse.ok) throw new Error(`Worker HTTP ${workerResponse.status}`);
    const { data: event } = await admin.from("meta_conversion_events").select("id,event_id,event_name,status,attempts,delivered_at,meta_response").eq("id", queued.eventId).eq("organization_id", identity.access.organization.id).single();
    const response = event?.meta_response && typeof event.meta_response === "object" ? event.meta_response as Record<string, unknown> : {};
    if (event?.status !== "delivered" || Number(response.events_received) !== 1) throw new Error("A Meta ainda não confirmou o recebimento do evento de teste.");
    return apiSuccess({ status: "passed", mode: config.mode, productionEnabled: false, datasetIdMasked: `••••${config.dataset_id.slice(-4)}`, eventId: event.event_id, eventName: event.event_name, eventsReceived: Number(response.events_received), traceId: typeof response.fbtrace_id === "string" ? response.fbtrace_id : null, attempts: event.attempts, deliveredAt: event.delivered_at }, identity.meta, { headers: rate.headers });
  } catch (error) {
    return apiError("META_CAPI_TEST_FAILED", "O ensaio não comprovou o recebimento no dataset de teste. Consulte os logs seguros.", identity.meta, { status: 502, details: error instanceof Error ? error.message.slice(0, 160) : "Falha" });
  }
}
