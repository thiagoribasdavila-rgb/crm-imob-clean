import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { featureSnapshot } from "@/lib/platform/feature-flags";
import { operatingMaturity, type AtlasOperatingSnapshot } from "@/lib/atlas/orchestration";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type CountFilter =
  | { kind: "eq"; column: string; value: string }
  | { kind: "in"; column: string; values: string[] }
  | { kind: "notIn"; column: string; values: string[] };

async function count(table: string, filter?: CountFilter): Promise<number> {
  const admin = getSupabaseAdmin();
  let query = admin.from(table).select("id", { count: "exact", head: true });

  if (filter?.kind === "eq") query = query.eq(filter.column, filter.value);
  if (filter?.kind === "in") query = query.in(filter.column, filter.values);
  if (filter?.kind === "notIn") query = query.not(filter.column, "in", `(${filter.values.join(",")})`);

  const { count: total, error } = await query;
  if (error) throw error;
  return total ?? 0;
}

export async function GET(request: Request) {
  const cronSecret = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
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
      count("leads"),
      count("customers"),
      count("properties"),
      count("opportunities"),
      count("tasks", { kind: "notIn", column: "status", values: ["done", "concluida"] }),
      count("campaigns"),
      count("conversations", { kind: "eq", column: "status", value: "open" }),
      count("approval_requests", { kind: "eq", column: "status", value: "pending" }),
      count("integration_outbox", { kind: "in", column: "status", values: ["pending", "processing"] }),
      count("integration_outbox", { kind: "in", column: "status", values: ["failed", "dead_letter"] }),
      count("atlas_decisions", { kind: "eq", column: "status", value: "proposed" }),
      count("atlas_agent_runs", { kind: "in", column: "status", values: ["queued", "running", "waiting_approval"] }),
      count("digital_twin_snapshots"),
      count("ai_insights"),
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
