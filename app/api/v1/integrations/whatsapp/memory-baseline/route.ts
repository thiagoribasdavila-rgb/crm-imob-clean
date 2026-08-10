import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { buildWhatsAppMemoryBaseline } from "@/lib/analytics/whatsapp-memory-baseline";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CountResult = { count: number | null; error: { message: string } | null };
type LatestResult = {
  data: Array<{ created_at: string | null }> | null;
  error: { message: string } | null;
};

const exactCount = (result: CountResult) => result.count ?? 0;
const latestAt = (result: LatestResult) => result.data?.[0]?.created_at ?? null;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    scope: "whatsapp-memory-baseline",
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
      "A memória consolidada do WhatsApp é exclusiva da diretoria.",
      identity.meta,
      { status: 403, headers: rate.headers },
    );
  }

  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();
  const conversationBase = () =>
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp");
  const messageBase = () =>
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp");
  const latestMessage = (direction?: "inbound" | "outbound", external = false) => {
    let query = admin
      .from("messages")
      .select("created_at")
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp");
    if (direction) query = query.eq("direction", direction);
    if (external) query = query.not("external_message_id", "is", null);
    return query.order("created_at", { ascending: false }).limit(1);
  };

  const [
    linesResult,
    conversationsResult,
    linkedResult,
    assignedResult,
    messagesResult,
    inboundResult,
    outboundResult,
    deliveredResult,
    readResult,
    failedResult,
    externalResult,
    latestInboundResult,
    latestOutboundResult,
    latestExternalResult,
  ] = await Promise.all([
    admin
      .from("integrations")
      .select("status,config")
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp"),
    conversationBase(),
    conversationBase().not("lead_id", "is", null),
    conversationBase().not("assigned_to", "is", null),
    messageBase(),
    messageBase().eq("direction", "inbound"),
    messageBase().eq("direction", "outbound"),
    messageBase().eq("status", "delivered"),
    messageBase().eq("status", "read"),
    messageBase().eq("status", "failed"),
    messageBase().not("external_message_id", "is", null),
    latestMessage("inbound"),
    latestMessage("outbound"),
    latestMessage(undefined, true),
  ]);

  const results = [
    linesResult,
    conversationsResult,
    linkedResult,
    assignedResult,
    messagesResult,
    inboundResult,
    outboundResult,
    deliveredResult,
    readResult,
    failedResult,
    externalResult,
    latestInboundResult,
    latestOutboundResult,
    latestExternalResult,
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return apiError(
      "WHATSAPP_MEMORY_BASELINE_FAILED",
      "Não foi possível medir a memória comercial do WhatsApp.",
      identity.meta,
      { status: 502, headers: rate.headers },
    );
  }

  const baseline = buildWhatsAppMemoryBaseline({
    lines: linesResult.data ?? [],
    counts: {
      conversations: exactCount(conversationsResult),
      linkedConversations: exactCount(linkedResult),
      assignedConversations: exactCount(assignedResult),
      messages: exactCount(messagesResult),
      inboundMessages: exactCount(inboundResult),
      outboundMessages: exactCount(outboundResult),
      deliveredMessages: exactCount(deliveredResult),
      readMessages: exactCount(readResult),
      failedMessages: exactCount(failedResult),
      externallyConfirmedMessages: exactCount(externalResult),
    },
    latestInboundAt: latestAt(latestInboundResult),
    latestOutboundAt: latestAt(latestOutboundResult),
    latestExternalEvidenceAt: latestAt(latestExternalResult),
  });

  return apiSuccess(baseline, identity.meta, { headers: rate.headers });
}
