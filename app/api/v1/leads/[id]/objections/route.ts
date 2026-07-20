import { type NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const OBJECTION_TYPES = ["PRICE", "FINANCING", "LOCATION", "SIZE", "TIMING", "TRUST", "PRODUCT", "COMPETITOR", "OTHER"] as const;
type ObjectionType = (typeof OBJECTION_TYPES)[number];

async function contextFor(org: string, leadId: string) {
  const admin = getSupabaseAdmin();
  const { data: lead } = await admin
    .from("leads")
    .select("id,name,assigned_user_id")
    .eq("organization_id", org)
    .eq("id", leadId)
    .single();
  if (!lead) return null;
  const { data: objections } = await admin
    .from("lead_objections")
    .select("id,objection_type,objection_text,detected_source,response_text,response_source,status,outcome_stage,outcome_notes,created_by,resolved_by,resolved_at,created_at,updated_at")
    .eq("organization_id", org)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  return { lead, objections: objections ?? [] };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "lead.objections.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const { id } = await params;
  const c = await contextFor(access.access.organization.id, id);
  if (!c) return apiError("LEAD_NOT_FOUND", "Lead fora do seu escopo comercial.", access.meta, { status: 404 });
  const openCount = c.objections.filter((o) => o.status === "OPEN").length;
  return apiSuccess(
    {
      lead: c.lead,
      objections: c.objections,
      summary: { total: c.objections.length, open: openCount, overcome: c.objections.filter((o) => o.status === "OVERCOME").length },
      objectionTypes: OBJECTION_TYPES,
      canAct: c.lead.assigned_user_id === access.access.profile.id,
    },
    access.meta,
    { headers: rate.headers },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rate = enforceRateLimit(request, { limit: 20, scope: "lead.objections.write" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { objectionType?: string; objectionText?: string } | null;
  const c = await contextFor(access.access.organization.id, id);
  if (!c) return apiError("LEAD_NOT_FOUND", "Lead fora do seu escopo comercial.", access.meta, { status: 404 });
  if (c.lead.assigned_user_id !== access.access.profile.id) {
    return apiError("OBJECTION_OWNER_ONLY", "Somente o corretor responsável pode registrar objeções.", access.meta, { status: 403 });
  }
  const objectionType = String(body?.objectionType || "").toUpperCase();
  const objectionText = String(body?.objectionText || "").trim();
  if (!OBJECTION_TYPES.includes(objectionType as ObjectionType)) {
    return apiError("OBJECTION_TYPE_INVALID", "Selecione um tipo de objeção válido.", access.meta, { status: 400 });
  }
  if (objectionText.length < 5) {
    return apiError("OBJECTION_TEXT_INVALID", "Descreva a objeção com pelo menos 5 caracteres.", access.meta, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  const { data: created, error } = await admin
    .from("lead_objections")
    .insert({
      organization_id: access.access.organization.id,
      lead_id: id,
      objection_type: objectionType,
      objection_text: objectionText,
      detected_source: "MANUAL",
      status: "OPEN",
      created_by: access.access.profile.id,
    })
    .select("id,objection_type,objection_text,detected_source,status,created_at")
    .single();
  if (error || !created) return apiError("OBJECTION_CREATE_FAILED", "Não foi possível registrar a objeção.", access.meta, { status: 409, details: error?.message });
  structuredApiLog("info", "lead.objection.created", request, access.meta, { leadId: id, objectionId: created.id, objectionType });
  return apiSuccess({ objection: created }, access.meta, { status: 201, headers: rate.headers });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rate = enforceRateLimit(request, { limit: 20, scope: "lead.objections.write" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { objectionId?: string; responseText?: string; status?: string } | null;
  const c = await contextFor(access.access.organization.id, id);
  if (!c) return apiError("LEAD_NOT_FOUND", "Lead fora do seu escopo comercial.", access.meta, { status: 404 });
  if (c.lead.assigned_user_id !== access.access.profile.id) {
    return apiError("OBJECTION_OWNER_ONLY", "Somente o corretor responsável pode responder objeções.", access.meta, { status: 403 });
  }
  const objection = c.objections.find((o) => o.id === body?.objectionId);
  if (!objection) return apiError("OBJECTION_NOT_FOUND", "Objeção não encontrada.", access.meta, { status: 404 });
  const status = String(body?.status || "").toUpperCase();
  if (!["ANSWERED", "OVERCOME", "NOT_OVERCOME"].includes(status)) {
    return apiError("OBJECTION_STATUS_INVALID", "Status inválido para conclusão.", access.meta, { status: 400 });
  }
  const responseText = String(body?.responseText || "").trim();
  const admin = getSupabaseAdmin();
  const { data: updated, error } = await admin
    .from("lead_objections")
    .update({
      response_text: responseText || null,
      response_source: responseText ? "MANUAL" : null,
      status,
      resolved_by: status === "OPEN" ? null : access.access.profile.id,
      resolved_at: status === "OPEN" ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", objection.id)
    .eq("organization_id", access.access.organization.id)
    .select("id,status,response_text,resolved_at")
    .single();
  if (error || !updated) return apiError("OBJECTION_UPDATE_FAILED", "Não foi possível concluir a objeção.", access.meta, { status: 409, details: error?.message });
  structuredApiLog("info", "lead.objection.resolved", request, access.meta, { leadId: id, objectionId: updated.id, status });
  return apiSuccess({ objection: updated }, access.meta, { headers: rate.headers });
}
