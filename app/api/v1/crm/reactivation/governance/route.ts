import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { evaluateReactivationPlan, type Quality } from "@/lib/commercial/consented-reactivation-policy";

type GovernedBatch = {
  id: string;
  name: string;
  status: string;
  quality_status: string;
  queued_count: number;
  delivered_count: number;
  replied_count: number;
  failed_count: number;
  eligible_count: number;
  paused_reason: string | null;
  stopRequired: boolean;
};

function decisionForBatch(batch: GovernedBatch) {
  if (batch.stopRequired) return { severity: "critical", title: `Pausar ${batch.name}`, evidence: `${batch.failed_count} falhas e qualidade ${batch.quality_status}.`, nextAction: "Revisar qualidade e falhas antes de qualquer novo envio." };
  if (batch.replied_count > 0) return { severity: "opportunity", title: `Entregar respostas de ${batch.name}`, evidence: `${batch.replied_count} resposta(s) aguardam decisão humana.`, nextAction: "Revisar conversas e confirmar o corretor responsável." };
  if (batch.eligible_count > batch.queued_count) return { severity: "attention", title: `Revisar elegíveis de ${batch.name}`, evidence: `${batch.eligible_count - batch.queued_count} contato(s) ainda não foram aprovados para a fila.`, nextAction: "Validar consentimento, duplicidade, opt-out e qualidade do número." };
  return null;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "reactivation.governance.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const { data, error } = await access.supabase
    .from("lead_reactivation_batches")
    .select("id,name,owner_id,status,source_type,consent_basis,quality_status,daily_cap,interval_seconds,send_window_start,send_window_end,maximum_attempts,cooling_off_hours,stop_on_reply,stop_on_opt_out,official_api_only,imported_count,eligible_count,queued_count,delivered_count,read_count,replied_count,failed_count,paused_reason,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return apiError("REACTIVATION_GOVERNANCE_UNAVAILABLE", "A central de reativação ainda não está disponível neste ambiente.", access.meta, { status: 503 });

  const batches = (data ?? []).map((batch) => ({
    ...batch,
    deliveryRate: batch.queued_count ? Math.round((batch.delivered_count / batch.queued_count) * 100) : 0,
    replyRate: batch.delivered_count ? Math.round((batch.replied_count / batch.delivered_count) * 100) : 0,
    stopRequired: batch.quality_status === "red" || batch.failed_count > Math.max(5, batch.queued_count * 0.1),
  }));
  const decisionQueue = batches.flatMap((batch) => {
    const decision = decisionForBatch(batch);
    return decision ? [{ ...decision, batchId: batch.id }] : [];
  }).slice(0, 3);

  return apiSuccess({
    batches,
    decisionQueue,
    summary: {
      batches: batches.length,
      running: batches.filter((batch) => ["queued", "running"].includes(batch.status)).length,
      paused: batches.filter((batch) => Boolean(batch.paused_reason) || batch.quality_status === "red").length,
      replies: batches.reduce((total, batch) => total + batch.replied_count, 0),
    },
    policy: { officialApiOnly: true, approvedTemplateOnly: true, documentedConsent: true, stopOnReply: true, stopOnOptOut: true, stopOnInvalidPhone: true, maximumAttempts: 2, coolingOffHours: 72, brokerChoiceOnBadExperience: true, humanApproval: true },
  }, access.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 20, scope: "reactivation.governance.simulate" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as { quality?: Quality; dailyCap?: number; intervalSeconds?: number; consent?: boolean; template?: boolean; contacts?: number; officialApi?: boolean } | null;
  if (!body) return apiError("PLAN_INVALID", "Informe o plano.", access.meta, { status: 400 });
  const plan = evaluateReactivationPlan({ quality: body.quality || "unknown", requestedDailyCap: Number(body.dailyCap || 100), requestedIntervalSeconds: Number(body.intervalSeconds || 30), consentBasis: body.consent ? "simulated-consent" : null, approvedTemplate: Boolean(body.template), eligibleContacts: Number(body.contacts || 0), officialApiReady: Boolean(body.officialApi) });
  return apiSuccess({ plan, simulationOnly: true, noMessagesCreated: true, noExternalAction: true }, access.meta, { headers: rate.headers });
}
