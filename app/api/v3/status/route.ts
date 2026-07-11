import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { featureSnapshot } from "@/lib/platform/feature-flags";
import { operatingMaturity, type AtlasOperatingSnapshot } from "@/lib/atlas/orchestration";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

async function count(
  table: string,
  configure?: (query: ReturnType<ReturnType<typeof getSupabaseAdmin>["from"]>) => ReturnType<ReturnType<typeof getSupabaseAdmin>["from"]>,
): Promise<number> {
  const admin = getSupabaseAdmin();
  let query = admin.from(table).select("id", { count: "exact", head: true });
  if (configure) query = configure(query);
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
      count("tasks", (query) => query.not("status", "in", "(done,concluida)")),
      count("campaigns"),
      count("conversations", (query) => query.eq("status", "open")),
      count("approval_requests", (query) => query.eq("status", "pending")),
      count("integration_outbox", (query) => query.in("status", ["pending", "processing"])),
      count("integration_outbox", (query) => query.in("status", ["failed", "dead_letter"])),
      count("atlas_decisions", (query) => query.eq("status", "proposed")),
      count("atlas_agent_runs", (query) => query.in("status", ["queued", "running", "waiting_approval"])),
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
