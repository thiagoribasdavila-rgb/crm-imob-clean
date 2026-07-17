import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 60, scope: "manager-message-approvals" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!["director","superintendent","manager"].includes(role)) return apiError("FORBIDDEN", "Aprovações pertencem à liderança.", identity.meta, { status: 403 });
  const admin = getSupabaseAdmin(); const org = identity.access.organization.id;
  const { data: approvals } = await admin.from("approval_requests").select("id,request_type,entity_type,entity_id,status,decision_reason,expires_at,created_at").eq("organization_id", org).eq("entity_type", "message").order("created_at", { ascending: false }).limit(100);
  const messageIds = (approvals ?? []).map((item) => item.entity_id).filter(Boolean) as string[];
  const { data: messages } = messageIds.length ? await admin.from("messages").select("id,conversation_id,channel,content").in("id", messageIds).eq("organization_id", org) : { data: [] };
  const conversationIds = (messages ?? []).map((item) => item.conversation_id);
  const { data: conversations } = conversationIds.length ? await admin.from("conversations").select("id,lead_id,assigned_to").in("id", conversationIds).eq("organization_id", org) : { data: [] };
  const leadIds = (conversations ?? []).map((item) => item.lead_id).filter(Boolean) as string[];
  const { data: leads } = leadIds.length ? await admin.from("leads").select("id,name,assigned_to").in("id", leadIds).eq("organization_id", org) : { data: [] };
  const { data: profiles } = await admin.from("profiles").select("id,full_name,reports_to").eq("organization_id", org).eq("active", true);
  const allowed = role === "director" ? new Set((profiles ?? []).map((p) => p.id)) : new Set((profiles ?? []).filter((p) => p.reports_to === identity.access.profile.id).map((p) => p.id));
  const items = (approvals ?? []).flatMap((approval) => { const message = (messages ?? []).find((m) => m.id === approval.entity_id); const conversation = (conversations ?? []).find((c) => c.id === message?.conversation_id); const lead = (leads ?? []).find((l) => l.id === conversation?.lead_id); const brokerId = conversation?.assigned_to || lead?.assigned_to; if (!message || !brokerId || !allowed.has(brokerId)) return []; return [{ ...approval, leadName: lead?.name || "Lead", brokerName: (profiles ?? []).find((p) => p.id === brokerId)?.full_name || "Corretor", channel: message.channel, preview: String(message.content || "").slice(0, 240) }]; });
  return apiSuccess({ scope: { role, directTeamOnly: role === "manager" }, items }, identity.meta, { headers: limited.headers });
}
