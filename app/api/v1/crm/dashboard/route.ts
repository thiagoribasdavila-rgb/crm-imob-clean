import type { NextRequest } from "next/server";
import { apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

type SupabaseQueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

function tableRows<T>(result: SupabaseQueryResult<T>, label: string, request: NextRequest, meta: { requestId: string; correlationId: string; version: string; timestamp: string }) {
  if (result.error) {
    structuredApiLog("warn", "crm.dashboard_table_failed", request, meta, { table: label, message: result.error.message });
    return { rows: [] as T[], error: { table: label, message: result.error.message } };
  }
  return { rows: result.data ?? [], error: null };
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 90, windowMs: 60_000, scope: "crm.dashboard" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, { roles: ["admin", "manager", "broker", "viewer"] });
  if (!access.ok) return access.response;

  const organizationId = access.access.organization.id;

  const [leadResult, opportunityResult, campaignResult, insightResult, taskResult, propertyResult] = await Promise.all([
    access.supabase
      .from("leads")
      .select("id,name,status,score,temperature,source,created_at,next_action_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    access.supabase
      .from("opportunities")
      .select("id,stage,value,probability,expected_close_at,lead_id")
      .eq("organization_id", organizationId)
      .limit(100),
    access.supabase
      .from("campaigns")
      .select("id,name,spend,revenue,leads_count,status")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
    access.supabase
      .from("ai_insights")
      .select("id,title,recommendation,confidence,score,status,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(8),
    access.supabase
      .from("tasks")
      .select("id,title,priority,status,due_at")
      .eq("organization_id", organizationId)
      .order("due_at", { ascending: true })
      .limit(20),
    access.supabase
      .from("properties")
      .select("id,status,price")
      .eq("organization_id", organizationId)
      .limit(500),
  ]);

  const leads = tableRows(leadResult, "leads", request, access.meta);
  const opportunities = tableRows(opportunityResult, "opportunities", request, access.meta);
  const campaigns = tableRows(campaignResult, "campaigns", request, access.meta);
  const insights = tableRows(insightResult, "ai_insights", request, access.meta);
  const tasks = tableRows(taskResult, "tasks", request, access.meta);
  const properties = tableRows(propertyResult, "properties", request, access.meta);
  const errors = [leads.error, opportunities.error, campaigns.error, insights.error, tasks.error, properties.error].filter(Boolean);

  structuredApiLog("info", "crm.dashboard_loaded", request, access.meta, {
    organizationId,
    leads: leads.rows.length,
    opportunities: opportunities.rows.length,
    campaigns: campaigns.rows.length,
    errors: errors.length,
  });

  return apiSuccess({
    leads: leads.rows,
    opportunities: opportunities.rows,
    campaigns: campaigns.rows,
    insights: insights.rows,
    tasks: tasks.rows,
    properties: properties.rows,
    partial: errors.length > 0,
    errors,
  }, access.meta, { headers: rate.headers });
}
