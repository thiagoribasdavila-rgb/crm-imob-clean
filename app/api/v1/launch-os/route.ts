import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function developmentRef(row: AnyRow) {
  return textValue(row.development_id || row.developmentId || row.project_id || row.projectId);
}

export async function GET(request: Request) {
  const rate = checkRateLimit(clientKey(request, "launch-os-read"), { limit: 60, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas consultas ao Launch OS. Aguarde alguns segundos." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } },
    );
  }

  try {
    const identity = await requireApiIdentity(request);
    const admin = getSupabaseAdmin();

    const [developmentResult, propertyResult, opportunityResult, campaignResult, reservationResult] = await Promise.all([
      admin.from("developments").select("*").eq("organization_id", identity.organizationId).order("created_at", { ascending: false }),
      admin.from("properties").select("*").eq("organization_id", identity.organizationId).limit(2000),
      admin.from("opportunities").select("*").eq("organization_id", identity.organizationId).limit(2000),
      admin.from("campaigns").select("*").eq("organization_id", identity.organizationId).limit(500),
      admin.from("atlas_inventory_reservations").select("*").eq("organization_id", identity.organizationId).limit(1000),
    ]);

    if (developmentResult.error) throw developmentResult.error;

    const properties = (propertyResult.data ?? []) as AnyRow[];
    const opportunities = (opportunityResult.data ?? []) as AnyRow[];
    const campaigns = (campaignResult.data ?? []) as AnyRow[];
    const reservations = (reservationResult.data ?? []) as AnyRow[];

    const developments = ((developmentResult.data ?? []) as AnyRow[]).map((development) => {
      const id = textValue(development.id);
      const inventory = properties.filter((item) => developmentRef(item) === id);
      const linkedOpportunities = opportunities.filter((item) => developmentRef(item) === id || inventory.some((unit) => textValue(unit.id) === textValue(item.property_id)));
      const linkedCampaigns = campaigns.filter((item) => developmentRef(item) === id);
      const linkedReservations = reservations.filter((item) => developmentRef(item) === id || inventory.some((unit) => textValue(unit.id) === textValue(item.property_id || item.unit_id)));

      const available = inventory.filter((item) => ["available", "ativo", "disponivel", "disponível"].includes(textValue(item.status).toLowerCase()));
      const sold = inventory.filter((item) => ["sold", "vendido", "ganho"].includes(textValue(item.status).toLowerCase()));
      const reserved = inventory.filter((item) => ["reserved", "reservado", "hold"].includes(textValue(item.status).toLowerCase()));
      const totalVgv = inventory.reduce((sum, item) => sum + numberValue(item.price), 0);
      const soldVgv = sold.reduce((sum, item) => sum + numberValue(item.price), 0);
      const pipeline = linkedOpportunities.reduce((sum, item) => sum + numberValue(item.value), 0);
      const forecast = linkedOpportunities.reduce((sum, item) => sum + numberValue(item.value) * (numberValue(item.probability) / 100), 0);
      const spend = linkedCampaigns.reduce((sum, item) => sum + numberValue(item.spend), 0);
      const revenue = linkedCampaigns.reduce((sum, item) => sum + numberValue(item.revenue), 0);
      const leads = linkedCampaigns.reduce((sum, item) => sum + numberValue(item.leads_count), 0);

      return {
        ...development,
        metrics: {
          inventoryTotal: inventory.length,
          available: available.length,
          sold: sold.length,
          reserved: reserved.length,
          totalVgv,
          soldVgv,
          absorption: inventory.length ? Math.round((sold.length / inventory.length) * 100) : 0,
          pipeline,
          forecast,
          opportunities: linkedOpportunities.length,
          campaignSpend: spend,
          campaignRevenue: revenue,
          campaignLeads: leads,
          cpl: leads > 0 ? spend / leads : 0,
          roi: spend > 0 ? ((revenue - spend) / spend) * 100 : 0,
          activeReservations: linkedReservations.filter((item) => ["active", "held", "pending", "reservado"].includes(textValue(item.status).toLowerCase())).length,
        },
      };
    });

    const portfolio = developments.reduce(
      (acc, item) => {
        const metrics = item.metrics as Record<string, number>;
        acc.totalVgv += metrics.totalVgv;
        acc.soldVgv += metrics.soldVgv;
        acc.pipeline += metrics.pipeline;
        acc.forecast += metrics.forecast;
        acc.units += metrics.inventoryTotal;
        acc.available += metrics.available;
        acc.sold += metrics.sold;
        acc.reservations += metrics.activeReservations;
        return acc;
      },
      { totalVgv: 0, soldVgv: 0, pipeline: 0, forecast: 0, units: 0, available: 0, sold: 0, reservations: 0 },
    );

    return NextResponse.json({ portfolio, developments, generatedAt: new Date().toISOString() });
  } catch (error) {
    logger.error("launch_os.read_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao carregar Launch OS.";
    const status = /token|sessão|organização|autoriz/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
