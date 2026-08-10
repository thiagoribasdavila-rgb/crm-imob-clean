import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildWhatsAppLearningCaptureQuality,
  type WhatsAppLearningBehaviorRow,
  type WhatsAppLearningConversationRow,
  type WhatsAppLearningLineRow,
  type WhatsAppLearningMessageRow,
} from "@/lib/analytics/whatsapp-learning-capture-quality";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const OBSERVED_LIMIT = 5_000;

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    scope: "whatsapp-learning-capture-quality",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const director =
    identity.access.profile.role === "admin" ||
    identity.access.profile.commercialRole === "director";
  if (!director) {
    return apiError(
      "FORBIDDEN",
      "A qualidade consolidada da captura é exclusiva da diretoria.",
      identity.meta,
      { status: 403, headers: rate.headers },
    );
  }

  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();
  const [countResult, linesResult] = await Promise.all([
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp"),
    admin
      .from("integrations")
      .select("status,config")
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp"),
  ]);
  if (countResult.error || linesResult.error) {
    return apiError(
      "WHATSAPP_LEARNING_CAPTURE_FAILED",
      "Não foi possível medir a qualidade da captura do WhatsApp.",
      identity.meta,
      { status: 502, headers: rate.headers },
    );
  }

  const sourceTotal = countResult.count ?? 0;
  const target = Math.min(sourceTotal, OBSERVED_LIMIT);
  const messages: WhatsAppLearningMessageRow[] = [];
  for (let offset = 0; offset < target; offset += PAGE_SIZE) {
    const page = await admin
      .from("messages")
      .select(
        "id,conversation_id,direction,external_message_id,sent_at,created_at",
      )
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, target - 1));
    if (page.error) {
      return apiError(
        "WHATSAPP_LEARNING_CAPTURE_FAILED",
        "Não foi possível medir a qualidade da captura do WhatsApp.",
        identity.meta,
        { status: 502, headers: rate.headers },
      );
    }
    messages.push(...((page.data ?? []) as WhatsAppLearningMessageRow[]));
  }

  const conversationIds = [
    ...new Set(
      messages
        .map((message) => message.conversation_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const conversations: WhatsAppLearningConversationRow[] = [];
  for (const conversationIdChunk of chunks(conversationIds, 200)) {
    const result = await admin
      .from("conversations")
      .select("id,lead_id")
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp")
      .in("id", conversationIdChunk);
    if (result.error) {
      return apiError(
        "WHATSAPP_LEARNING_CAPTURE_FAILED",
        "Não foi possível validar os vínculos das mensagens.",
        identity.meta,
        { status: 502, headers: rate.headers },
      );
    }
    conversations.push(
      ...((result.data ?? []) as WhatsAppLearningConversationRow[]),
    );
  }

  const behaviorEvents: WhatsAppLearningBehaviorRow[] = [];
  for (const messageIdChunk of chunks(
    messages.map((message) => message.id),
    200,
  )) {
    const result = await admin
      .from("lead_behavior_events")
      .select("source_id,event_name")
      .eq("organization_id", organizationId)
      .eq("source_table", "messages")
      .in("event_name", ["message_inbound", "message_outbound", "message_read"])
      .in("source_id", messageIdChunk);
    if (result.error) {
      return apiError(
        "WHATSAPP_LEARNING_CAPTURE_FAILED",
        "Não foi possível validar a memória estruturada das mensagens.",
        identity.meta,
        { status: 502, headers: rate.headers },
      );
    }
    behaviorEvents.push(
      ...((result.data ?? []) as WhatsAppLearningBehaviorRow[]),
    );
  }

  return apiSuccess(
    buildWhatsAppLearningCaptureQuality({
      messages,
      conversations,
      behaviorEvents,
      lines: (linesResult.data ?? []) as WhatsAppLearningLineRow[],
      sourceTotal,
      observedLimit: OBSERVED_LIMIT,
    }),
    identity.meta,
    { headers: rate.headers },
  );
}
