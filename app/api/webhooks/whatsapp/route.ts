import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/security/webhook-signature";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { assessCustomerExperience } from "@/lib/atlas/customer-experience";
import { enforceDistributedRateLimit } from "@/lib/security/abuse-protection";

export const dynamic = "force-dynamic";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

function isOptOut(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return /^(sair|pare|parar|cancelar|remover|stop|unsubscribe|nao quero mais|nao me envie mais)$/.test(normalized);
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
  const distributed = await enforceDistributedRateLimit(request, { scope: "whatsapp-webhook", limit: 300, windowSeconds: 60 });
  if (!distributed.allowed) return distributed.response;
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
      entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string }; messages?: Array<{ id: string; from: string; timestamp?: string; text?: { body?: string }; type?: string }>; statuses?: Array<{ id: string; status: "sent" | "delivered" | "read" | "failed"; timestamp?: string; errors?: Array<{ code?: number; title?: string }> }> } }> }>;
    };

    const admin = getSupabaseAdmin();
    let accepted = 0;
    let duplicates = 0;

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

        for (const statusEvent of change.value?.statuses ?? []) {
          const { data: outbound } = await admin.from("messages").select("id,status,media").eq("organization_id", integration.organization_id).eq("external_message_id", statusEvent.id).maybeSingle();
          if (!outbound || outbound.status === statusEvent.status) continue;
          const media = Array.isArray(outbound.media) ? outbound.media : [];
          const templateItem = media.find((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "whatsapp_template") as { batchId?: string } | undefined;
          const at = statusEvent.timestamp ? new Date(Number(statusEvent.timestamp) * 1000).toISOString() : new Date().toISOString();
          await admin.from("messages").update({ status: statusEvent.status, ...(statusEvent.status === "delivered" ? { delivered_at: at } : {}), ...(statusEvent.status === "read" ? { read_at: at } : {}), ...(statusEvent.status === "failed" ? { error: statusEvent.errors?.[0]?.title || "Falha informada pela API do WhatsApp." } : {}) }).eq("id", outbound.id);
          if (templateItem?.batchId) {
            const counter = statusEvent.status === "delivered" ? "delivered_count" : statusEvent.status === "read" ? "read_count" : statusEvent.status === "failed" ? "failed_count" : null;
            if (counter) {
              const { data: batch } = await admin.from("lead_reactivation_batches").select("delivered_count,read_count,failed_count,queued_count").eq("id", templateItem.batchId).single();
              if (batch) {
                const next = Number(batch[counter as keyof typeof batch] || 0) + 1;
                const failureRate = statusEvent.status === "failed" ? next / Math.max(1, Number(batch.queued_count || 0)) : Number(batch.failed_count || 0) / Math.max(1, Number(batch.queued_count || 0));
                const quality = Number(batch.queued_count || 0) >= 20 && failureRate >= 0.1 ? "red" : failureRate >= 0.05 ? "yellow" : "green";
                await admin.from("lead_reactivation_batches").update({ [counter]: next, quality_status: quality, ...(quality === "red" ? { status: "running", paused_reason: "Pausa automática: falhas acima de 10%." } : {}) }).eq("id", templateItem.batchId);
              }
            }
          }
        }

        for (const incoming of change.value?.messages ?? []) {
          const sender = normalizePhone(incoming.from);
          const incomingText = incoming.text?.body ?? "";
          const optedOut = isOptOut(incomingText);
          if (optedOut) {
            const { error: optOutError } = await admin.rpc("register_whatsapp_opt_out", { p_organization_id: integration.organization_id, p_recipient: sender, p_source: "whatsapp_inbound", p_external_message_id: incoming.id });
            if (optOutError) throw optOutError;
          }
          const { data: conversation } = await admin
            .from("conversations")
            .select("id,lead_id,assigned_to")
            .eq("organization_id", integration.organization_id)
            .eq("channel", "whatsapp")
            .eq("external_thread_id", sender)
            .maybeSingle();

          let conversationId = conversation?.id;
          const conversationLeadId = conversation?.lead_id || null;
          const conversationOwnerId = conversation?.assigned_to || null;
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

          const { data: inboundMessage, error: messageError } = await admin.from("messages").insert({
            organization_id: integration.organization_id,
            conversation_id: conversationId,
            direction: "inbound",
            channel: "whatsapp",
            sender,
            content: incoming.text?.body ?? `[${incoming.type ?? "mensagem"}]`,
            status: "received",
            external_message_id: incoming.id,
            created_at: incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000).toISOString() : new Date().toISOString(),
          }).select("id").single();
          if (messageError?.code === "23505") { duplicates += 1; continue; }
          if (messageError) throw messageError;
          if (!optedOut && inboundMessage?.id) {
            const { error: journeyError } = await admin.rpc("route_nightly_journey_reply", { p_organization_id: integration.organization_id, p_conversation_id: conversationId, p_message_id: inboundMessage.id });
            if (journeyError) throw journeyError;
          }
          await admin.from("lead_reactivation_contacts").update({ status: "replied" }).eq("organization_id", integration.organization_id).eq("phone", sender).in("status", ["queued", "sent"]);
          const { data: repliedContacts } = await admin.from("lead_reactivation_contacts").select("batch_id").eq("organization_id", integration.organization_id).eq("phone", sender).eq("status", "replied");
          for (const batchId of new Set((repliedContacts ?? []).map((contact) => contact.batch_id))) {
            const { count } = await admin.from("lead_reactivation_contacts").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("status", "replied");
            await admin.from("lead_reactivation_batches").update({ replied_count: count || 0 }).eq("id", batchId);
          }
          if (conversationLeadId && incomingText) {
            const assessment = assessCustomerExperience(incomingText);
            if (assessment.friction) {
              const { data: signal } = await admin.from("lead_experience_signals").upsert({ organization_id: integration.organization_id, lead_id: conversationLeadId, broker_id: conversationOwnerId, conversation_id: conversationId, message_id: inboundMessage?.id || null, signal_type: assessment.signalType, severity: assessment.severity, confidence: assessment.confidence, evidence: assessment.evidence, recommendation: assessment.recommendation, suggested_reply: assessment.suggestedReply }, { onConflict: "message_id", ignoreDuplicates: true }).select("id").maybeSingle();
              await Promise.allSettled([
                admin.from("activities").insert({ organization_id: integration.organization_id, lead_id: conversationLeadId, user_id: conversationOwnerId, type: "experience_alert", title: assessment.recommendation === "offer_broker_change" ? "IA recomenda oferecer troca de corretor" : "IA detectou atrito no atendimento", description: `${assessment.evidence} Recomendação: ${assessment.recommendation}.`, metadata: { experienceSignalId: signal?.id || null, severity: assessment.severity, confidence: assessment.confidence }, occurred_at: new Date().toISOString() }),
                admin.from("atlas_events").insert({ organization_id: integration.organization_id, event_type: "customer.experience_friction", source: "whatsapp", aggregate_type: "lead", aggregate_id: conversationLeadId, payload: { signalType: assessment.signalType, severity: assessment.severity, recommendation: assessment.recommendation, confidence: assessment.confidence }, correlation_id: incoming.id }),
              ]);
            }
          }
          accepted += 1;
        }
      }
    }

    logger.info("whatsapp.webhook_processed", { accepted, duplicates });
    return NextResponse.json({ received: true, accepted, duplicates });
  } catch (error) {
    logger.error("whatsapp.webhook_failed", error);
    return NextResponse.json({ error: "Falha ao processar webhook." }, { status: 500 });
  }
}
