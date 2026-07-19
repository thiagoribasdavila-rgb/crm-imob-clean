import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/security/webhook-signature";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceDistributedRateLimit } from "@/lib/security/abuse-protection";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn("meta.webhook.verification_failed", { mode, hasToken: Boolean(token) });
  return NextResponse.json({ error: "verification_failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const distributed = await enforceDistributedRateLimit(request, { scope: "meta-webhook", limit: 120, windowSeconds: 60 });
  if (!distributed.allowed) return distributed.response;
  const rate = checkRateLimit(clientKey(request, "meta-webhook"), { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const secret = process.env.META_APP_SECRET ?? "";

  if (!verifyWebhookSignature(body, signature, secret)) {
    logger.warn("meta.webhook.invalid_signature", { contentLength: body.length });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  type LeadgenValue = { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; adgroup_id?: string; campaign_id?: string; created_time?: number };
  type MetaPayload = { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: LeadgenValue }> }> };
  const event = payload as MetaPayload;
  const admin = getSupabaseAdmin();
  let accepted = 0;
  let duplicates = 0;
  let unmapped = 0;

  for (const entry of event.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;
      const value = change.value;
      const pageId = value.page_id || entry.id;
      if (!pageId) { unmapped += 1; continue; }
      let sourceQuery = admin.from("meta_lead_sources").select("id,organization_id").eq("page_id", pageId).eq("active", true);
      sourceQuery = value.form_id ? sourceQuery.or(`form_id.eq.${value.form_id},form_id.is.null`) : sourceQuery.is("form_id", null);
      const { data: sources } = await sourceQuery.order("form_id", { ascending: false, nullsFirst: false }).limit(1);
      const source = sources?.[0];
      if (!source) { unmapped += 1; continue; }

      const { data: inserted, error: insertError } = await admin.from("meta_lead_events").insert({
        organization_id: source.organization_id,
        source_id: source.id,
        external_lead_id: value.leadgen_id,
        page_id: pageId,
        form_id: value.form_id || null,
        ad_id: value.ad_id || null,
        adset_id: value.adgroup_id || null,
        campaign_external_id: value.campaign_id || null,
        payload: value,
        received_at: value.created_time ? new Date(value.created_time * 1000).toISOString() : new Date().toISOString(),
      }).select("id").single();
      if (insertError) {
        if (insertError.code === "23505") { duplicates += 1; continue; }
        logger.error("meta.webhook.persistence_failed", insertError, { leadgenId: value.leadgen_id });
        return NextResponse.json({ error: "persistence_failed" }, { status: 500 });
      }
      await admin.from("integration_outbox").insert({ organization_id: source.organization_id, topic: "meta.lead.fetch", aggregate_type: "meta_lead_event", aggregate_id: inserted.id, payload: { externalLeadId: value.leadgen_id } });
      accepted += 1;
    }
  }

  logger.info("meta.webhook.processed", { object: event.object, accepted, duplicates, unmapped });
  return NextResponse.json({ received: true, accepted, duplicates, unmapped }, { status: 200 });
}
