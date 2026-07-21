import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { aggregate, weekly, budgetView, type SpendRow, type ProductBudget } from "@/lib/marketing/cost-report";
import { marketingEfficiencyPlan } from "@/lib/ai/marketing-strategist";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}
const isDirector = (role: string) => ["director", "superintendent"].includes(role);

// GET — relatório de custo: semanal por campanha / projeto / incorporador + a
// visão de verba por produto (planejado × real). Liderança comercial.
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 40, scope: "marketing-cost-report" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = roleOf(identity.access);
  if (!["director", "superintendent", "manager"].includes(role)) {
    return apiError("FORBIDDEN", "Relatório de custo pertence à liderança.", identity.meta, { status: 403 });
  }
  const org = identity.access.organization.id;
  const admin = getSupabaseAdmin();

  // gasto real — sem marketing_spend não há relatório (503 honesto)
  const { data: spend, error: spendErr } = await admin
    .from("marketing_spend").select("campaign_id,spend_date,amount").eq("organization_id", org);
  if (spendErr) return apiError("REPORT_UNAVAILABLE", "Relatório indisponível até a ativação do banco (marketing_spend).", identity.meta, { status: 503 });

  // campanhas + mapeamento projeto/incorporador (tolerante a colunas ausentes)
  let campaigns: Array<{ id: string; name?: string; development_id?: string | null }> = [];
  const withDev = await admin.from("marketing_campaigns").select("id,name,development_id").eq("organization_id", org);
  if (withDev.error) {
    const basic = await admin.from("marketing_campaigns").select("id,name").eq("organization_id", org);
    campaigns = basic.data ?? [];
  } else {
    campaigns = withDev.data ?? [];
  }
  const campMap = new Map(campaigns.map((c) => [c.id, c]));

  // developments (produto) → developers (incorporador), best-effort
  const devIds = [...new Set(campaigns.map((c) => c.development_id).filter(Boolean))] as string[];
  const prodMap = new Map<string, { name: string; developerId?: string | null }>();
  const devrMap = new Map<string, string>();
  if (devIds.length) {
    const dvs = await admin.from("developments").select("id,name,developer_id").in("id", devIds).eq("organization_id", org);
    for (const d of dvs.data ?? []) prodMap.set(d.id, { name: d.name, developerId: d.developer_id });
    const developerIds = [...new Set((dvs.data ?? []).map((d) => d.developer_id).filter(Boolean))] as string[];
    if (developerIds.length) {
      const drs = await admin.from("developers").select("id,name").in("id", developerIds).eq("organization_id", org);
      for (const dr of drs.data ?? []) devrMap.set(dr.id, dr.name);
    }
  }
  const productOf = (campaignId: string) => {
    const c = campMap.get(campaignId);
    const dev = c?.development_id ? prodMap.get(c.development_id) : undefined;
    return { product: dev?.name ?? null, developer: dev?.developerId ? devrMap.get(dev.developerId) ?? null : null };
  };

  // leads/vendas por campanha (venda = status 'ganho')
  const { data: leads } = await admin.from("leads").select("campaign_id,status").eq("organization_id", org).not("campaign_id", "is", null);

  const spendRows: SpendRow[] = (spend ?? []).map((s) => {
    const pd = productOf(s.campaign_id);
    return { campaignId: s.campaign_id, campaignName: campMap.get(s.campaign_id)?.name ?? s.campaign_id, product: pd.product, developer: pd.developer, date: s.spend_date, spend: Number(s.amount) || 0, leads: 0, sales: 0 };
  });
  const leadRows: SpendRow[] = (leads ?? []).map((l) => {
    const pd = productOf(l.campaign_id);
    return { campaignId: l.campaign_id, campaignName: campMap.get(l.campaign_id)?.name ?? l.campaign_id, product: pd.product, developer: pd.developer, spend: 0, leads: 1, sales: String(l.status).toLowerCase() === "ganho" ? 1 : 0 };
  });
  const all = [...spendRows, ...leadRows];

  // verba por produto
  const { data: budgets } = await admin.from("product_budgets").select("product,developer,weekly_budget,target_cac,active").eq("organization_id", org).eq("active", true);
  const productBudgets: ProductBudget[] = (budgets ?? []).map((b) => ({ product: b.product, developer: b.developer, weeklyBudget: Number(b.weekly_budget) || 0, targetCac: b.target_cac != null ? Number(b.target_cac) : null }));

  const byCampaignAgg = aggregate(all, "campaign");
  const budget = budgetView(productBudgets, all);

  return apiSuccess({
    totals: { spend: byCampaignAgg.reduce((s, b) => s + b.spend, 0), campaigns: campaigns.length },
    byCampaign: { aggregate: byCampaignAgg, weekly: weekly(spendRows, "campaign") },
    byProject: { aggregate: aggregate(all, "product"), weekly: weekly(spendRows, "product") },
    byDeveloper: { aggregate: aggregate(all, "developer"), weekly: weekly(spendRows, "developer") },
    budget,
    // IA de marketing (eficiência) — propostas de escalar/pausar/realocar verba
    plan: marketingEfficiencyPlan(budget, byCampaignAgg),
  }, identity.meta, { headers: limited.headers });
}

// PUT — define/atualiza a verba de um produto (só diretor). O campo de estratégia.
export async function PUT(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 20, scope: "product-budget-set" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Definir verba por produto é do diretor.", identity.meta, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { product?: string; developer?: string; weeklyBudget?: number; targetCac?: number | null; active?: boolean } | null;
  const product = String(body?.product ?? "").trim();
  if (!product) return apiError("PRODUCT_REQUIRED", "Informe o produto (empreendimento).", identity.meta, { status: 422 });
  const weeklyBudget = Number(body?.weeklyBudget);
  if (!Number.isFinite(weeklyBudget) || weeklyBudget < 0) return apiError("BUDGET_INVALID", "Verba semanal inválida.", identity.meta, { status: 422 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("product_budgets")
    .upsert({
      organization_id: identity.access.organization.id,
      product,
      developer: body?.developer?.trim() || null,
      weekly_budget: weeklyBudget,
      target_cac: body?.targetCac != null && Number.isFinite(Number(body.targetCac)) ? Number(body.targetCac) : null,
      active: body?.active !== false,
      set_by: identity.access.profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,product" })
    .select("id,product,weekly_budget,target_cac,active")
    .single();
  if (error || !data) return apiError("BUDGET_FAILED", "Não foi possível salvar a verba (verifique a ativação do banco).", identity.meta, { status: 500 });
  return apiSuccess({ saved: data }, identity.meta, { headers: limited.headers });
}
