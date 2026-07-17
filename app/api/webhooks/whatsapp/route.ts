import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/security/webhook-signature";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

function isOptOut(value: string) {
  return /^(sair|pare|parar|cancelar|remover|stop|unsubscribe)$/i.test(value.trim());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "whatsapp-webhook"), { limit: 300, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Rate limit." }, { status: 429 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const secret = process.env.META_APP_SECRET || "";
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    logger.warn("whatsapp.webhook_invalid_signature");
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody) as {
      entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string }; messages?: Array<{ id: string; from: string; timestamp?: string; text?: { body?: string }; type?: string }> } }> }>;
    };

    const admin = getSupabaseAdmin();
    let accepted = 0;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const { data: integration } = await admin
          .from("integrations")
          .select("organization_id")
          .eq("provider", "whatsapp")
          .eq("external_account_id", phoneNumberId)
          .maybeSingle();
        if (!integration?.organization_id) continue;

        for (const incoming of change.value?.messages ?? []) {
          const sender = normalizePhone(incoming.from);
          const incomingText = incoming.text?.body ?? "";
          if (isOptOut(incomingText)) {
            await admin.from("messaging_suppressions").upsert({ organization_id: integration.organization_id, channel: "whatsapp", recipient: sender, reason: "opt_out", source: "whatsapp_inbound" }, { onConflict: "organization_id,channel,recipient" });
          }
          const { data: conversation } = await admin
            .from("conversations")
            .select("id")
            .eq("organization_id", integration.organization_id)
            .eq("channel", "whatsapp")
            .eq("external_thread_id", sender)
            .maybeSingle();

          let conversationId = conversation?.id;
          if (!conversationId) {
            const { data: created, error: createError } = await admin
              .from("conversations")
              .insert({
                organization_id: integration.organization_id,
                channel: "whatsapp",
                external_thread_id: sender,
                status: "open",
                unread_count: 1,
                last_message_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            if (createError || !created) throw createError ?? new Error("Falha ao criar conversa.");
            conversationId = created.id;
          } else {
            await admin
              .from("conversations")
              .update({ last_message_at: new Date().toISOString(), unread_count: 1, status: "open" })
              .eq("id", conversationId);
          }

          const { error: messageError } = await admin.from("messages").insert({
            organization_id: integration.organization_id,
            conversation_id: conversationId,
            direction: "inbound",
            channel: "whatsapp",
            sender,
            content: incoming.text?.body ?? `[${incoming.type ?? "mensagem"}]`,
            status: "received",
            external_message_id: incoming.id,
            created_at: incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000).toISOString() : new Date().toISOString(),
          });
          if (messageError) throw messageError;
          await admin.from("lead_reactivation_contacts").update({ status: "replied" }).eq("organization_id", integration.organization_id).eq("phone", sender).in("status", ["queued", "sent"]);
          accepted += 1;
        }
      }
    }

    logger.info("whatsapp.webhook_processed", { accepted });
    return NextResponse.json({ received: true, accepted });
  } catch (error) {
    logger.error("whatsapp.webhook_failed", error);
    return NextResponse.json({ error: "Falha ao processar webhook." }, { status: 500 });
  }
}
