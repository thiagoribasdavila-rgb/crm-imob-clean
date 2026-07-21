import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/security/webhook-signature";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceDistributedRateLimit } from "@/lib/security/abuse-protection";
import { integrationCatalog } from "@/lib/integrations/catalog";
import { normalizePortalLead } from "@/lib/integrations/portals/normalize";

export const dynamic = "force-dynamic";

const portalProviders = new Set<string>(integrationCatalog.filter((item) => item.group === "portals").map((item) => item.provider));

// Webhook inbound assinado por portal. A conta do portal chega no header
// x-atlas-portal-account e resolve a fonte (portal_lead_sources) → organização
// e segredo; a assinatura HMAC-256 do corpo cru é verificada com esse segredo.
// Persiste o lead com dedup e delega o processamento ao outbox (portal.lead.ingest).
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!portalProviders.has(provider)) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }

  const distributed = await enforceDistributedRateLimit(request, { scope: `portal-webhook:${provider}`, limit: 120, windowSeconds: 60 });
  if (!distributed.allowed) return distributed.response;
  const rate = checkRateLimit(clientKey(request, `portal-webhook:${provider}`), { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)) } },
    );
  }

  const accountId = request.headers.get("x-atlas-portal-account");
  if (!accountId) {
    logger.warn("portal.webhook.missing_account", { provider });
    return NextResponse.json({ error: "missing_account" }, { status: 400 });
  }

  const body = await request.text();
  const admin = getSupabaseAdmin();

  const { data: source, error: sourceError } = await admin
    .from("portal_lead_sources")
    .select("id,organization_id,secret,default_owner_id,name")
    .eq("provider", provider)
    .eq("external_account_id", accountId)
    .eq("active", true)
    .maybeSingle();

  if (sourceError) {
    // Erro de consulta (transitório de banco) NÃO é "fonte desconhecida":
    // responde 503 para o portal reenviar o webhook em vez de perder o lead.
    logger.error("portal.webhook.source_lookup_failed", sourceError, { provider, accountId });
    return NextResponse.json({ error: "source_lookup_failed" }, { status: 503, headers: { "Retry-After": "60" } });
  }

  if (!source) {
    // Fonte consultada com sucesso e realmente não mapeada: persiste o corpo
    // cru no log estruturado (best-effort) para replay manual. Corpo ainda não
    // autenticado neste ponto (o segredo HMAC pertence à fonte), por isso vai
    // apenas para log, nunca para tabelas de leads.
    logger.warn("portal.webhook.unknown_source", { provider, accountId, contentLength: body.length, payload: body });
    return NextResponse.json({ error: "unknown_source" }, { status: 404 });
  }

  const signature = request.headers.get("x-atlas-signature-256");
  if (!verifyWebhookSignature(body, signature, source.secret)) {
    logger.warn("portal.webhook.invalid_signature", { provider, sourceId: source.id, contentLength: body.length });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const normalized = normalizePortalLead(provider, payload);
  if (!normalized.externalLeadId) {
    logger.warn("portal.webhook.unidentified_lead", { provider, sourceId: source.id });
    return NextResponse.json({ error: "unidentified_lead" }, { status: 422 });
  }

  const { data: inserted, error: insertError } = await admin.from("portal_lead_events").insert({
    organization_id: source.organization_id,
    source_id: source.id,
    provider,
    external_lead_id: normalized.externalLeadId,
    listing_id: normalized.listingId,
    contact: { name: normalized.name, email: normalized.email, phone: normalized.phone, message: normalized.message },
    payload: normalized.raw,
    received_at: new Date().toISOString(),
  }).select("id").single();

  if (insertError) {
    if (insertError.code === "23505") {
      logger.info("portal.webhook.duplicate", { provider, sourceId: source.id, externalLeadId: normalized.externalLeadId });
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }
    logger.error("portal.webhook.persistence_failed", insertError, { provider, externalLeadId: normalized.externalLeadId });
    return NextResponse.json({ error: "persistence_failed" }, { status: 500 });
  }

  const { error: outboxError } = await admin.from("integration_outbox").insert({
    organization_id: source.organization_id,
    topic: "portal.lead.ingest",
    aggregate_type: "portal_lead_event",
    aggregate_id: inserted.id,
    payload: { provider, externalLeadId: normalized.externalLeadId },
  });

  if (outboxError) {
    // Sem outbox o lead nunca seria processado: 500 força o reenvio pelo portal.
    logger.error("portal.webhook.outbox_failed", outboxError, { provider, eventId: inserted.id, externalLeadId: normalized.externalLeadId });
    return NextResponse.json({ error: "outbox_failed" }, { status: 500 });
  }

  logger.info("portal.webhook.accepted", { provider, sourceId: source.id, eventId: inserted.id });
  return NextResponse.json({ received: true, eventId: inserted.id }, { status: 200 });
}
