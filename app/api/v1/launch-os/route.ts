import { type NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { structuredApiLog } from "@/lib/api/core";
import {
  isMissingColumn,
  isMissingRelation,
} from "@/lib/compat/legacy-v2";
import { readCompatibleDevelopments, readCompatiblePipeline } from "@/lib/atlas/core-v2/live-repositories";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;
type ModuleStatus = "connected" | "legacy" | "not-configured" | "unavailable";

const ESSENTIAL_MATERIALS = ["book", "price_table", "sales_mirror"] as const;

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: unknown) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function developmentRef(row: AnyRow) {
  return textValue(row.development_id || row.developmentId || row.project_id || row.projectId);
}

function optionalStatus(error: { code?: string; message?: string } | null, legacy = false): ModuleStatus {
  if (!error) return legacy ? "legacy" : "connected";
  if (isMissingRelation(error) || isMissingColumn(error)) return "not-configured";
  return "unavailable";
}

function validCurrentMaterial(row: AnyRow, today: string) {
  const status = normalized(row.review_status || "pending");
  const validFrom = textValue(row.valid_from);
  const validUntil = textValue(row.valid_until);
  return row.is_current !== false
    && status === "verified"
    && (!validFrom || validFrom <= today)
    && (!validUntil || validUntil >= today);
}

