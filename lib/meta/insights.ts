import "server-only";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { metaGraphVersion, describeMetaGraphFailure } from "@/lib/meta/graph";
import { leadsDoInsight, CAMPOS_DE_INSIGHT, type AcaoDaMeta } from "@/lib/meta/resultado-de-lead";

export type MetaPaidInsight = {
  campaignId: string; campaignName: string; spend: number; impressions: number; clicks: number;
  /**
   * Leads que a Meta diz que a campanha gerou. `null` = a resposta não trouxe
   * `actions`. NUNCA zero por conveniência: zero afirma que não houve lead, e
   * essa afirmação errada é o que fazia o custo por lead dividir pelas leads que
   * CHEGARAM ao CRM — R$ 1.030 onde o real era R$ 33.
   */
  leads: number | null;
};

export type MetaInsightPeriod = 1 | 7 | 30;

function datePreset(days: MetaInsightPeriod) {
  return days === 1 ? "today" : days === 7 ? "last_7d" : "last_30d";
}

export async function fetchMetaCampaignInsights(days: MetaInsightPeriod): Promise<MetaPaidInsight[]> {
  const accountId = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  const accessToken = process.env.META_ADS_ACCESS_TOKEN;
  if (!accountId || !accessToken) return [];
  const apiVersion = metaGraphVersion();
  const params = new URLSearchParams({ level: "campaign", fields: CAMPOS_DE_INSIGHT, date_preset: datePreset(days), limit: "500" });

  // SEGUE a paginação por cursor (não trunca em 500) — este dado alimenta
  // relatórios financeiros; teto de segurança de páginas evita loop infinito.
  const rows: MetaPaidInsight[] = [];
  let url: string | null = `https://graph.facebook.com/${apiVersion}/act_${accountId}/insights?${params}`;
  const MAX_PAGES = 20;
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response = await resilientFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }, { timeoutMs: 30_000, retries: 2, operation: "Meta Insights" });
    const body = await response.json() as {
      data?: Array<{ campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string; actions?: AcaoDaMeta[] }>;
      paging?: { next?: string; cursors?: { after?: string } };
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, body));
    for (const row of body.data ?? []) {
      rows.push({ campaignId: String(row.campaign_id || ""), campaignName: String(row.campaign_name || row.campaign_id || "Campanha Meta"), spend: Number(row.spend || 0), impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0), leads: leadsDoInsight(row.actions) });
    }
    // usa paging.next (URL completa) quando presente; senão monta pelo cursor
    const after = body.paging?.cursors?.after;
    url = body.paging?.next ?? (after ? `https://graph.facebook.com/${apiVersion}/act_${accountId}/insights?${params}&after=${encodeURIComponent(after)}` : null);
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// GASTO DIA A DIA — a diferença entre olhar e registrar
// ─────────────────────────────────────────────────────────────────────────────
//
// `fetchMetaCampaignInsights` devolve o período INTEIRO somado ("gastei X em 30
// dias"). Serve para uma tela responder "como estamos agora", e as três rotas
// que a usam fazem exatamente isso.
//
// Ela não serve para nada que precise de história: não dá para saber se o CPL
// subiu, em que dia a campanha estourou, nem quanto custou a lead da terça —
// porque o número chega já somado e não é gravado em lugar nenhum.
//
// `marketing_spend.spend_date` é uma DATA, uma linha por dia. Para alimentá-la
// é preciso pedir à Meta `time_increment=1`, que quebra a resposta por dia.
// É a única diferença entre as duas funções, e é a diferença entre olhar o
// gasto e ter o gasto.
export type MetaDailyInsight = MetaPaidInsight & { date: string };

/**
 * Gasto por dia e por campanha. `time_increment=1` faz a Meta devolver uma
 * linha por dia; sem ele a resposta vem somada e a data se perde.
 *
 * Devolve `[]` quando falta conta ou token — mesma postura da função irmã: sem
 * credencial não há o que importar, e lançar aqui transformaria "integração não
 * configurada" em incidente do worker.
 */
