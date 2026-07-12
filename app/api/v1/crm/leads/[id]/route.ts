import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const patchable = new Set(["name", "email", "phone", "status", "source", "assigned_to", "temperature", "score", "budget_min", "budget_max", "bedrooms", "purpose", "notes", "preferred_regions"]);

function validId(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id);
}

function normalizePatch(body: Record<string, unknown>) {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!patchable.has(key)) continue;
    if (key === "email" && typeof value === "string") changes[key] = value.trim().toLowerCase() || null;
    else if (key === "phone" && typeof value === "string") changes[key] = value.replace(/\D/g, "") || null;
    else changes[key] = value;
  }
  changes.updated_at = new Date().toISOString();
  return changes;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, { limit: 120, windowMs: 60_000, scope: "crm.leads.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["admin", "manager", "broker", "viewer"] });
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!validId(id)) return apiError("INVALID_LEAD_ID", "ID do lead inválido.", access.meta, { status: 400, headers: rate.headers });

  const { data, error } = await access.supabase.from("leads").select("*").eq("id", id).eq("organization_id", access.access.organization.id).maybeSingle();
  if (error) return apiError("LEAD_QUERY_FAILED", "Não foi possível consultar o lead.", access.meta, { status: 500, headers: rate.headers });
  if (!data) return apiError("LEAD_NOT_FOUND", "Lead não encontrado.", access.meta, { status: 404, headers: rate.headers });
  return apiSuccess({ lead: data }, access.meta, { headers: rate.headers });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "crm.leads.update" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["admin", "manager", "broker"] });
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!validId(id)) return apiError("INVALID_LEAD_ID", "ID do lead inválido.", access.meta, { status: 400, headers: rate.headers });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("INVALID_JSON", "Payload JSON inválido.", access.meta, { status: 400, headers: rate.headers });
  }

  const before = await access.supabase.from("leads").select("*").eq("id", id).eq("organization_id", access.access.organization.id).maybeSingle();
  if (before.error) return apiError("LEAD_QUERY_FAILED", "Não foi possível consultar o lead.", access.meta, { status: 500, headers: rate.headers });
  if (!before.data) return apiError("LEAD_NOT_FOUND", "Lead não encontrado.", access.meta, { status: 404, headers: rate.headers });

  const changes = normalizePatch(body);
  if (Object.keys(changes).length <= 1) return apiError("NO_PATCH_FIELDS", "Nenhum campo permitido foi enviado.", access.meta, { status: 422, headers: rate.headers });

  if (Object.prototype.hasOwnProperty.call(changes, "assigned_to")) {
    const assignedTo = changes.assigned_to;
    if (typeof assignedTo !== "string" || !validId(assignedTo)) {
      return apiError("INVALID_ASSIGNEE", "Corretor responsável inválido.", access.meta, { status: 422, headers: rate.headers });
    }

    const { data: assignee, error: assigneeError } = await access.supabase
      .from("profiles")
      .select("id")
      .eq("id", assignedTo)
      .eq("organization_id", access.access.organization.id)
      .eq("active", true)
      .maybeSingle();
    if (assigneeError) return apiError("ASSIGNEE_LOOKUP_FAILED", "Não foi possível validar o corretor responsável.", access.meta, { status: 500, headers: rate.headers });
    if (!assignee) return apiError("INVALID_ASSIGNEE", "O corretor responsável não pertence à organização ou está inativo.", access.meta, { status: 422, headers: rate.headers });
  }

  const { data, error } = await access.supabase.from("leads").update(changes).eq("id", id).eq("organization_id", access.access.organization.id).select("*").single();
  if (error) {
    structuredApiLog("error", "crm.leads.update_failed", request, access.meta, { organizationId: access.access.organization.id, leadId: id, message: error.message });
    return apiError("LEAD_UPDATE_FAILED", "Não foi possível atualizar o lead.", access.meta, { status: 500, headers: rate.headers });
  }

  await access.supabase.from("atlas_events").insert({ organization_id: access.access.organization.id, event_type: "lead.updated", source: "api.v1.crm.leads", aggregate_type: "lead", aggregate_id: id, payload: { before: before.data, after: data }, correlation_id: access.meta.correlationId });
  return apiSuccess({ lead: data }, access.meta, { headers: rate.headers });
}
