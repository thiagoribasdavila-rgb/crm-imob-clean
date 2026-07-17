import { NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { normalizeEmail, normalizePhoneE164 } from "@/lib/atlas/data-contracts";
import { claimIdempotency, completeIdempotency, enforceDistributedRateLimit, requestFingerprint } from "@/lib/security/abuse-protection";

export const dynamic = "force-dynamic";

type Payload = {
  conversationId?: string;
  channel?: "whatsapp" | "email" | "instagram" | "messenger";
  recipient?: string;
  content?: string;
  templateId?: string;
};

export async function POST(request: Request) {
  const distributed = await enforceDistributedRateLimit(request, { scope: "v2-message-send", limit: 30, windowSeconds: 60 });
  if (!distributed.allowed) return distributed.response;
  const rate = checkRateLimit(clientKey(request, "v2-message-send"), { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Limite de envio excedido." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
          "X-RateLimit-Remaining": String(rate.remaining),
        },
      },
    );
  }

  try {
    const identity = await requireApiIdentity(request);
    const payload = (await request.json()) as Payload;

    if (!payload.conversationId || !payload.channel || !payload.recipient || !payload.content?.trim()) {
      return NextResponse.json({ error: "conversationId, channel, recipient e content são obrigatórios." }, { status: 400 });
    }
    const requestHash = requestFingerprint(payload);
    const idempotency = await claimIdempotency({ organizationId: identity.organizationId, scope: "v2.message.send", key: request.headers.get("idempotency-key"), requestHash });
    if (idempotency.state !== "claimed") return idempotency.response;

    const admin = getSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .select("id,organization_id,lead_id")
      .eq("id", payload.conversationId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
    }
    if (conversation.lead_id) await requireLeadAccess(identity, conversation.lead_id);

    const normalizedRecipient = payload.channel === "whatsapp" ? normalizePhoneE164(payload.recipient) : payload.channel === "email" ? normalizeEmail(payload.recipient) : payload.recipient.trim();
    if (!normalizedRecipient) return NextResponse.json({ error: "Destinatário inválido para o canal selecionado." }, { status: 400 });
    if (payload.channel === "whatsapp") {
      const { data: suppression } = await admin.from("messaging_suppressions").select("id").eq("organization_id", identity.organizationId).eq("channel", "whatsapp").eq("recipient", normalizedRecipient).maybeSingle();
      if (suppression) return NextResponse.json({ error: "Este contato solicitou a interrupção das mensagens no WhatsApp." }, { status: 409 });
    }

    const requiresApproval = payload.channel !== "email";
    const { data: message, error: messageError } = await admin
      .from("messages")
      .insert({
        organization_id: identity.organizationId,
        conversation_id: payload.conversationId,
        direction: "outbound",
        channel: payload.channel,
        recipient: normalizedRecipient,
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

    logger.info("message.queued", {
      messageId: message.id,
      organizationId: identity.organizationId,
      channel: payload.channel,
      requiresApproval,
    });

    const responseBody = { id: message.id, status: requiresApproval ? "pending_approval" : "queued" };
    await completeIdempotency({ organizationId: identity.organizationId, scope: "v2.message.send", key: idempotency.key, requestHash, status: 202, body: responseBody });
    return NextResponse.json(
      responseBody,
      { status: 202, headers: { "X-RateLimit-Remaining": String(rate.remaining) } },
    );
  } catch (error) {
    logger.error("message.queue_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao preparar mensagem.";
    const unauthorized = /token|sessão|autoriz/i.test(message);
    return NextResponse.json({ error: message }, { status: unauthorized ? 401 : 500 });
  }
}
