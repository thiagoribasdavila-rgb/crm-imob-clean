import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type Domain = {
  key: string;
  label: string;
  layer: "V1" | "V2" | "V3" | "Atlas 2030";
  href: string;
  total: number;
  status: "ready" | "attention" | "empty";
  detail: string;
};

type CountFilter = { column: string; value: string };

async function countForOrganization(
  organizationId: string,
  table: string,
  filter?: CountFilter,
): Promise<number> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function domainStatus(total: number, attention = false): Domain["status"] {
  if (attention) return "attention";
  return total > 0 ? "ready" : "empty";
}

export async function GET(request: Request) {
  const rate = checkRateLimit(clientKey(request, "v3-integration-hub"), {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Limite de consultas excedido." }, { status: 429 });
  }

  try {
    const identity = await requireApiIdentity(request);
    const organizationId = identity.organizationId;

    const [
      leads,
      customers,
      properties,
      opportunities,
      campaigns,
      conversations,
      approvals,
      decisions,
      agents,
      twins,
      insights,
      queuedEvents,
      failedEvents,
      memories,
      recommendations,
      reservations,
    ] = await Promise.all([
      countForOrganization(organizationId, "leads"),
      countForOrganization(organizationId, "customers"),
      countForOrganization(organizationId, "properties"),
      countForOrganization(organizationId, "opportunities"),
      countForOrganization(organizationId, "campaigns"),
      countForOrganization(organizationId, "conversations", { column: "status", value: "open" }),
      countForOrganization(organizationId, "approval_requests", { column: "status", value: "pending" }),
      countForOrganization(organizationId, "atlas_decisions", { column: "status", value: "proposed" }),
      countForOrganization(organizationId, "atlas_agent_runs"),
      countForOrganization(organizationId, "digital_twin_snapshots"),
      countForOrganization(organizationId, "ai_insights"),
      countForOrganization(organizationId, "integration_outbox", { column: "status", value: "pending" }),
      countForOrganization(organizationId, "integration_outbox", { column: "status", value: "failed" }),
      countForOrganization(organizationId, "atlas_memories"),
      countForOrganization(organizationId, "atlas_recommendations"),
      countForOrganization(organizationId, "atlas_inventory_reservations", { column: "status", value: "held" }),
    ]);

    const domains: Domain[] = [
      { key: "sales", label: "Sales Operation", layer: "V1", href: "/pipeline", total: leads + customers + opportunities, status: domainStatus(leads + customers + opportunities), detail: `${leads} leads · ${opportunities} oportunidades` },
      { key: "inventory", label: "Inventory Intelligence", layer: "V1", href: "/developments", total: properties, status: domainStatus(properties), detail: `${properties} unidades conectadas` },
      { key: "growth", label: "Growth Layer", layer: "V2", href: "/atlas-v2", total: campaigns + conversations, status: domainStatus(campaigns + conversations), detail: `${campaigns} campanhas · ${conversations} conversas abertas` },
      { key: "governance", label: "Governança", layer: "V3", href: "/approvals", total: approvals + decisions, status: domainStatus(approvals + decisions, approvals > 0), detail: `${approvals} aprovações · ${decisions} decisões` },
      { key: "intelligence", label: "Intelligence Core", layer: "V3", href: "/decision-center", total: twins + insights + agents, status: domainStatus(twins + insights + agents), detail: `${twins} twins · ${insights} insights · ${agents} agentes` },
      { key: "platform", label: "Platform Layer", layer: "Atlas 2030", href: "/atlas-2030", total: memories + recommendations + reservations, status: domainStatus(memories + recommendations + reservations), detail: `${memories} memórias · ${recommendations} recomendações · ${reservations} reservas` },
      { key: "events", label: "Event Fabric", layer: "Atlas 2030", href: "/atlas-v3/audit", total: queuedEvents + failedEvents, status: domainStatus(queuedEvents, failedEvents > 0), detail: `${queuedEvents} eventos na fila · ${failedEvents} falhas` },
    ];

    const ready = domains.filter((domain) => domain.status === "ready").length;
    const attention = domains.filter((domain) => domain.status === "attention").length;
    const readiness = Math.round(((ready + Math.max(0, domains.length - ready - attention) * 0.35) / domains.length) * 100);

    return NextResponse.json({
      status: attention > 0 ? "attention" : "operational",
      readiness,
      domains,
      totals: {
        leads,
        customers,
        properties,
        opportunities,
        campaigns,
        conversations,
        approvals,
        decisions,
        agents,
        twins,
        insights,
        queuedEvents,
        failedEvents,
        memories,
        recommendations,
        reservations,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("v3.integration_hub_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao consolidar integrações.";
    const status = /token|sessão|autoriz/i.test(message) ? 401 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
