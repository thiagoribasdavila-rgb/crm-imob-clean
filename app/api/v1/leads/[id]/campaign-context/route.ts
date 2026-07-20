import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  CAMPAIGN_QUALITY_GRADE_RULE,
  CAMPAIGN_QUALITY_MINIMUM_LEADS,
  CAMPAIGN_QUALITY_QUALIFIED_SCORE,
  buildCampaignQuality,
  type CampaignQualityCampaign,
  type CampaignQualityDiscardEvent,
  type CampaignQualityLead,
  type CampaignQualitySpendRow,
} from "@/lib/atlas/campaign-quality";
import { DISCARD_TAXONOMY_VERSION } from "@/lib/atlas/discard-reasons";
import { logger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/v1/leads/[id]/campaign-context
//
// Contexto de campanha para o CORRETOR durante a qualificação: de qual
// campanha a lead veio e a qualidade agregada dela (taxa de qualificação,
// score médio, descartes com principal motivo, custo quando houver).
// APRESENTAÇÃO apenas — zero efeito na lógica de qualificação/score.
//
// Autorização: sem restrição de roles — a visibilidade da LEAD é decidida
// pela RLS (access.supabase), mesmo padrão da conversational-qualification.
// Confirmada a lead no escopo do usuário, o agregado da campanha é lido com
// o admin client SEMPRE com tenant scoping explícito (eq organization_id).
//
// Janela: lifetime da campanha (sem ?days) — o corretor precisa do retrato
// consolidado da origem, não de um recorte; sampleSufficient continua
// aplicando o gate de 30 leads antes de exibir a nota.
//
// Shape da resposta (payload do apiSuccess):
// {
//   lead: { id, campaignId },
//   campaignContext: CampaignQualityRow | null,  // ver lib/atlas/campaign-quality.ts
//   policy: {
//     presentationOnly: true,          // não altera qualificação nem score
//     minimumLeadsForDecision: 30,
//     qualifiedDefinition,
//     qualityGradeRule,
//     taxonomyVersion
//   },
//   generatedAt
// }
// campaignContext é null quando a lead não tem campaign_id ou a campanha
// não existe mais na organização.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    scope: "lead.campaign-context",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const { id } = await params;
  const { data: lead } = await identity.supabase
    .from("leads")
    .select("id,campaign_id")
    .eq("id", id)
    .maybeSingle();
  if (!lead) {
    return apiError("LEAD_NOT_FOUND", "Lead fora do seu escopo.", identity.meta, { status: 404 });
  }

  const organizationId = identity.access.organization.id;
  const campaignId = typeof lead.campaign_id === "string" && lead.campaign_id ? lead.campaign_id : null;
  const basePolicy = {
    presentationOnly: true,
    minimumLeadsForDecision: CAMPAIGN_QUALITY_MINIMUM_LEADS,
    qualifiedDefinition: `score_ia >= ${CAMPAIGN_QUALITY_QUALIFIED_SCORE} || temperature === "quente"`,
    qualityGradeRule: CAMPAIGN_QUALITY_GRADE_RULE,
    taxonomyVersion: DISCARD_TAXONOMY_VERSION,
  };
  if (!campaignId) {
    return apiSuccess(
      {
        lead: { id: String(lead.id), campaignId: null },
        campaignContext: null,
        policy: basePolicy,
        generatedAt: new Date().toISOString(),
      },
      identity.meta,
      { headers: { ...rate.headers, "Cache-Control": "no-store" } },
    );
  }

  // Tenant scoping explícito (eq organization_id) em TODAS as queries.
  const admin = getSupabaseAdmin();
  const [campaignResult, leadResult, eventResult, spendResult] = await Promise.all([
    admin
      .from("marketing_campaigns")
      .select("id,name,platform,status")
      .eq("organization_id", organizationId)
      .eq("id", campaignId)
      .maybeSingle(),
    admin
      .from("leads")
      .select("id,campaign_id,status,score_ia,temperature")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .limit(20000),
    admin
      .from("lead_events")
      .select("lead_id,metadata")
      .eq("organization_id", organizationId)
      .eq("event_type", "lead_discarded")
      .limit(2000),
    admin
      .from("marketing_spend")
      .select("campaign_id,amount")
      .eq("organization_id", organizationId)
      .eq("campaign_id", campaignId)
      .limit(5000),
  ]);

  if (campaignResult.error || leadResult.error) {
    logger.warn("lead.campaign_context.read_failed", {
      organizationId,
      leadId: id,
      campaignCode: campaignResult.error?.code,
      leadCode: leadResult.error?.code,
    });
    return apiError(
      "CAMPAIGN_CONTEXT_LOAD_FAILED",
      "O contexto da campanha está temporariamente indisponível.",
      identity.meta,
      { status: 503 },
    );
  }
  if (eventResult.error || spendResult.error) {
    // Degradação graciosa: o card do corretor continua útil sem descartes/custo.
    logger.warn("lead.campaign_context.enrichment_degraded", {
      organizationId,
      leadId: id,
      eventCode: eventResult.error?.code,
      spendCode: spendResult.error?.code,
    });
  }

  const campaign = campaignResult.data as CampaignQualityCampaign | null;
  if (!campaign) {
    return apiSuccess(
      {
        lead: { id: String(lead.id), campaignId },
        campaignContext: null,
        policy: basePolicy,
        generatedAt: new Date().toISOString(),
      },
      identity.meta,
      { headers: { ...rate.headers, "Cache-Control": "no-store" } },
    );
  }

  const { ranking } = buildCampaignQuality({
    campaigns: [campaign],
    leads: (leadResult.data ?? []) as CampaignQualityLead[],
    discardEvents: eventResult.error
      ? []
      : ((eventResult.data ?? []) as CampaignQualityDiscardEvent[]),
    spendRows: spendResult.error
      ? []
      : ((spendResult.data ?? []) as CampaignQualitySpendRow[]),
  });

  return apiSuccess(
    {
      lead: { id: String(lead.id), campaignId },
      campaignContext: ranking[0] ?? null,
      policy: basePolicy,
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
