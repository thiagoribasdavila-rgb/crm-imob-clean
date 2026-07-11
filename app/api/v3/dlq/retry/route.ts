import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type RetryPayload = { eventId?: string };

export async function POST(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    const body = (await request.json()) as RetryPayload;
    if (!body.eventId) return NextResponse.json({ error: "eventId é obrigatório." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", identity.userId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!profile || !["admin", "manager"].includes(String(profile.role))) {
      return NextResponse.json({ error: "Apenas administradores e gestores podem reprocessar eventos." }, { status: 403 });
    }

    const { data: deadLetter, error: readError } = await admin
      .from("dead_letter_events")
      .select("id,outbox_event_id,resolved")
      .eq("id", body.eventId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (readError || !deadLetter) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    if (deadLetter.resolved) return NextResponse.json({ error: "Evento já resolvido." }, { status: 409 });
    if (!deadLetter.outbox_event_id) return NextResponse.json({ error: "Evento sem vínculo com a outbox." }, { status: 422 });

    const now = new Date().toISOString();
    const { error: outboxError } = await admin
      .from("integration_outbox")
      .update({ status: "pending", attempts: 0, available_at: now, locked_at: null, locked_by: null, last_error: null })
      .eq("id", deadLetter.outbox_event_id)
      .eq("organization_id", identity.organizationId);
    if (outboxError) throw outboxError;

    const { error: resolveError } = await admin
      .from("dead_letter_events")
      .update({ resolved: true, resolved_at: now, resolved_by: identity.userId })
      .eq("id", deadLetter.id)
      .eq("organization_id", identity.organizationId);
    if (resolveError) throw resolveError;

    logger.info("v3.dlq_requeued", { deadLetterId: deadLetter.id, outboxEventId: deadLetter.outbox_event_id, userId: identity.userId });
    return NextResponse.json({ status: "requeued", eventId: deadLetter.id, outboxEventId: deadLetter.outbox_event_id });
  } catch (error) {
    logger.error("v3.dlq_retry_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao reprocessar evento." }, { status: 500 });
  }
}
