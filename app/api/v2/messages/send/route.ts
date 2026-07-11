import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type Payload = {
  conversationId?: string;
  channel?: "whatsapp" | "email" | "instagram" | "messenger";
  recipient?: string;
  content?: string;
  templateId?: string;
};

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "v2-message-send"), { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Limite de envio excedido." }, { status: 429 });
  }

  try {
    const identity = await requireApiIdentity(request);
    const payload = (await request.json()) as Payload;

    if (!payload.conversationId || !payload.channel || !payload.recipient || !payload.content?.trim()) {
      return NextResponse.json({ error: "conversationId, channel, recipient e content são obrigatórios." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .select("id,organization_id")
      .eq("id", payload.conversationId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
    }

    const requiresApproval = payload.channel !== "email";
    const { data: message, error: messageError } = await admin
      .from("messages")
      .insert({
        organization_id: identity.organizationId,
        conversation_id: payload.conversationId,
        direction: "outbound",
        channel: payload.channel,
        recipient: payload.recipient,
        content: payload.content.trim(),
        status: "queued",
      })
      .select("id")
      .single();

    if (messageError || !message) throw messageError ?? new Error("Falha ao criar mensagem.");

    if (requiresApproval) {
      const { error: approvalError } = await admin.from("approval_requests").insert({
        organization_id: identity.organizationId,
        request_type: "outbound_message",
        entity_type: "message",
        entity_id: message.id,
        payload: { channel: payload.channel, recipient: payload.recipient, templateId: payload.templateId },
        requested_by: identity.userId,
      });
      if (approvalError) throw approvalError;
    } else {
      const { error: outboxError } = await admin.from("integration_outbox").insert({
        organization_id: identity.organizationId,
        topic: "message.send",
        aggregate_type: "message",
        aggregate_id: message.id,
        payload: { messageId: message.id, channel: payload.channel },
      });
      if (outboxError) throw outboxError;
    }

    logger.info("message.queued", { messageId: message.id, organizationId: identity.organizationId, channel: payload.channel });
    return NextResponse.json({ id: message.id, status: requiresApproval ? "pending_approval" : "queued" }, { status: 202 });
  } catch (error) {
    logger.error("message.queue_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao preparar mensagem." }, { status: 401 });
  }
}
