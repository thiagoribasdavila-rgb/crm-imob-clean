import "server-only";
import {
  type CampaignQualityCampaign,
  type CampaignQualityDiscardEvent,
  type CampaignQualityLead,
  type CampaignQualitySpendRow,
} from "@/lib/atlas/campaign-quality";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows, type PagedRows } from "@/lib/supabase/fetch-all-rows";

// Loader compartilhado das fontes de qualidade por campanha — extraído de
// /api/v1/analytics/campaign-quality SEM alterar as queries, para que o
// conselheiro Andromeda (/api/v1/ai/andromeda-advisor) reuse exatamente a
// mesma leitura em vez de duplicá-la.
//
// Só tabelas vivas: marketing_campaigns, leads, lead_events
// (event_type=lead_discarded) e marketing_spend. Tenant scoping explícito
// (eq organization_id) em TODAS as queries. Paginação exaustiva via
// fetchAllRows (lição F1: .limit() > 1000 é cortado em silêncio pelo
// PostgREST e o agregado sairia calculado sobre uma amostra sem aviso).
//
// Cada dimensão devolve erro e flag de truncamento separadamente para o
// chamador decidir 503 vs degradação graciosa (marketing_spend ausente não
// derruba o relatório — spend/CPL ficam zerados/nulos).

export type CampaignQualitySource = {
  campaignResult: {
    data: CampaignQualityCampaign[] | null;
    error: { code?: string; message?: string } | null;
    truncated: boolean;
  };
  leadFetch: PagedRows<CampaignQualityLead>;
  eventFetch: PagedRows<CampaignQualityDiscardEvent>;
  spendFetch: PagedRows<CampaignQualitySpendRow>;
};

export async function fetchCampaignQualitySource(input: {
  organizationId: string;
  since: string; // ISO — leads.created_at / lead_events.created_at / marketing_spend.spend_date
}): Promise<CampaignQualitySource> {
  const { organizationId, since } = input;
  const admin = getSupabaseAdmin();
  const [campaignFetch, leadFetch, eventFetch, spendFetch] = await Promise.all([
    // Paginado como as três irmãs abaixo. Era .limit(1000) sem paginação:
    // inofensivo enquanto marketing_campaigns tinha 0 linha, letal depois do
    // auto-registro (uma linha por campanha Meta já vista, para sempre). Passando
    // de 1000 o PostgREST corta SEM erro, o bucket da campanha cortada deixa de
    // existir e o `if (!bucket) continue` do buildCampaignQuality DESCARTA todos
    // os leads e vendas dela — o defeito que esta entrega existe para consertar,
    // ressuscitado em silêncio.
    fetchAllRows<CampaignQualityCampaign>((from, to) =>
      admin
        .from("marketing_campaigns")
        .select("id,name,platform,status,started_at,ended_at")
        .eq("organization_id", organizationId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<CampaignQualityLead>((from, to) =>
      admin
        .from("leads")
        .select("id,campaign_id,status,score_ia,temperature,created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    /**
     * ── O DESCARTE VINHA DA TABELA MORTA (corrigido em 02/08/2026) ───────────
     *
     * Esta leitura pedia `lead_events` com `event_type='lead_discarded'`.
     * Medido no banco de produção na mesma hora em que isto foi escrito:
     *
     *   lead_events com 'lead_discarded' ........ 0 linhas
     *   lead_events, qualquer tipo .............. 106
     *   pipeline_stage_moves para 'perdido' ..... 412  (273 com motivo)
     *   leads em status 'perdido' ............... 419  =  85,5% da base
     *
     * Com zero eventos, o painel imprimia DESCARTE 0% — e o limiar de vermelho
     * é 25%. O erro apontava na direção "está tudo bem", que é a pior: um painel
     * que exagera o problema é revisto; um que o esconde é obedecido.
     *
     * `pipeline_stage_moves` é a fonte canônica de movimentação neste
     * repositório, e o critério é a TRANSAÇÃO — a lead atravessou para
     * `perdido` — não o efeito colateral. `lead_events` e `pipeline_history`
     * estão mortas para este fim, e continuam existindo: é isso que torna o
     * erro fácil de repetir.
     *
     * O consumidor lê `metadata.reasonKey` e `metadata.campaignId`. O razão
     * guarda o motivo em coluna própria, então o mapeamento acontece aqui, na
     * borda, em vez de espalhar o formato novo por `campaign-quality.ts`.
     * `campaignId` continua resolvendo pelo recuo que já existia: join em
     * `leads.campaign_id`.
     */
    fetchAllRows<CampaignQualityDiscardEvent>(async (from, to) => {
      const r = await admin
        .from("pipeline_stage_moves")
        .select("lead_id,discard_reason_key,occurred_at")
        .eq("organization_id", organizationId)
        .eq("to_stage", "perdido")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (r.error) return r;
      const linhas = (r.data ?? []).map((m) => ({
        lead_id: (m as { lead_id?: string | null }).lead_id ?? null,
        metadata: { reasonKey: (m as { discard_reason_key?: string | null }).discard_reason_key ?? null },
      }));
      return { ...r, data: linhas };
    }),
    fetchAllRows<CampaignQualitySpendRow>((from, to) =>
      admin
        .from("marketing_spend")
        .select("campaign_id,spend_date,amount")
        .eq("organization_id", organizationId)
        .gte("spend_date", since.slice(0, 10))
        .order("spend_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  return {
    campaignResult: {
      data: campaignFetch.error ? null : campaignFetch.rows,
      error: campaignFetch.error,
      truncated: campaignFetch.truncated,
    },
    leadFetch,
    eventFetch,
    spendFetch,
  };
}
