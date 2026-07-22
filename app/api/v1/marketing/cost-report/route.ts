import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { cacheHeaders } from "@/lib/api/cache-headers";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { aggregate, weekly, budgetView, type SpendRow, type ProductBudget } from "@/lib/marketing/cost-report";
import { marketingEfficiencyPlan } from "@/lib/ai/marketing-strategist";
import { simulatePlan } from "@/lib/ai/decision-simulator";
import { fetchCampaignInsights, insightsToCostRows } from "@/lib/meta/marketing/campaign-read";
import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";
import { matchCampaign } from "@/lib/atlas/developer-portfolio";

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
  const wantMeta = new URL(request.url).searchParams.get("source") === "meta";

  // gasto real — preferência: banco (marketing_spend); fallback/força: Meta ao vivo
  //
  // Lição F1: o PostgREST corta em 1000 linhas SEM erro. Aqui isso significava
  // gasto e VENDAS truncados para baixo em silêncio — o diretor pausando
  // campanha que vende. Paginação exaustiva com ordem determinística
  // (spend_date+id / created_at+id): sem .order() estável, o range pode repetir
  // e pular linhas entre páginas, trocando truncamento por erro não reprodutível.
  const spendFetch = await fetchAllRows<{ campaign_id: string; spend_date: string; amount: number | string }>(
    (from, to) => admin
      .from("marketing_spend")
      .select("campaign_id,spend_date,amount")
      .eq("organization_id", org)
      .order("spend_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const spend = spendFetch.rows;
  const spendErr = spendFetch.error;
  if (spendErr || wantMeta) {
    const token = process.env.META_ADS_ACCESS_TOKEN;
    const account = process.env.META_AD_ACCOUNT_ID;
    if (token && account) {
      const insights = await cachedMetaRead(
        `campaign-insights:${account}:last_30d:7`,
        () => fetchCampaignInsights(account, token, { datePreset: "last_30d", timeIncrement: 7 }),
      );
      if (Array.isArray(insights)) {
        // enriquecimento produto/incorporador best-effort pelo nome do empreendimento no nome da campanha
        // (developments e verbas em paralelo — independentes)
        const devPairs: Array<{ name: string; developer: string | null }> = [];
        const [dvs, budgetsResult] = await Promise.all([
          admin.from("developments").select("name,developer_id").eq("organization_id", org),
          admin.from("product_budgets").select("product,developer,weekly_budget,target_cac,active").eq("organization_id", org).eq("active", true),
        ]);
        if (!dvs.error && dvs.data?.length) {
          const ids = [...new Set(dvs.data.map((d) => d.developer_id).filter(Boolean))] as string[];
          const drs = ids.length ? await admin.from("developers").select("id,name").in("id", ids) : { data: [] };
          const drMap = new Map((drs.data ?? []).map((d) => [d.id, d.name]));
          for (const d of dvs.data) devPairs.push({ name: d.name, developer: d.developer_id ? drMap.get(d.developer_id) ?? null : null });
        }
        const rows = insightsToCostRows(insights, (_id, name) => {
          // 1º banco (developments), 2º o rol de incorporadoras em código
          const hit = devPairs.find((d) => name.toLowerCase().includes(d.name.toLowerCase()));
          if (hit) return { product: hit.name, developer: hit.developer };
          const rol = matchCampaign(name);
          return rol.developer ? { product: rol.product, developer: rol.developer } : {};
        });
        const pb: ProductBudget[] = (budgetsResult.data ?? []).map((b) => ({ product: b.product, developer: b.developer, weeklyBudget: Number(b.weekly_budget) || 0, targetCac: b.target_cac != null ? Number(b.target_cac) : null }));
        const agg = aggregate(rows, "campaign");
        const bud = budgetView(pb, rows);
        const livePlan = marketingEfficiencyPlan(bud, agg, { salesKnown: false });
        return apiSuccess({
          source: "meta_live", // gasto/leads direto da Meta (30d); venda só existe via CRM (Fase 0)
          // Mesma chave do caminho de banco para a tela não precisar de dois
          // contratos. Aqui a paginação é da Meta (graphGetAll segue o cursor).
          coverage: {
            window: "últimos 30 dias (Meta Insights) — vendas não entram por esta fonte",
            spendTruncated: false,
            leadsTruncated: false,
            campaignsTruncated: false,
            complete: true,
          },
          totals: { spend: agg.reduce((s, b) => s + b.spend, 0), campaigns: new Set(rows.map((r) => r.campaignId)).size },
          byCampaign: { aggregate: agg, weekly: weekly(rows, "campaign") },
          byProject: { aggregate: aggregate(rows, "product"), weekly: weekly(rows, "product") },
          byDeveloper: { aggregate: aggregate(rows, "developer"), weekly: weekly(rows, "developer") },
          budget: bud,
          plan: livePlan,
          // projeção de cada movimento ANTES de aprovar (dado 30d → semanal)
          projection: simulatePlan(livePlan, { campaigns: agg, budget: bud, period: "30d" }),
        }, identity.meta, { headers: { ...limited.headers, ...cacheHeaders({ maxAge: 60, swr: 120 }) } });
      }
    }
    if (spendErr) return apiError("REPORT_UNAVAILABLE", "Relatório indisponível: banco sem marketing_spend e Meta não configurada/legível.", identity.meta, { status: 503 });
  }

  // campanhas + mapeamento projeto/incorporador (tolerante a colunas ausentes).
  // Também paginado: acima de 1000 campanhas o campMap ficava incompleto e a
  // linha aparecia com o uuid no lugar do nome, em silêncio.
  type CampaignRow = { id: string; name?: string; development_id?: string | null };
  let campaigns: CampaignRow[] = [];
  const withDev = await fetchAllRows<CampaignRow>((from, to) => admin
    .from("marketing_campaigns")
    .select("id,name,development_id")
    .eq("organization_id", org)
    .order("id", { ascending: true })
    .range(from, to));
  let campaignsTruncated = withDev.truncated;
  if (withDev.error) {
    const basic = await fetchAllRows<CampaignRow>((from, to) => admin
      .from("marketing_campaigns")
      .select("id,name")
      .eq("organization_id", org)
      .order("id", { ascending: true })
      .range(from, to));
    campaigns = basic.rows;
    campaignsTruncated = basic.truncated;
  } else {
    campaigns = withDev.rows;
  }
  const campMap = new Map(campaigns.map((c) => [c.id, c]));

  // developments (produto) → developers (incorporador), best-effort.
  // Perf: developments (por campanha), leads e verbas são independentes entre
  // si — buscam em paralelo. Só developers depende de developments (chain).
  const devIds = [...new Set(campaigns.map((c) => c.development_id).filter(Boolean))] as string[];
  const prodMap = new Map<string, { name: string; developerId?: string | null }>();
  const devrMap = new Map<string, string>();
  const [dvs, leadsResult, budgetsResult] = await Promise.all([
    devIds.length
      ? admin.from("developments").select("id,name,developer_id").in("id", devIds).eq("organization_id", org)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; developer_id: string | null }> }),
    // leads/vendas por campanha (venda = status 'ganho') — sem recorte de data,
    // igual ao gasto acima: janela assimétrica (gasto histórico contra vendas de
    // 7 dias) faria campanha boa parecer cara, que é pior que o truncamento.
    fetchAllRows<{ campaign_id: string; status: string | null }>((from, to) => admin
      .from("leads")
      .select("campaign_id,status")
      .eq("organization_id", org)
      .not("campaign_id", "is", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
    // verba por produto
    admin.from("product_budgets").select("product,developer,weekly_budget,target_cac,active").eq("organization_id", org).eq("active", true),
  ]);
  for (const d of dvs.data ?? []) prodMap.set(d.id, { name: d.name, developerId: d.developer_id });
  const developerIds = [...new Set((dvs.data ?? []).map((d) => d.developer_id).filter(Boolean))] as string[];
  if (developerIds.length) {
    const drs = await admin.from("developers").select("id,name").in("id", developerIds).eq("organization_id", org);
    for (const dr of drs.data ?? []) devrMap.set(dr.id, dr.name);
  }
  const productOf = (campaignId: string) => {
    const c = campMap.get(campaignId);
    const dev = c?.development_id ? prodMap.get(c.development_id) : undefined;
    return { product: dev?.name ?? null, developer: dev?.developerId ? devrMap.get(dev.developerId) ?? null : null };
  };

  const leads = leadsResult.rows;

  const spendRows: SpendRow[] = (spend ?? []).map((s) => {
    const pd = productOf(s.campaign_id);
    return { campaignId: s.campaign_id, campaignName: campMap.get(s.campaign_id)?.name ?? s.campaign_id, product: pd.product, developer: pd.developer, date: s.spend_date, spend: Number(s.amount) || 0, leads: 0, sales: 0 };
  });
  const leadRows: SpendRow[] = (leads ?? []).map((l) => {
    const pd = productOf(l.campaign_id);
    return { campaignId: l.campaign_id, campaignName: campMap.get(l.campaign_id)?.name ?? l.campaign_id, product: pd.product, developer: pd.developer, spend: 0, leads: 1, sales: String(l.status).toLowerCase() === "ganho" ? 1 : 0 };
  });
  const all = [...spendRows, ...leadRows];

  // verba por produto (já buscada em paralelo acima)
  const budgets = budgetsResult.data;
  const productBudgets: ProductBudget[] = (budgets ?? []).map((b) => ({ product: b.product, developer: b.developer, weeklyBudget: Number(b.weekly_budget) || 0, targetCac: b.target_cac != null ? Number(b.target_cac) : null }));

  const byCampaignAgg = aggregate(all, "campaign");
  const budget = budgetView(productBudgets, all);
  const dbPlan = marketingEfficiencyPlan(budget, byCampaignAgg);

  // Cobertura declarada: a tela precisa poder avisar em vez de mentir por
  // omissão quando alguma dimensão bateu o teto de paginação.
  const coverage = {
    window: "histórico completo — mesmo recorte (nenhum) para gasto e para leads/vendas",
    spendTruncated: spendFetch.truncated,
    leadsTruncated: leadsResult.truncated,
    campaignsTruncated,
    complete: !spendFetch.truncated && !leadsResult.truncated && !campaignsTruncated,
  };

  return apiSuccess({
    coverage,
    totals: { spend: byCampaignAgg.reduce((s, b) => s + b.spend, 0), campaigns: campaigns.length },
    byCampaign: { aggregate: byCampaignAgg, weekly: weekly(spendRows, "campaign") },
    byProject: { aggregate: aggregate(all, "product"), weekly: weekly(spendRows, "product") },
    byDeveloper: { aggregate: aggregate(all, "developer"), weekly: weekly(spendRows, "developer") },
    budget,
    // IA de marketing (eficiência) — propostas de escalar/pausar/realocar verba
    plan: dbPlan,
    // projeção de cada movimento antes de aprovar (dado do banco = semanal)
    projection: simulatePlan(dbPlan, { campaigns: byCampaignAgg, budget, period: "7d" }),
  }, identity.meta, { headers: { ...limited.headers, ...cacheHeaders({ maxAge: 60, swr: 120 }) } });
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