function priorityForProject(input: {
  inventoryTotal: number;
  materialCoverage: number;
  expiredMaterials: number;
  pendingMaterials: number;
  developerName: string;
  city: string;
}) {
  if (input.expiredMaterials > 0) {
    return {
      rank: 0,
      label: "Material comercial vencido",
      detail: "Revise a versão vigente antes de orientar o cliente.",
      tone: "danger" as const,
    };
  }
  if (input.materialCoverage < 100) {
    return {
      rank: 1,
      label: "Kit comercial incompleto",
      detail: "Complete book, tabela e espelho de vendas validados.",
      tone: "warning" as const,
    };
  }
  if (input.pendingMaterials > 0) {
    return {
      rank: 2,
      label: "Material aguardando validação",
      detail: "A liderança precisa revisar a versão antes do uso comercial.",
      tone: "warning" as const,
    };
  }
  if (input.inventoryTotal === 0) {
    return {
      rank: 3,
      label: "Estoque ainda não conectado",
      detail: "Vincule unidades para acompanhar disponibilidade e VGV.",
      tone: "info" as const,
    };
  }
  if (!input.developerName || !input.city) {
    return {
      rank: 4,
      label: "Cadastro essencial incompleto",
      detail: "Informe incorporadora e localização para concluir o contexto.",
      tone: "info" as const,
    };
  }
  return null;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "launch-os-read" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const db = identity.supabase;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const developmentResult = await readCompatibleDevelopments(db, { organizationId, limit: 500 });
    const developmentsCompatibility: ModuleStatus = "connected";

    if (!developmentResult.ok) {
      structuredApiLog("warn", "launch_os.portfolio_unavailable", request, identity.meta, {
        organizationId,
        code: developmentResult.error.code,
      });
      return NextResponse.json(
        { error: "O portfólio está temporariamente indisponível." },
        { status: 503, headers: rate.headers },
      );
    }

    const [propertyResult, leadResult, campaignResult, materialResult] = await Promise.all([
      db.from("inventory_units").select("id,project_id,price,status,unit_code,typology,bedrooms,private_area").eq("organization_id", organizationId).limit(5000),
      readCompatiblePipeline(db, { organizationId, limit: 5000 }),
      // Paginado pelo mesmo motivo do director-daily: acima de 1000 campanhas o
      // PostgREST corta sem erro e a campanha desaparece do painel em silêncio.
      fetchAllRows<AnyRow>((from, to) => db.from("marketing_campaigns").select("id,project_id,name,platform,status,created_at").eq("organization_id", organizationId).order("id", { ascending: true }).range(from, to)),
      db.from("knowledge_documents").select("id,project_id,title,document_type,status,created_at").eq("organization_id", organizationId).limit(5000),
    ]);
    const opportunities: AnyRow[] = leadResult.ok ? leadResult.opportunities : [];
    const pipelineCompatibility: ModuleStatus = leadResult.ok ? "legacy" : "unavailable";
    const properties: AnyRow[] = propertyResult.error ? [] : ((propertyResult.data ?? []) as unknown as AnyRow[]).map((row) => ({ ...row, development_id: row.project_id }));
    const campaigns: AnyRow[] = campaignResult.error ? [] : campaignResult.rows;
    const reservations: AnyRow[] = [];
    const intelligence: AnyRow[] = [];
    const materials: AnyRow[] = materialResult.error ? [] : ((materialResult.data ?? []) as unknown as AnyRow[]).map((row) => ({ ...row, development_id: row.project_id, material_type: row.document_type, is_current: true, review_status: "verified" }));

    const moduleHealth: Record<string, ModuleStatus> = {
      portfolio: developmentsCompatibility,
      inventory: optionalStatus(propertyResult.error),
      pipeline: pipelineCompatibility,
      marketing: optionalStatus(campaignResult.error),
      reservations: "not-configured",
      intelligence: "not-configured",
      materials: optionalStatus(materialResult.error),
    };

    const developmentRows = developmentResult.rows as AnyRow[];
    const developments = developmentRows.map((development) => {
      const id = textValue(development.id);
      const inventory = properties.filter((item) => developmentRef(item) === id);
      const linkedOpportunities = opportunities.filter(
        (item) => developmentRef(item) === id
          || inventory.some((unit) => textValue(unit.id) === textValue(item.property_id)),
      );
      const linkedCampaigns = campaigns.filter((item) => developmentRef(item) === id);
      const linkedReservations = reservations.filter(
        (item) => developmentRef(item) === id
          || inventory.some((unit) => textValue(unit.id) === textValue(item.property_id || item.unit_id)),
      );
      const linkedMaterials = materials.filter((item) => developmentRef(item) === id);
      const validMaterials = linkedMaterials.filter((item) => validCurrentMaterial(item, today));
      const availableMaterialTypes = ESSENTIAL_MATERIALS.filter((type) =>
        validMaterials.some((item) => textValue(item.material_type) === type));
      const expiredMaterials = linkedMaterials.filter((item) => {
        const validUntil = textValue(item.valid_until);
        return item.is_current !== false && Boolean(validUntil) && validUntil < today;
      }).length;
      const pendingMaterials = linkedMaterials.filter((item) =>
        item.is_current !== false && normalized(item.review_status || "pending") === "pending").length;

      const available = inventory.filter((item) => ["available", "ativo", "disponivel"].includes(normalized(item.status)));
      const sold = inventory.filter((item) => ["sold", "vendido", "ganho"].includes(normalized(item.status)));
      const reserved = inventory.filter((item) => ["reserved", "reservado", "hold"].includes(normalized(item.status)));
      const totalVgv = inventory.reduce((sum, item) => sum + numberValue(item.price), 0);
      const soldVgv = sold.reduce((sum, item) => sum + numberValue(item.price), 0);
      const pipeline = linkedOpportunities.reduce((sum, item) => sum + numberValue(item.value), 0);
      const forecast = linkedOpportunities.reduce(
        (sum, item) => sum + numberValue(item.value) * (numberValue(item.probability) / 100), 0);
      const spend = linkedCampaigns.reduce((sum, item) => sum + numberValue(item.spend), 0);
      const revenue = linkedCampaigns.reduce((sum, item) => sum + numberValue(item.revenue), 0);
      const leads = linkedCampaigns.reduce((sum, item) => sum + numberValue(item.leads_count), 0);
      const materialCoverage = Math.round((availableMaterialTypes.length / ESSENTIAL_MATERIALS.length) * 100);
      const developerName = textValue(development.developer_name);
      const city = textValue(development.city);
      const priority = priorityForProject({
        inventoryTotal: inventory.length,
        materialCoverage,
        expiredMaterials,
        pendingMaterials,
        developerName,
        city,
      });

      return {
        ...development,
        id,
        name: textValue(development.name || development.development_name) || "Empreendimento sem nome",
        developer_name: developerName || null,
        intelligence: intelligence.find((item) => textValue(item.development_id) === id) ?? null,
        readiness: {
          materialCoverage,
          availableMaterialTypes,
          expiredMaterials,
          pendingMaterials,
          priority,
        },
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
          activeReservations: linkedReservations.filter((item) =>
            ["active", "held", "pending", "reservado"].includes(normalized(item.status))).length,
        },
      };
    });

    const portfolio = developments.reduce(
      (acc, item) => {
        acc.totalVgv += item.metrics.totalVgv;
        acc.soldVgv += item.metrics.soldVgv;
        acc.pipeline += item.metrics.pipeline;
        acc.forecast += item.metrics.forecast;
        acc.units += item.metrics.inventoryTotal;
        acc.available += item.metrics.available;
        acc.sold += item.metrics.sold;
        acc.reservations += item.metrics.activeReservations;
        acc.completeMaterialKits += item.readiness.materialCoverage === 100 ? 1 : 0;
        acc.needsReview += item.readiness.priority ? 1 : 0;
        return acc;
      },
      {
        totalVgv: 0,
        soldVgv: 0,
        pipeline: 0,
        forecast: 0,
        units: 0,
        available: 0,
        sold: 0,
        reservations: 0,
        completeMaterialKits: 0,
        needsReview: 0,
      },
    );

    const priorities = developments
      .filter((item) => Boolean(item.readiness.priority))
      .sort((left, right) => (left.readiness.priority?.rank ?? 99) - (right.readiness.priority?.rank ?? 99))
      .slice(0, 3)
      .map((item) => ({
        developmentId: textValue(item.id),
        developmentName: item.name,
        ...item.readiness.priority,
      }));

    return NextResponse.json(
      {
        portfolio,
        developments,
        priorities,
        moduleHealth,
        compatibility: pipelineCompatibility === "legacy" ? "safe-v2-v3" : "canonical-v3",
        generatedAt: new Date().toISOString(),
      },
      { headers: { ...rate.headers, "Cache-Control": "no-store" } },
    );
  } catch {
    structuredApiLog("error", "launch_os.read_failed", request, identity.meta, { organizationId });
    return NextResponse.json(
      { error: "Projetos temporariamente indisponíveis. O Atlas registrou o problema." },
      { status: 500, headers: rate.headers },
    );
  }
}
