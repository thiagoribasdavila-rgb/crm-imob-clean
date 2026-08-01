import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { signWebhookPayload } from "@/lib/security/webhook-signature";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 3, windowMs: 60 * 60_000, scope: "meta-webhook-test" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Ensaio real do webhook Meta é exclusivo da diretoria.", identity.meta, { status: 403 });
  const body = await request.json().catch(() => null) as { pageId?: string; formId?: string; leadgenId?: string } | null;
  const pageId = String(body?.pageId || "").trim(); const formId = String(body?.formId || "").trim(); const leadgenId = String(body?.leadgenId || "").trim();
  if (!/^\d{5,30}$/.test(pageId) || !/^\d{5,30}$/.test(formId) || !/^\d{5,40}$/.test(leadgenId)) return apiError("INVALID_META_TEST", "Informe IDs válidos da Página, Formulário e lead de teste oficial.", identity.meta, { status: 400 });
  const secret = process.env.META_APP_SECRET; const cronSecret = process.env.ATLAS_CRON_SECRET; const baseUrl = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
  if (!secret || !cronSecret || !process.env.META_LEAD_ACCESS_TOKEN || !/^https:\/\//i.test(baseUrl)) return apiError("META_TEST_NOT_READY", "Configure segredo, token, worker e URL HTTPS na Hostinger.", identity.meta, { status: 503 });
  const admin = getSupabaseAdmin();
  const { data: source } = await admin.from("meta_lead_sources").select("id,organization_id,page_id,form_id,name").eq("organization_id", identity.access.organization.id).eq("page_id", pageId).or(`form_id.eq.${formId},form_id.is.null`).eq("active", true).order("form_id", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (!source) return apiError("META_SOURCE_NOT_FOUND", "Cadastre esta Página/Formulário antes do ensaio.", identity.meta, { status: 400 });
  const payload = JSON.stringify({ object: "page", entry: [{ id: pageId, time: Math.floor(Date.now() / 1000), changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: pageId, form_id: formId, created_time: Math.floor(Date.now() / 1000) } }] }] });
  const signature = `sha256=${signWebhookPayload(payload, secret)}`;
  const deliver = async () => { const response = await fetch(`${baseUrl}/api/webhooks/meta`, { method: "POST", headers: { "Content-Type": "application/json", "x-hub-signature-256": signature }, body: payload, cache: "no-store" }); const result = await response.json() as Record<string, unknown>; if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`); return result; };
  try {
    const first = await deliver(); const second = await deliver();
    const workerResponse = await fetch(`${baseUrl}/api/v2/outbox/process`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` }, cache: "no-store" });
    if (!workerResponse.ok) throw new Error(`Worker HTTP ${workerResponse.status}`);
    const { data: event } = await admin.from("meta_lead_events").select("id,status,lead_id,page_id,form_id,ad_id,adset_id,campaign_external_id").eq("organization_id", identity.access.organization.id).eq("external_lead_id", leadgenId).single();
    if (!event?.lead_id || event.status !== "imported") throw new Error("Evento ainda não foi importado pelo worker.");
    const { data: leads, count } = await admin.from("leads").select("id,source,metadata", { count: "exact" }).eq("organization_id", identity.access.organization.id).contains("metadata", { meta: { externalLeadId: leadgenId } });
    const lead = leads?.[0]; const metadata = lead?.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {}; const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
    const attributionPreserved = meta.externalLeadId === leadgenId && meta.pageId === pageId && meta.formId === formId;
    if (count !== 1 || lead?.source !== "Meta Lead Ads" || !attributionPreserved) throw new Error("Deduplicação ou atribuição não conferiu.");
    return apiSuccess({ status: "passed", signatureVerified: Number(first.accepted) === 1, firstDelivery: first, duplicateDelivery: second, eventId: event.id, leadId: lead.id, leadCount: count, attribution: { externalLeadId: meta.externalLeadId, pageId: meta.pageId, formId: meta.formId, campaignId: meta.campaignId || null }, attributionPreserved, testedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
  } catch (error) { return apiError("META_WEBHOOK_TEST_FAILED", "O ensaio não comprovou assinatura, deduplicação e atribuição. Consulte os logs seguros.", identity.meta, { status: 502, details: error instanceof Error ? error.message.slice(0, 160) : "Falha" }); }
}
