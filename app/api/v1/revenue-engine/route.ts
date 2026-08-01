import type { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { detectRevenueInfrastructure, REVENUE_FUNNEL, REVENUE_POLICY } from "@/lib/revenue/revenue-engine";

export const dynamic = "force-dynamic";
type Metric = { value: number; available: boolean };

type Filter = { kind: "eq" | "gte"; column: string; value: string };
async function countRows(table: string, organizationId: string, filters: Filter[] = []): Promise<Metric> {
  try {
    let query = getSupabaseAdmin().from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
    for (const filter of filters) query = filter.kind === "eq" ? query.eq(filter.column, filter.value) : query.gte(filter.column, filter.value);
    const { count, error } = await query;
    return error ? { value: 0, available: false } : { value: count || 0, available: true };
  } catch { return { value: 0, available: false }; }
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 40, scope: "revenue-engine.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["director", "superintendent", "manager"] });
  if (!access.ok) return access.response;
  const organizationId = access.access.organization.id;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [leads, journeys, handoffs, reactivation, conversions, delivered, qualified, visits, proposals, sales] = await Promise.all([
    countRows("leads", organizationId, [{ kind: "gte", column: "created_at", value: since }]),
    countRows("ai_sales_journeys", organizationId, [{ kind: "gte", column: "created_at", value: since }]),
    countRows("nightly_broker_handoffs", organizationId, [{ kind: "gte", column: "created_at", value: since }]),
    countRows("lead_reactivation_contacts", organizationId),
    countRows("meta_conversion_events", organizationId, [{ kind: "gte", column: "created_at", value: since }]),
    countRows("meta_conversion_events", organizationId, [{ kind: "eq", column: "status", value: "delivered" }, { kind: "gte", column: "created_at", value: since }]),
    countRows("meta_conversion_events", organizationId, [{ kind: "eq", column: "event_name", value: "QualifiedLead" }, { kind: "gte", column: "created_at", value: since }]),
    countRows("meta_conversion_events", organizationId, [{ kind: "eq", column: "event_name", value: "Schedule" }, { kind: "gte", column: "created_at", value: since }]),
    countRows("meta_conversion_events", organizationId, [{ kind: "eq", column: "event_name", value: "SubmitApplication" }, { kind: "gte", column: "created_at", value: since }]),
    countRows("meta_conversion_events", organizationId, [{ kind: "eq", column: "event_name", value: "ConvertedLead" }, { kind: "gte", column: "created_at", value: since }]),
  ]);
  return apiSuccess({
    period: "30d",
    infrastructure: detectRevenueInfrastructure(),
    policy: REVENUE_POLICY,
    summary: { leads, journeys, handoffs, reactivation, conversions, delivered },
    funnel: REVENUE_FUNNEL.map((stage) => ({ ...stage, value: stage.key === "Lead" ? leads.value : stage.key === "QualifiedLead" ? qualified.value : stage.key === "Schedule" ? visits.value : stage.key === "SubmitApplication" ? proposals.value : stage.key === "ConvertedLead" ? sales.value : journeys.value })),
    governance: { supervisedMode: true, externalMessagesWithoutApproval: false, rawPersonalDataInAndromedaReport: false, realNightTestRequired: true },
  }, access.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