export async function fetchMetaDailyCampaignInsights(days: MetaInsightPeriod): Promise<MetaDailyInsight[]> {
  const accountId = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  const accessToken = process.env.META_ADS_ACCESS_TOKEN;
  if (!accountId || !accessToken) return [];
  const apiVersion = metaGraphVersion();
  const params = new URLSearchParams({
    level: "campaign",
    fields: CAMPOS_DE_INSIGHT,
    date_preset: datePreset(days),
    time_increment: "1",
    limit: "500",
  });

  const rows: MetaDailyInsight[] = [];
  let url: string | null = `https://graph.facebook.com/${apiVersion}/act_${accountId}/insights?${params}`;
  // Teto maior que o da função irmã: quebrar por dia multiplica as linhas pelo
  // número de dias do período, então a mesma conta que cabia em 1 página pode
  // precisar de várias.
  const MAX_PAGES = 60;
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response = await resilientFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }, { timeoutMs: 30_000, retries: 2, operation: "Meta Insights (dia a dia)" });
    const body = await response.json() as {
      data?: Array<{ campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string; date_start?: string; actions?: AcaoDaMeta[] }>;
      paging?: { next?: string; cursors?: { after?: string } };
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, body));
    for (const row of body.data ?? []) {
      // `date_start` é o dia da linha quando time_increment=1 (date_start ===
      // date_stop). Linha sem data é descartada: gravar gasto no dia errado é
      // pior que não gravar, porque o erro fica plausível.
      const date = String(row.date_start || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      rows.push({
        date,
        campaignId: String(row.campaign_id || ""),
        campaignName: String(row.campaign_name || row.campaign_id || "Campanha Meta"),
        spend: Number(row.spend || 0),
        impressions: Number(row.impressions || 0),
        clicks: Number(row.clicks || 0),
        leads: leadsDoInsight(row.actions),
      });
    }
    const after = body.paging?.cursors?.after;
    url = body.paging?.next ?? (after ? `https://graph.facebook.com/${apiVersion}/act_${accountId}/insights?${params}&after=${encodeURIComponent(after)}` : null);
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// O ESTADO DA CAMPANHA — perguntar em vez de supor
// ─────────────────────────────────────────────────────────────────────────────
//
// `marketing_campaigns.status` só aceita ACTIVE, PAUSED, COMPLETED ou ARCHIVED
// (check constraint no banco). O importador de gasto precisa gravar um desses, e
// o endpoint de insights NÃO devolve estado de campanha — ele devolve gasto.
//
// A primeira versão deste código gravou "UNKNOWN" e o banco recusou. A recusa
// estava certa: "UNKNOWN" seria uma quarta verdade sobre o estado da campanha,
// convivendo com as três que a régua do produto conhece. A correção não é
// afrouxar a régua — é PERGUNTAR à Meta, que é quem sabe.

/** Estados que `marketing_campaigns.status` aceita. */
export type EstadoDeCampanha = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

/**
 * Traduz o estado da Meta para a régua do banco.
 *
 * A Meta tem mais de dez estados efetivos (WITH_ISSUES, PENDING_REVIEW,
 * DISAPPROVED, IN_PROCESS…). Só ACTIVE vira ACTIVE: qualquer outro significa que
 * a campanha NÃO está entregando agora, e chamar isso de ativa faria o produto
 * afirmar que há dinheiro correndo quando não há.
 *
 * O default é PAUSED, não ACTIVE — errar para o lado de "parada" faz alguém ir
 * conferir; errar para o lado de "ativa" faz todo mundo relaxar.
 *
 * Função pura.
 */
export function estadoDeCampanhaDaMeta(status: string | null | undefined): EstadoDeCampanha {
  const bruto = String(status || "").toUpperCase();
  if (bruto === "ACTIVE") return "ACTIVE";
  if (bruto === "ARCHIVED" || bruto === "DELETED") return "ARCHIVED";
  if (bruto === "COMPLETED") return "COMPLETED";
  return "PAUSED";
}

/**
 * Estado atual de cada campanha da conta, por id externo.
 *
 * Devolve mapa vazio quando falta credencial ou quando a Graph API recusa — o
 * importador trata isso como "não sei" e grava PAUSED, o default conservador.
 * Um erro aqui não pode derrubar a importação do GASTO, que é o dado que
 * ninguém mais tem.
 */
export async function fetchMetaCampaignStates(): Promise<Map<string, EstadoDeCampanha>> {
  const mapa = new Map<string, EstadoDeCampanha>();
  const accountId = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  const accessToken = process.env.META_ADS_ACCESS_TOKEN;
  if (!accountId || !accessToken) return mapa;
  const apiVersion = metaGraphVersion();
  const params = new URLSearchParams({ fields: "id,effective_status,status", limit: "500" });
  let url: string | null = `https://graph.facebook.com/${apiVersion}/act_${accountId}/campaigns?${params}`;
  const MAX_PAGES = 20;
  try {
    for (let page = 0; url && page < MAX_PAGES; page += 1) {
      const response = await resilientFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }, { timeoutMs: 30_000, retries: 1, operation: "Meta campanhas (estado)" });
      const body = await response.json() as {
        data?: Array<{ id?: string; status?: string; effective_status?: string }>;
        paging?: { next?: string };
      };
      if (!response.ok) return mapa;
      for (const row of body.data ?? []) {
        if (!row.id) continue;
        mapa.set(String(row.id), estadoDeCampanhaDaMeta(row.effective_status ?? row.status));
      }
      url = body.paging?.next ?? null;
    }
  } catch {
    // Silêncio proposital: sem estado o importador usa o default conservador. O
    // que NÃO pode acontecer é o gasto deixar de ser gravado porque uma leitura
    // acessória falhou.
    return mapa;
  }
  return mapa;
}
