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
  const { data: approvals } = await admin.from("approval_requests").select("id,request_type,entity_type,entity_id,status,decision_reason,expires_at,created_at").eq("organization_id", org).in("entity_type", ["message","commercial_simulation"]).order("created_at", { ascending: false }).limit(100);
  const messageIds = (approvals ?? []).filter((item) => item.entity_type === "message").map((item) => item.entity_id).filter(Boolean) as string[];
  const simulationIds = (approvals ?? []).filter((item) => item.entity_type === "commercial_simulation").map((item) => item.entity_id).filter(Boolean) as string[];
  const { data: messages } = messageIds.length ? await admin.from("messages").select("id,conversation_id,channel,content").in("id", messageIds).eq("organization_id", org) : { data: [] };
  const conversationIds = (messages ?? []).map((item) => item.conversation_id);
  const { data: conversations } = conversationIds.length ? await admin.from("conversations").select("id,lead_id,assigned_to").in("id", conversationIds).eq("organization_id", org) : { data: [] };
  const { data: simulations } = simulationIds.length ? await admin.from("commercial_simulations").select("id,lead_id,property_id,property_price,rule_snapshot,valid_until").in("id", simulationIds).eq("organization_id", org) : { data: [] };
  const leadIds = [...new Set([...(conversations ?? []).map((item) => item.lead_id), ...(simulations ?? []).map((item) => item.lead_id)].filter(Boolean))] as string[];
  const propertyIds = (simulations ?? []).map((item) => item.property_id);
  const [{ data: leads }, { data: properties }] = await Promise.all([leadIds.length ? admin.from("leads").select("id,name,assigned_to").in("id", leadIds).eq("organization_id", org) : Promise.resolve({ data: [] }), propertyIds.length ? admin.from("properties").select("id,title").in("id", propertyIds).eq("organization_id", org) : Promise.resolve({ data: [] })]);
  const { data: profiles } = await admin.from("profiles").select("id,full_name,reports_to").eq("organization_id", org).eq("active", true);
  const allowed = new Set<string>(); if (role === "director") for (const profile of profiles ?? []) allowed.add(profile.id); else if (role === "manager") for (const profile of profiles ?? []) { if (profile.reports_to === identity.access.profile.id) allowed.add(profile.id); } else { allowed.add(identity.access.profile.id); let changed = true; while (changed) { changed = false; for (const profile of profiles ?? []) if (profile.reports_to && allowed.has(profile.reports_to) && !allowed.has(profile.id)) { allowed.add(profile.id); changed = true; } } allowed.delete(identity.access.profile.id); }
  const items = (approvals ?? []).flatMap((approval) => { if (approval.entity_type === "message") { const message = (messages ?? []).find((m) => m.id === approval.entity_id); const conversation = (conversations ?? []).find((c) => c.id === message?.conversation_id); const lead = (leads ?? []).find((l) => l.id === conversation?.lead_id); const brokerId = conversation?.assigned_to || lead?.assigned_to; if (!message || !brokerId || !allowed.has(brokerId)) return []; return [{ ...approval, leadName: lead?.name || "Lead", brokerName: (profiles ?? []).find((p) => p.id === brokerId)?.full_name || "Corretor", channel: message.channel, preview: String(message.content || "").slice(0, 240) }]; } const simulation = (simulations ?? []).find((item) => item.id === approval.entity_id); const lead = (leads ?? []).find((item) => item.id === simulation?.lead_id); const brokerId = lead?.assigned_to; if (!simulation || !brokerId || !allowed.has(brokerId)) return []; const property = (properties ?? []).find((item) => item.id === simulation.property_id); const snapshot = simulation.rule_snapshot as { ruleName?: string; version?: number } | null; return [{ ...approval, leadName: lead?.name || "Lead", brokerName: (profiles ?? []).find((p) => p.id === brokerId)?.full_name || "Corretor", channel: "proposta", preview: `${property?.title || "Unidade"} · ${Number(simulation.property_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${snapshot?.ruleName || "Regra vigente"} v${snapshot?.version || "—"}` }]; });
  return apiSuccess({ scope: { role, directTeamOnly: role === "manager" }, items }, identity.meta, { headers: limited.headers });
}
