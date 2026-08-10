import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { buildStageForecast } from "@/lib/analytics/stage-forecast";
import { assessForecastTrend, evaluateFrozenForecast, type FrozenOpportunity } from "@/lib/analytics/forecast-measurement";
import { canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const management = (commercialRole: string | null, role: string) => ["director", "superintendent"].includes(commercialRole || "") || role === "admin";
const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const selection = "id,snapshot_at,horizon_days,horizon_end,method,pipeline_gross,predicted_weighted,opportunity_count,value_coverage,close_date_coverage,confidence_band,opportunity_snapshot,evaluated_at,actual_won_value,actual_won_count,absolute_error,accuracy_percent,result_note,created_at";

async function context(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access;
  if (!management(access.access.profile.commercialRole, access.access.profile.role)) return { ok: false as const, response: apiError("FORBIDDEN", "Medição do forecast disponível para diretoria e superintendência.", access.meta, { status: 403 }) };
  return access;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 45, scope: "forecast.snapshots.read" });
  if (!rate.ok) return rate.response;
  const access = await context(request);
  if (!access.ok) return access.response;
  const { data, error } = await getSupabaseAdmin().from("forecast_snapshots").select(selection).eq("organization_id", access.access.organization.id).order("snapshot_at", { ascending: false }).limit(60);
  if (error) return apiError("FORECAST_MEASUREMENT_UNAVAILABLE", "Aplique a migration da Fase 56 para medir o forecast.", access.meta, { status: 503 });
  const now = Date.now();
  const snapshots = (data ?? []).map((item) => ({ ...item, status: item.evaluated_at ? "evaluated" : new Date(item.horizon_end).getTime() <= now ? "ready_to_evaluate" : "observing" }));
  const trend = assessForecastTrend(snapshots.filter((item) => item.evaluated_at));
  return apiSuccess({ snapshots, summary: { total: snapshots.length, observing: snapshots.filter((item) => item.status === "observing").length, ready: snapshots.filter((item) => item.status === "ready_to_evaluate").length, evaluated: snapshots.filter((item) => item.status === "evaluated").length }, trend, policy: { immutableSnapshot: true, sameOpportunityCohort: true, horizonRequired: true, automaticEvaluation: false, humanReviewRequired: true, movementClaimed: trend.claimAllowed } }, access.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 10, scope: "forecast.snapshots.write" });
  if (!rate.ok) return rate.response;
  const access = await context(request);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as { action?: string; horizonDays?: number; snapshotId?: string } | null;
  const action = String(body?.action || "");
  const db = getSupabaseAdmin();
  const org = access.access.organization.id;

  if (action === "capture") {
    const horizonDays = Number(body?.horizonDays || 30);
    if (![30, 60, 90].includes(horizonDays)) return apiError("HORIZON_INVALID", "Escolha 30, 60 ou 90 dias.", access.meta, { status: 422 });
    const [opportunities, settings] = await Promise.all([
      db.from("opportunities").select("id,stage,value,expected_close_at,created_at").eq("organization_id", org).limit(10000),
      db.from("pipeline_stage_settings").select("stage_key,label,probability,position,visible").eq("organization_id", org),
    ]);
    if (opportunities.error || settings.error) return apiError("FORECAST_SOURCE_UNAVAILABLE", "Não foi possível congelar o forecast atual.", access.meta, { status: 503 });
    const forecast = buildStageForecast(opportunities.data ?? [], settings.data ?? []);
    const probabilities = new Map(forecast.byStage.map((stage) => [stage.key, stage.probability]));
    const frozen: FrozenOpportunity[] = (opportunities.data ?? []).flatMap((item) => {
      const stage = canonicalPipelineStage(item.stage);
      const probability = stage ? probabilities.get(stage) : undefined;
      if (!stage || probability === undefined) return [];
      const value = Math.max(0, Number(item.value) || 0);
      return [{ id: item.id, stage, value, expectedCloseAt: item.expected_close_at, probability, predictedWeighted: Math.round(value * probability) / 100 }];
    });
    const snapshotAt = new Date();
    const horizonEnd = new Date(snapshotAt.getTime() + horizonDays * 86_400_000);
    const { data, error } = await db.from("forecast_snapshots").insert({ organization_id: org, snapshot_at: snapshotAt.toISOString(), horizon_days: horizonDays, horizon_end: horizonEnd.toISOString(), method: forecast.summary.method, pipeline_gross: forecast.summary.pipelineGross, predicted_weighted: forecast.summary.forecastWeighted, opportunity_count: forecast.summary.opportunities, value_coverage: forecast.confidence.valueCoverage, close_date_coverage: forecast.confidence.closeDateCoverage, confidence_band: forecast.confidence.band, opportunity_snapshot: frozen, created_by: access.access.profile.id }).select(selection).single();
    if (error) return apiError("FORECAST_SNAPSHOT_FAILED", "Não foi possível registrar a fotografia do forecast.", access.meta, { status: 409 });
    structuredApiLog("info", "forecast.snapshot_captured", request, access.meta, { snapshotId: data.id, horizonDays, opportunityCount: frozen.length });
    return apiSuccess({ snapshot: data, externalActionExecuted: false }, access.meta, { status: 201, headers: rate.headers });
  }

  if (action === "evaluate") {
    if (!uuid(body?.snapshotId)) return apiError("SNAPSHOT_REQUIRED", "Escolha uma fotografia válida.", access.meta, { status: 422 });
    const { data: snapshot, error } = await db.from("forecast_snapshots").select(selection).eq("organization_id", org).eq("id", body?.snapshotId).maybeSingle();
    if (error || !snapshot) return apiError("SNAPSHOT_NOT_FOUND", "Fotografia não encontrada no seu escopo.", access.meta, { status: 404 });
    if (snapshot.evaluated_at) return apiSuccess({ snapshot, alreadyEvaluated: true }, access.meta, { headers: rate.headers });
    if (new Date(snapshot.horizon_end).getTime() > Date.now()) return apiError("FORECAST_HORIZON_OPEN", "O período de observação ainda não terminou.", access.meta, { status: 409 });
    const frozen = Array.isArray(snapshot.opportunity_snapshot) ? snapshot.opportunity_snapshot as FrozenOpportunity[] : [];
    const ids = frozen.map((item) => item.id).filter(uuid);
    const observed = ids.length ? await db.from("opportunities").select("id,value,won_at").eq("organization_id", org).in("id", ids) : { data: [], error: null };
    if (observed.error) return apiError("FORECAST_RESULT_UNAVAILABLE", "Não foi possível aferir o resultado observado.", access.meta, { status: 503 });
    const result = evaluateFrozenForecast({ snapshotAt: snapshot.snapshot_at, horizonEnd: snapshot.horizon_end, predictedWeighted: Number(snapshot.predicted_weighted), frozen, observed: observed.data ?? [] });
    const note = result.direction === "above" ? "Resultado observado acima do previsto." : result.direction === "below" ? "Resultado observado abaixo do previsto." : "Resultado observado igual ao previsto.";
    const { data, error: updateError } = await db.from("forecast_snapshots").update({ evaluated_at: new Date().toISOString(), evaluated_by: access.access.profile.id, actual_won_value: result.actualWonValue, actual_won_count: result.actualWonCount, absolute_error: result.absoluteError, accuracy_percent: result.accuracyPercent, result_note: note, updated_at: new Date().toISOString() }).eq("organization_id", org).eq("id", snapshot.id).is("evaluated_at", null).select(selection).maybeSingle();
    if (updateError || !data) return apiError("FORECAST_EVALUATION_CONFLICT", "A fotografia já foi aferida ou não pôde ser atualizada.", access.meta, { status: 409 });
    structuredApiLog("info", "forecast.snapshot_evaluated", request, access.meta, { snapshotId: snapshot.id, actualWonCount: result.actualWonCount, accuracyPercent: result.accuracyPercent });
    return apiSuccess({ snapshot: data, result, externalActionExecuted: false }, access.meta, { headers: rate.headers });
  }
  return apiError("INVALID_ACTION", "Use capture ou evaluate.", access.meta, { status: 422 });
}
