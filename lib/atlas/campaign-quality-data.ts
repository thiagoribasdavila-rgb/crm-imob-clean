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
  const [campaignQuery, leadFetch, eventFetch, spendFetch] = await Promise.all([
    admin
      .from("marketing_campaigns")
      .select("id,name,platform,status,started_at,ended_at")
      .eq("organization_id", organizationId)
      .limit(1000),
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
    fetchAllRows<CampaignQualityDiscardEvent>((from, to) =>
      admin
        .from("lead_events")
        .select("lead_id,metadata,created_at")
        .eq("organization_id", organizationId)
        .eq("event_type", "lead_discarded")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
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
      data: (campaignQuery.data ?? null) as CampaignQualityCampaign[] | null,
      error: campaignQuery.error,
    },
    leadFetch,
    eventFetch,
    spendFetch,
  };
}
