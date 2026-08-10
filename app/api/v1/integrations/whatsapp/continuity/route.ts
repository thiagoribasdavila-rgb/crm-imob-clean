import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildWhatsAppConversationContinuity,
  type WhatsAppConversationContinuityRow,
  type WhatsAppLeadOwnershipRow,
} from "@/lib/analytics/whatsapp-conversation-continuity";
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
    scope: "whatsapp-conversation-continuity",
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
      "A continuidade consolidada do WhatsApp é exclusiva da diretoria.",
      identity.meta,
      { status: 403, headers: rate.headers },
    );
  }

  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();
  const countResult = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("channel", "whatsapp");
  if (countResult.error) {
    return apiError(
      "WHATSAPP_CONTINUITY_FAILED",
      "Não foi possível medir a continuidade das conversas.",
      identity.meta,
      { status: 502, headers: rate.headers },
    );
  }

  const sourceTotal = countResult.count ?? 0;
  const target = Math.min(sourceTotal, OBSERVED_LIMIT);
  const conversations: WhatsAppConversationContinuityRow[] = [];
  for (let offset = 0; offset < target; offset += PAGE_SIZE) {
    const page = await admin
      .from("conversations")
      .select(
        "id,lead_id,assigned_to,status,last_message_at,unread_count,created_at",
      )
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, target - 1));
    if (page.error) {
      return apiError(
        "WHATSAPP_CONTINUITY_FAILED",
        "Não foi possível medir a continuidade das conversas.",
        identity.meta,
        { status: 502, headers: rate.headers },
      );
    }
    conversations.push(
      ...((page.data ?? []) as WhatsAppConversationContinuityRow[]),
    );
  }

  const leadIds = [
    ...new Set(
      conversations
        .map((conversation) => conversation.lead_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const leads: WhatsAppLeadOwnershipRow[] = [];
  for (const leadIdChunk of chunks(leadIds, 200)) {
    const leadResult = await admin
      .from("leads")
      .select("id,assigned_to")
      .eq("organization_id", organizationId)
      .in("id", leadIdChunk);
    if (leadResult.error) {
      return apiError(
        "WHATSAPP_CONTINUITY_FAILED",
        "Não foi possível comparar os responsáveis das conversas.",
        identity.meta,
        { status: 502, headers: rate.headers },
      );
    }
    leads.push(...((leadResult.data ?? []) as WhatsAppLeadOwnershipRow[]));
  }

  return apiSuccess(
    buildWhatsAppConversationContinuity({
      conversations,
      leads,
      sourceTotal,
      observedLimit: OBSERVED_LIMIT,
    }),
    identity.meta,
    { headers: rate.headers },
  );
}
