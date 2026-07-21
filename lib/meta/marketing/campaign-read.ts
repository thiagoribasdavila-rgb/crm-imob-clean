/**
 * Leitura de campanhas e gasto reais da Meta (Marketing/Insights API).
 *
 * Read-only: lista campanhas do ad account e puxa insights (gasto/impressões/
 * cliques/leads) por campanha e por semana, mapeando para o formato SpendRow do
 * relatório de custo (lib/marketing/cost-report). O mapeamento produto/
 * incorporador fica com o chamador (via nome da campanha ou tabela de mapa).
 *
 * Auto-contido: versão da Graph vem por parâmetro/env; erros voltam
 * estruturados (nunca lança o token).
 */

import type { SpendRow } from "@/lib/marketing/cost-report";

const GRAPH = "https://graph.facebook.com";

export type MetaCampaign = {
  id: string; name: string; status: string; objective: string; effectiveStatus: string;
};
export type MetaCampaignInsight = {
  campaignId: string; campaignName: string;
  spend: number; impressions: number; clicks: number; leads: number;
  dateStart: string; dateStop: string;
};
export type MetaReadError = { ok: false; code: number | string; subcode?: number | string; message: string; fbtrace?: string };

function version(v?: string): string {
  return v || process.env.META_GRAPH_API_VERSION || "v23.0";
}
function accPath(accountId: string): string {
  return `act_${String(accountId).replace(/^act_/, "")}`;
}

async function graphGet<T>(path: string, token: string, v?: string): Promise<T | MetaReadError> {
  try {
    const res = await fetch(`${GRAPH}/${version(v)}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: number; error_subcode?: number; message?: string; fbtrace_id?: string } } & T;
    if (json && json.error) {
      const e = json.error;
      return { ok: false, code: e.code ?? "?", subcode: e.error_subcode, message: String(e.message ?? "erro Meta"), fbtrace: e.fbtrace_id };
    }
    return json as T;
  } catch (err) {
    return { ok: false, code: "network", message: err instanceof Error ? err.message : String(err) };
  }
}

function isErr(x: unknown): x is MetaReadError {
  return typeof x === "object" && x !== null && (x as { ok?: boolean }).ok === false;
}

/** Lista as campanhas do ad account. */
export async function fetchCampaigns(accountId: string, token: string, v?: string): Promise<MetaCampaign[] | MetaReadError> {
  const data = await graphGet<{ data?: Array<{ id: string; name: string; status: string; objective: string; effective_status: string }> }>(
    `${accPath(accountId)}/campaigns?fields=id,name,status,objective,effective_status&limit=200`, token, v,
  );
  if (isErr(data)) return data;
  return (data.data ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status, objective: c.objective, effectiveStatus: c.effective_status }));
}

function leadsFromActions(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  return actions
    .filter((a) => String((a as { action_type?: string }).action_type ?? "").includes("lead"))
    .reduce((s, a) => s + (Number((a as { value?: unknown }).value) || 0), 0);
}

/**
 * Insights por campanha e por período (time_increment em dias — 7 = semanal).
 * Retorna uma linha por campanha × janela.
 */
export async function fetchCampaignInsights(
  accountId: string, token: string,
  opts: { datePreset?: string; timeIncrement?: number } = {}, v?: string,
): Promise<MetaCampaignInsight[] | MetaReadError> {
  const preset = opts.datePreset ?? "last_30d";
  const inc = opts.timeIncrement ?? 7;
  const data = await graphGet<{ data?: Array<Record<string, unknown>> }>(
    `${accPath(accountId)}/insights?level=campaign&fields=campaign_id,campaign_name,spend,impressions,clicks,actions&date_preset=${preset}&time_increment=${inc}&limit=500`,
    token, v,
  );
  if (isErr(data)) return data;
  return (data.data ?? []).map((r) => ({
    campaignId: String(r.campaign_id ?? ""),
    campaignName: String(r.campaign_name ?? ""),
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    leads: leadsFromActions(r.actions),
    dateStart: String(r.date_start ?? ""),
    dateStop: String(r.date_stop ?? ""),
  }));
}

/** Converte insights da Meta em SpendRow[] do relatório de custo. */
export function insightsToCostRows(
  insights: MetaCampaignInsight[],
  enrich?: (campaignId: string, campaignName: string) => { product?: string | null; developer?: string | null },
): SpendRow[] {
  return insights.map((i) => {
    const meta = enrich?.(i.campaignId, i.campaignName) ?? {};
    return {
      campaignId: i.campaignId,
      campaignName: i.campaignName,
      product: meta.product ?? null,
      developer: meta.developer ?? null,
      date: i.dateStart,
      spend: i.spend,
      leads: i.leads,
      sales: 0, // venda vem do CRM (leads.status = 'ganho'), não da Meta
    };
  });
}
