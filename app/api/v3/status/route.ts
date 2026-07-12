import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAccessContext } from "@/lib/api/security";
import { featureSnapshot } from "@/lib/platform/feature-flags";
import { operatingMaturity, type AtlasOperatingSnapshot } from "@/lib/atlas/orchestration";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type CountFilter =
  | { kind: "eq"; column: string; value: string }
  | { kind: "in"; column: string; values: string[] }
  | { kind: "notIn"; column: string; values: string[] };

async function count(client: SupabaseClient, organizationId: string, table: string, filter?: CountFilter): Promise<number> {
  let query = client.from(table).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);

  if (filter?.kind === "eq") query = query.eq(filter.column, filter.value);
  if (filter?.kind === "in") query = query.in(filter.column, filter.values);
  if (filter?.kind === "notIn") query = query.not(filter.column, "in", `(${filter.values.join(",")})`);

  const { count: total, error } = await query;
  if (error) throw error;
  return total ?? 0;
}

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request, { roles: ["admin", "manager", "broker", "viewer"] });
  if (!access.ok) return access.response;

  try {
    const organizationId = access.access.organization.id;
    const client = access.supabase;
    const [
      leads,
      customers,
      properties,
      opportunities,
      pendingTasks,
      campaigns,
      openConversations,
      pendingApprovals,
      queuedEvents,
      failedEvents,
      proposedDecisions,
      activeAgents,
      digitalTwins,
      insights,
    ] = await Promise.all([
      count(client, organizationId, "leads"),
      count(client, organizationId, "customers"),
      count(client, organizationId, "properties"),
      count(client, organizationId, "opportunities"),
      count(client, organizationId, "tasks", { kind: "notIn", column: "status", values: ["done", "concluida"] }),
      count(client, organizationId, "campaigns"),
      count(client, organizationId, "conversations", { kind: "eq", column: "status", value: "open" }),
      count(client, organizationId, "approval_requests", { kind: "eq", column: "status", value: "pending" }),
      count(client, organizationId, "integration_outbox", { kind: "in", column: "status", values: ["pending", "processing"] }),
      count(client, organizationId, "integration_outbox", { kind: "in", column: "status", values: ["failed", "dead_letter"] }),
      count(client, organizationId, "atlas_decisions", { kind: "eq", column: "status", value: "proposed" }),
      count(client, organizationId, "atlas_agent_runs", { kind: "in", column: "status", values: ["queued", "running", "waiting_approval"] }),
      count(client, organizationId, "digital_twin_snapshots"),
      count(client, organizationId, "ai_insights"),
    ]);

    const snapshot: AtlasOperatingSnapshot = {
      v1: { leads, customers, properties, opportunities, pendingTasks },
      v2: { campaigns, openConversations, pendingApprovals, queuedEvents, failedEvents },
      v3: { proposedDecisions, activeAgents, digitalTwins, insights },
    };

    return NextResponse.json({
      status: "operational",
      service: "atlas-ai-os",
      maturity: operatingMaturity(snapshot),
      snapshot,
      features: featureSnapshot(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("v3.status_failed", error);
    return NextResponse.json({ status: "degraded", error: "Falha ao consolidar o Atlas OS." }, { status: 503 });
  }
}
