import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && token && token === secret);
}

async function deliverWhatsApp(recipient: string, content: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  if (!phoneNumberId || !accessToken) throw new Error("Credenciais do WhatsApp não configuradas.");

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: recipient, type: "text", text: { body: content } }),
  });

  const data = (await response.json()) as { messages?: Array<{ id: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `WhatsApp HTTP ${response.status}`);
  return data.messages?.[0]?.id ?? null;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const workerId = `vercel-${crypto.randomUUID()}`;
  const admin = getSupabaseAdmin();
  const { data: events, error } = await admin
    .from("integration_outbox")
    .select("id,organization_id,topic,aggregate_id,payload,attempts")
    .in("status", ["pending", "failed"])
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let delivered = 0;
  let failed = 0;

  for (const event of events ?? []) {
    const attempts = Number(event.attempts || 0) + 1;
    await admin.from("integration_outbox").update({ status: "processing", attempts, locked_at: new Date().toISOString(), locked_by: workerId }).eq("id", event.id);

    try {
      if (event.topic !== "message.send" || !event.aggregate_id) throw new Error(`Tópico não suportado: ${event.topic}`);

      const { data: message, error: messageError } = await admin
        .from("messages")
        .select("id,channel,recipient,content")
        .eq("id", event.aggregate_id)
        .single();
      if (messageError || !message) throw messageError ?? new Error("Mensagem não encontrada.");

      let externalMessageId: string | null = null;
      if (message.channel === "whatsapp") {
        externalMessageId = await deliverWhatsApp(message.recipient, message.content);
      } else {
        throw new Error(`Canal ainda não conectado ao worker: ${message.channel}`);
      }

      const now = new Date().toISOString();
      await admin.from("messages").update({ status: "sent", sent_at: now, external_message_id: externalMessageId, error: null }).eq("id", message.id);
      await admin.from("integration_outbox").update({ status: "delivered", delivered_at: now, last_error: null }).eq("id", event.id);
      delivered += 1;
    } catch (processingError) {
      const message = processingError instanceof Error ? processingError.message : "Falha desconhecida";
      const terminal = attempts >= 5;
      const nextAttempt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();

      await admin.from("integration_outbox").update({ status: terminal ? "dead_letter" : "failed", available_at: nextAttempt, last_error: message }).eq("id", event.id);
      if (terminal) {
        await admin.from("dead_letter_events").insert({
          organization_id: event.organization_id,
          outbox_event_id: event.id,
          topic: event.topic,
          payload: event.payload,
          error_message: message,
          attempts,
        });
      }
      failed += 1;
      logger.error("outbox.delivery_failed", processingError, { eventId: event.id, topic: event.topic, attempts });
    }
  }

  return NextResponse.json({ workerId, processed: (events ?? []).length, delivered, failed });
}
