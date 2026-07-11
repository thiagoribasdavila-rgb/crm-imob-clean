import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type EventPayload = {
  eventType?: string;
  source?: string;
  aggregateType?: string;
  aggregateId?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
};

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "v3-event-ingest"), { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Limite de eventos excedido." }, { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } });
  }

  try {
    const identity = await requireApiIdentity(request);
    const body = (await request.json()) as EventPayload;
    if (!body.eventType?.trim() || !body.source?.trim()) {
      return NextResponse.json({ error: "eventType e source são obrigatórios." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("atlas_events")
      .insert({
        organization_id: identity.organizationId,
        event_type: body.eventType.trim(),
        source: body.source.trim(),
        aggregate_type: body.aggregateType ?? null,
        aggregate_id: body.aggregateId ?? null,
        payload: body.payload ?? {},
        correlation_id: body.correlationId ?? crypto.randomUUID(),
      })
      .select("id,occurred_at")
      .single();

    if (error) throw error;
    logger.info("v3.event_ingested", { eventId: data.id, eventType: body.eventType, organizationId: identity.organizationId });
    return NextResponse.json(data, { status: 202 });
  } catch (error) {
    logger.error("v3.event_ingest_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao registrar evento.";
    const status = /token|sessão|autoriz/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
