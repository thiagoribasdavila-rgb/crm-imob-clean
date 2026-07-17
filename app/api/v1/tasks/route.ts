import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { buildTaskCenter } from "@/lib/analytics/task-center";

export const dynamic = "force-dynamic";
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 90, scope: "task-center-read" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;
  const [tasks, profiles, leads] = await Promise.all([
    identity.supabase.from("tasks").select("id,title,description,due_at,priority,status,lead_id,assigned_to,created_at,lead:leads(id,name,purpose)").eq("organization_id", organizationId).order("due_at", { ascending: true, nullsFirst: false }).limit(2000),
    identity.supabase.from("profiles").select("id,full_name,commercial_role,role").eq("organization_id", organizationId).eq("active", true).limit(2000),
    identity.supabase.from("leads").select("id,name,assigned_to,status").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(1000),
  ]);
  if (tasks.error || profiles.error || leads.error) return apiError("TASK_CENTER_LOAD_FAILED", "Não foi possível carregar a central de tarefas.", identity.meta, { status: 500 });
  const center = buildTaskCenter((tasks.data ?? []) as never[], profiles.data ?? [], identity.access.profile.id);
  return apiSuccess({ scope: { organizationId, role: identity.access.profile.commercialRole || identity.access.profile.role, actorId: identity.access.profile.id, hierarchicalRls: true }, ...center, creationOptions: { leads: leads.data ?? [], assignees: profiles.data ?? [], defaults: { assigneeId: identity.access.profile.id, priority: "media" } }, generatedAt: new Date().toISOString() }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "task-quick-create" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  const body = await request.json(); const title = String(body.title || "").trim(); const description = String(body.description || "").trim(); const leadId = uuid(body.leadId); const requestedAssignee = uuid(body.assigneeId); const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null; const priority = ["baixa", "media", "alta"].includes(String(body.priority)) ? String(body.priority) : "media";
  if (title.length < 3 || title.length > 120 || description.length > 2000 || !dueAt || !Number.isFinite(dueAt.getTime()) || dueAt.getTime() < Date.now() - 300_000) return apiError("TASK_CREATE_INVALID", "Informe título, prazo futuro e dados válidos.", identity.meta, { status: 400 });
  let assigneeId = requestedAssignee || identity.access.profile.id;
  if (leadId) { const lead = await identity.supabase.from("leads").select("id,assigned_to").eq("id", leadId).eq("organization_id", identity.access.organization.id).maybeSingle(); if (lead.error || !lead.data) return apiError("TASK_LEAD_NOT_VISIBLE", "Lead não encontrada no seu escopo.", identity.meta, { status: 404 }); assigneeId = lead.data.assigned_to || identity.access.profile.id; }
  const assignee = await identity.supabase.from("profiles").select("id").eq("id", assigneeId).eq("organization_id", identity.access.organization.id).eq("active", true).maybeSingle();
  if (assignee.error || !assignee.data) return apiError("TASK_ASSIGNEE_NOT_VISIBLE", "Responsável não permitido no seu escopo.", identity.meta, { status: 403 });
  const result = await identity.supabase.from("tasks").insert({ organization_id: identity.access.organization.id, title, description: description || null, due_at: dueAt.toISOString(), priority, status: "pendente", lead_id: leadId, assigned_to: assigneeId }).select("id,title,due_at,priority,status,lead_id,assigned_to").single();
  if (result.error) return apiError("TASK_CREATE_FAILED", "Não foi possível criar a tarefa.", identity.meta, { status: 400 });
  return apiSuccess({ task: result.data, ownerPreservedFromLead: Boolean(leadId), auditable: true }, identity.meta, { status: 201, headers: rate.headers });
}

export async function PATCH(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "task-center-write" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  const body = await request.json(); const id = uuid(body.id); const action = String(body.action || "");
  if (!id || !["complete", "postpone_one_day"].includes(action)) return apiError("TASK_ACTION_INVALID", "Ação de tarefa inválida.", identity.meta, { status: 400 });
  const current = await identity.supabase.from("tasks").select("id,due_at,status").eq("id", id).eq("organization_id", identity.access.organization.id).maybeSingle();
  if (current.error || !current.data) return apiError("TASK_NOT_FOUND", "Tarefa não encontrada no seu escopo.", identity.meta, { status: 404 });
  const update = action === "complete" ? { status: "concluida" } : { due_at: new Date(Math.max(Date.now(), current.data.due_at ? new Date(current.data.due_at).getTime() : 0) + 86_400_000).toISOString() };
  const result = await identity.supabase.from("tasks").update(update).eq("id", id).eq("organization_id", identity.access.organization.id).select("id,status,due_at").single();
  if (result.error) return apiError("TASK_UPDATE_FAILED", "Não foi possível atualizar a tarefa.", identity.meta, { status: 400 });
  return apiSuccess({ task: result.data, action, auditable: true }, identity.meta, { headers: rate.headers });
}
