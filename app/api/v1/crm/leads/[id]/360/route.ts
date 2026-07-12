import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function validId(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id);
}

function rows<T>(result: PromiseSettledResult<{ data: T[] | null; error: { message: string } | null }>, label: string, request: NextRequest, meta: { requestId: string; correlationId: string; version: string; timestamp: string }) {
  if (result.status === "rejected" || result.value.error) {
    structuredApiLog("warn", "crm.leads.360_optional_table_failed", request, meta, { table: label, message: result.status === "rejected" ? String(result.reason) : result.value.error?.message });
    return [] as T[];
  }
  return result.value.data ?? [];
}

export async function GET(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, { limit: 80, windowMs: 60_000, scope: "crm.leads.360" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["admin", "manager", "broker", "viewer"] });
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!validId(id)) return apiError("INVALID_LEAD_ID", "ID do lead inválido.", access.meta, { status: 400, headers: rate.headers });

  const leadResult = await access.supabase.from("leads").select("*").eq("id", id).eq("organization_id", access.access.organization.id).maybeSingle();
  if (leadResult.error) return apiError("LEAD_QUERY_FAILED", "Não foi possível consultar o lead.", access.meta, { status: 500, headers: rate.headers });
  if (!leadResult.data) return apiError("LEAD_NOT_FOUND", "Lead não encontrado.", access.meta, { status: 404, headers: rate.headers });

  const [activities, opportunities, notes, documents, insights] = await Promise.allSettled([
    access.supabase.from("activities").select("*").eq("lead_id", id).eq("organization_id", access.access.organization.id).order("occurred_at", { ascending: false }).limit(100),
    access.supabase.from("opportunities").select("*").eq("lead_id", id).eq("organization_id", access.access.organization.id).order("created_at", { ascending: false }).limit(50),
    access.supabase.from("notes").select("*").eq("lead_id", id).eq("organization_id", access.access.organization.id).order("created_at", { ascending: false }).limit(50),
    access.supabase.from("documents").select("*").eq("lead_id", id).eq("organization_id", access.access.organization.id).order("created_at", { ascending: false }).limit(50),
    access.supabase.from("ai_insights").select("*").eq("lead_id", id).eq("organization_id", access.access.organization.id).order("created_at", { ascending: false }).limit(20),
  ]);

  return apiSuccess({
    lead: leadResult.data,
    timeline: rows(activities, "activities", request, access.meta),
    activities: rows(activities, "activities", request, access.meta),
    pipeline: rows(opportunities, "opportunities", request, access.meta),
    campaign: null,
    assignedBroker: null,
    notes: rows(notes, "notes", request, access.meta),
    documents: rows(documents, "documents", request, access.meta),
    aiInsights: rows(insights, "ai_insights", request, access.meta),
  }, access.meta, { headers: rate.headers });
}
