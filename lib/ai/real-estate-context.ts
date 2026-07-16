import type { ApiIdentity } from "@/lib/security/api-auth";

type Row = Record<string, unknown>;

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function status(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function buildRealEstateContext(identity: ApiIdentity) {
  const results = await Promise.allSettled([
    identity.supabase.from("developments").select("id,name,developer_name,city,status,delivery_date").limit(100),
    identity.supabase.from("properties").select("development_id,status,price,typology,bedrooms,area").limit(2000),
    identity.supabase.from("leads").select("status,score,temperature,source,assigned_to,next_action_at,created_at").limit(2000),
    identity.supabase.from("opportunities").select("stage,value,probability,expected_close_at,created_at").limit(2000),
    identity.supabase.from("project_materials").select("development_id,material_type,title,version,valid_until").eq("is_current", true).limit(500),
  ]);

  const rows = (index: number): Row[] => {
    const result = results[index];
    if (result.status !== "fulfilled" || result.value.error) return [];
    return (result.value.data ?? []) as Row[];
  };
  const developments = rows(0);
  const properties = rows(1);
  const leads = rows(2);
  const opportunities = rows(3);
  const materials = rows(4);
  const now = Date.now();

  const available = properties.filter((item) => ["available", "ativo", "disponivel", "disponível"].includes(status(item.status)));
  const sold = properties.filter((item) => ["sold", "vendido", "ganho"].includes(status(item.status)));
  const reserved = properties.filter((item) => ["reserved", "reservado", "held"].includes(status(item.status)));
  const overdue = leads.filter((item) => item.next_action_at && new Date(String(item.next_action_at)).getTime() < now);
  const hot = leads.filter((item) => number(item.score) >= 70 || status(item.temperature) === "quente");
  const withoutNextAction = leads.filter((item) => !item.next_action_at);
  const openOpportunities = opportunities.filter((item) => !["ganho", "won", "perdido", "lost"].includes(status(item.stage)));
  const pipeline = openOpportunities.reduce((sum, item) => sum + number(item.value), 0);
  const forecast = openOpportunities.reduce((sum, item) => sum + number(item.value) * number(item.probability) / 100, 0);

  return {
    scope: "Somente registros visíveis ao usuário pelas políticas de acesso do CRM.",
    portfolio: {
      developments: developments.length,
      developers: [...new Set(developments.map((item) => String(item.developer_name || "Não informada")))].length,
      inventory: properties.length,
      available: available.length,
      reserved: reserved.length,
      sold: sold.length,
      absorptionPercent: properties.length ? Math.round(sold.length / properties.length * 100) : 0,
      availableVgv: available.reduce((sum, item) => sum + number(item.price), 0),
    },
    commercial: {
      leads: leads.length,
      hotLeads: hot.length,
      overdueNextActions: overdue.length,
      withoutNextAction: withoutNextAction.length,
      openOpportunities: openOpportunities.length,
      pipelineValue: pipeline,
      weightedForecast: forecast,
    },
    materials: {
      current: materials.length,
      expired: materials.filter((item) => item.valid_until && new Date(String(item.valid_until)).getTime() < now).length,
      byType: Object.fromEntries([...new Set(materials.map((item) => String(item.material_type)))].map((type) => [type, materials.filter((item) => item.material_type === type).length])),
    },
    projects: developments.slice(0, 30).map((item) => ({
      id: item.id,
      name: item.name,
      developer: item.developer_name,
      city: item.city,
      status: item.status,
      deliveryDate: item.delivery_date,
    })),
  };
}

