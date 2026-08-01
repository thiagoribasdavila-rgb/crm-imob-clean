import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { queueMetaConversion, queueMetaStageConversion } from "@/lib/meta/conversions";
import { extractFollowUpSignals } from "@/lib/atlas/follow-up-intelligence";

const STAGE_RANK: Record<string, number> = { novo: 0, contato: 1, qualificacao: 2, visita: 3, proposta: 4, contrato: 5, ganho: 6 };

export async function recordFunnelLearning(input: { organizationId: string; leadId: string; previousStage: string; stage: string; occurredAt: string; description?: string }) {
  const previousStage = input.previousStage.trim().toLowerCase();
  const stage = input.stage.trim().toLowerCase();
  if (previousStage === stage) return { recorded: false, reason: "unchanged" };
  const previousRank = STAGE_RANK[previousStage] ?? -1;
  const stageRank = STAGE_RANK[stage] ?? -1;
  const buyerElsewhere = stage === "comprou_outro";
  const direction = buyerElsewhere ? "buyer_elsewhere" : stage === "perdido" ? "lost" : stageRank > previousRank ? "forward" : "backward";
  const followUpSignals = buyerElsewhere ? extractFollowUpSignals(input.description || "", { externalPurchase: true }) : null;
  const admin = getSupabaseAdmin();
  const externalEventId = `funnel-${input.leadId}-${previousStage}-${stage}`;
  const { error } = await admin.from("campaign_events").upsert({
    organization_id: input.organizationId,
    lead_id: input.leadId,
    event_type: buyerElsewhere ? "buyer_profile_external_purchase" : stage === "perdido" ? "lead_lost" : "lead_stage_progression",
    source: "crm-funnel",
    external_event_id: externalEventId,
    payload: { previous_stage: previousStage, stage, direction, stage_rank: stageRank, ...(followUpSignals || {}) },
    occurred_at: input.occurredAt,
  }, { onConflict: "organization_id,source,external_event_id", ignoreDuplicates: true });
  if (error) throw error;
  const meta = buyerElsewhere
    ? await queueMetaConversion({ organizationId: input.organizationId, leadId: input.leadId, eventName: "BuyerProfile", eventId: `buyer-profile-${input.leadId}`, occurredAt: input.occurredAt, customData: followUpSignals || {} })
    : direction === "forward"
      ? await queueMetaStageConversion({ organizationId: input.organizationId, leadId: input.leadId, previousStage, stage, occurredAt: input.occurredAt })
      : { queued: false, reason: direction === "lost" ? "negative_signal_internal_only" : "regression_internal_only" };
  return { recorded: true, direction, meta };
}
