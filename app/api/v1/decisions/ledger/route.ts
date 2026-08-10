import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext, resolveCommercialRole } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareScenarioObservation, scenarioMetricValue, type ScenarioDirection, type ScenarioMetric } from "@/lib/decision/scenario-validation";

const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
const clean = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const management = (role: string) => ["director", "superintendent", "manager"].includes(role);

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "decision-ledger-read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const admin = getSupabaseAdmin();
  const organizationId = access.access.organization.id;
  const [decisions, profiles] = await Promise.all([
    admin.from("atlas_decisions").select("id,decision_key,title,status,human_decision,decision_reason,responsible_id,due_at,outcome_key,outcome_notes,outcome_recorded_at,recommended_action,result,created_at").eq("organization_id", organizationId).not("human_decision", "is", null).order("updated_at", { ascending: false }).limit(100),
    admin.from("profiles").select("id,name,role,commercial_role,reports_to,active").eq("organization_id", organizationId).eq("active", true).order("name"),
  ]);
  if (decisions.error || profiles.error) return apiError("DECISION_LEDGER_UNAVAILABLE", "O livro de decisões ainda não está disponível. Aplique a atualização da Fase 55.", access.meta, { status: 503 });
  const actorRole = String(resolveCommercialRole({ role: access.access.profile.role, commercialRole: access.access.profile.commercialRole }));
  const visibleProfiles = actorRole === "director" || actorRole === "superintendent"
    ? profiles.data ?? []
    : actorRole === "manager"
      ? (profiles.data ?? []).filter((profile) => profile.id === access.access.profile.id || profile.reports_to === access.access.profile.id)
      : (profiles.data ?? []).filter((profile) => profile.id === access.access.profile.id);
  const allowedIds = new Set(visibleProfiles.map((profile) => profile.id));
  const visibleDecisions = actorRole === "director" || actorRole === "superintendent"
    ? decisions.data ?? []
    : (decisions.data ?? []).filter((decision) => decision.responsible_id === access.access.profile.id || (actorRole === "manager" && allowedIds.has(decision.responsible_id)));
  return apiSuccess({
    actor: { id: access.access.profile.id, role: actorRole },
    assignees: visibleProfiles,
    decisions: visibleDecisions.filter((decision) => !decision.responsible_id || allowedIds.has(decision.responsible_id)),
    policy: { humanDecisionRequired: true, outcomeRequiredForLearning: true, automaticCommercialAction: false },
  }, access.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "decision-ledger-write" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError("DECISION_LEDGER_INVALID", "Dados da decisão não informados.", access.meta, { status: 400 });
  const admin = getSupabaseAdmin();
  const organizationId = access.access.organization.id;
  const actorId = access.access.profile.id;
  const actorRole = String(resolveCommercialRole({ role: access.access.profile.role, commercialRole: access.access.profile.commercialRole }));

  if (body.action === "record_outcome") {
    const decisionId = uuid(body.decisionId);
    const outcomeKey = clean(body.outcomeKey, 30);
    const notes = clean(body.notes, 500);
    const decisionQualityRating = Number(body.decisionQualityRating);
    if (!decisionId || !["positive", "neutral", "negative", "not_executed"].includes(outcomeKey) || notes.length < 8 || !Number.isInteger(decisionQualityRating) || decisionQualityRating < 1 || decisionQualityRating > 5) return apiError("DECISION_OUTCOME_INVALID", "Informe o resultado, uma nota com pelo menos 8 caracteres e a qualidade da decisão entre 1 e 5.", access.meta, { status: 400 });
    const lookup = await admin.from("atlas_decisions").select("id,responsible_id,status,source_id,source_type,recommended_action").eq("id", decisionId).eq("organization_id", organizationId).maybeSingle();
    if (lookup.error || !lookup.data) return apiError("DECISION_NOT_FOUND", "Decisão não encontrada no seu escopo.", access.meta, { status: 404 });
    if (!management(actorRole) && lookup.data.responsible_id !== actorId) return apiError("DECISION_OUTCOME_FORBIDDEN", "Somente o responsável ou a liderança pode registrar o resultado.", access.meta, { status: 403 });
    const recommendedAction = lookup.data.recommended_action && typeof lookup.data.recommended_action === "object" ? lookup.data.recommended_action as Record<string, unknown> : {};
    const scenario = recommendedAction.scenario && typeof recommendedAction.scenario === "object" ? recommendedAction.scenario as Record<string, unknown> : null;
    let scenarioComparison: Record<string, unknown> | null = null;
    if (scenario) {
      const evaluationAfter = new Date(String(scenario.evaluationAfter || ""));
      if (!Number.isFinite(evaluationAfter.getTime()) || evaluationAfter.getTime() > Date.now()) return apiError("SCENARIO_WINDOW_OPEN", "O cenário ainda está dentro da janela definida para observação.", access.meta, { status: 409 });
      if (!lookup.data.source_id || !["Lead", "Follow-up"].includes(String(lookup.data.source_type))) return apiError("SCENARIO_SOURCE_INVALID", "A fonte real do cenário não está mais disponível.", access.meta, { status: 409 });
      const current = await admin.from("leads").select("id,status,score_ia,next_action,next_contact").eq("id", lookup.data.source_id).eq("organization_id", organizationId).maybeSingle();
      if (current.error || !current.data) return apiError("SCENARIO_SOURCE_UNAVAILABLE", "Não foi possível comparar o cenário com a lead real.", access.meta, { status: 409 });
      const metric = String(scenario.metric) as ScenarioMetric;
      const observedValue = scenarioMetricValue(current.data as Record<string, unknown>, metric);
      scenarioComparison = {
        metric,
        expectedDirection: scenario.expectedDirection,
        baselineValue: scenario.baselineValue ?? null,
        observedValue,
        evaluatedAt: new Date().toISOString(),
        ...compareScenarioObservation({ metric, expectedDirection: String(scenario.expectedDirection) as ScenarioDirection, baseline: scenario.baselineValue, observed: observedValue }),
      };
    }
    const result = await admin.from("atlas_decisions").update({ outcome_key: outcomeKey, outcome_notes: notes, outcome_recorded_by: actorId, outcome_recorded_at: new Date().toISOString(), status: outcomeKey === "not_executed" ? "cancelled" : "completed", executed_at: outcomeKey === "not_executed" ? null : new Date().toISOString(), result: { outcomeKey, notes, observedByHuman: true, decisionQualityRating, qualityRatedByHuman: true, scenarioComparison } }).eq("id", decisionId).eq("organization_id", organizationId).select("id,status,outcome_key,outcome_recorded_at,result").single();
    if (result.error) return apiError("DECISION_OUTCOME_SAVE_FAILED", "Não foi possível registrar o resultado observado.", access.meta, { status: 409 });
    structuredApiLog("info", "decision.outcome_recorded", request, access.meta, { decisionId, actorId, outcomeKey });
    return apiSuccess({ decision: result.data, learningClosed: true, externalActionExecuted: false }, access.meta, { headers: rate.headers });
  }

  if (body.action !== "commit") return apiError("DECISION_ACTION_INVALID", "Ação do livro de decisões inválida.", access.meta, { status: 400 });
  const humanDecision = clean(body.humanDecision, 20);
  const reason = clean(body.reason, 500);
  const responsibleId = uuid(body.responsibleId);
  const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null;
  const snapshot = (body.snapshot && typeof body.snapshot === "object" ? body.snapshot : {}) as Record<string, unknown>;
  const scenarioInput = (body.scenario && typeof body.scenario === "object" ? body.scenario : null) as Record<string, unknown> | null;
  const decisionKey = clean(body.decisionKey, 180);
  if (!["accept", "adapt", "reject"].includes(humanDecision) || reason.length < 8 || !responsibleId || !dueAt || !Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= Date.now() || decisionKey.length < 3) return apiError("DECISION_COMMIT_INVALID", "Defina decisão, justificativa, responsável e prazo futuro.", access.meta, { status: 400 });
  const responsible = await admin.from("profiles").select("id").eq("id", responsibleId).eq("organization_id", organizationId).eq("active", true).maybeSingle();
  if (responsible.error || !responsible.data) return apiError("DECISION_RESPONSIBLE_INVALID", "Responsável não pertence à organização ou está inativo.", access.meta, { status: 403 });
  if (!management(actorRole) && responsibleId !== actorId) return apiError("DECISION_ASSIGNMENT_FORBIDDEN", "Você pode assumir somente decisões próprias.", access.meta, { status: 403 });
  let scenario: Record<string, unknown> | null = null;
  if (scenarioInput) {
    const sourceId = uuid(snapshot.sourceId);
    const sourceType = clean(snapshot.type, 80);
    const assumption = clean(scenarioInput.assumption, 500);
    const expectedOutcome = clean(scenarioInput.expectedOutcome, 500);
    const metric = clean(scenarioInput.metric, 40) as ScenarioMetric;
    const expectedDirection = clean(scenarioInput.expectedDirection, 30) as ScenarioDirection;
    if (!sourceId || !["Lead", "Follow-up"].includes(sourceType) || assumption.length < 8 || expectedOutcome.length < 8 || !["lead_stage", "lead_score", "next_action_scheduled"].includes(metric) || !["increase", "maintain", "decrease", "be_present"].includes(expectedDirection)) return apiError("DECISION_SCENARIO_INVALID", "Defina uma fonte real, premissa, resultado esperado e métrica comparável.", access.meta, { status: 400 });
    const baseline = await admin.from("leads").select("id,status,score_ia,next_action,next_contact").eq("id", sourceId).eq("organization_id", organizationId).maybeSingle();
    if (baseline.error || !baseline.data) return apiError("DECISION_SCENARIO_SOURCE_NOT_FOUND", "A lead usada no cenário não pertence ao seu escopo.", access.meta, { status: 404 });
    scenario = { assumption, expectedOutcome, metric, expectedDirection, baselineValue: scenarioMetricValue(baseline.data as Record<string, unknown>, metric), baselineCapturedAt: new Date().toISOString(), evaluationAfter: dueAt.toISOString(), sourceKind: "lead", realDataConfirmed: true };
  }
  const status = humanDecision === "reject" ? "rejected" : "approved";
  const record = {
    organization_id: organizationId,
    decision_key: `human:${decisionKey}`,
    source_type: clean(snapshot.type, 80) || "operational_recommendation",
    source_id: uuid(snapshot.sourceId),
    decision_type: "supervised_recommendation",
    priority: ["low", "medium", "high", "critical"].includes(String(snapshot.priorityBand)) ? snapshot.priorityBand : "medium",
    status,
    title: clean(snapshot.title, 180) || "Decisão supervisionada",
    rationale: clean(snapshot.reason, 1000),
    recommended_action: { action: clean(snapshot.action, 500), href: clean(snapshot.href, 500), adaptedByHuman: humanDecision === "adapt", scenario },
    evidence: Array.isArray(snapshot.evidence) ? snapshot.evidence.slice(0, 10).map((item) => clean(item, 500)) : [],
    confidence: typeof snapshot.confidence === "number" && Number.isFinite(snapshot.confidence) ? Math.max(0, Math.min(100, snapshot.confidence)) : null,
    requires_approval: true,
    approved_by: humanDecision === "reject" ? null : actorId,
    approved_at: humanDecision === "reject" ? null : new Date().toISOString(),
    human_decision: humanDecision,
    decision_reason: reason,
    responsible_id: responsibleId,
    due_at: dueAt.toISOString(),
  };
  const existing = await admin.from("atlas_decisions").select("id").eq("organization_id", organizationId).eq("decision_key", record.decision_key).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) return apiError("DECISION_COMMIT_LOOKUP_FAILED", "Não foi possível verificar o livro de decisões.", access.meta, { status: 409 });
  const saved = existing.data
    ? await admin.from("atlas_decisions").update(record).eq("id", existing.data.id).eq("organization_id", organizationId).select("id,status,human_decision,responsible_id,due_at").single()
    : await admin.from("atlas_decisions").insert(record).select("id,status,human_decision,responsible_id,due_at").single();
  if (saved.error) return apiError("DECISION_COMMIT_SAVE_FAILED", "Não foi possível registrar a decisão. Confirme a migration da Fase 55.", access.meta, { status: 409 });
  structuredApiLog("info", "decision.human_commitment_recorded", request, access.meta, { decisionId: saved.data.id, actorId, responsibleId, humanDecision });
  return apiSuccess({ decision: saved.data, outcomePending: humanDecision !== "reject", automaticCommercialAction: false }, access.meta, { status: 201, headers: rate.headers });
}
