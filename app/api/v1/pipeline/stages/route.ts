import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit } from "@/lib/api/security";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canonicalPipelineStage, mergePipelineStageSettings } from "@/lib/atlas/pipeline-stages";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "pipeline.stages.read" });
  if (!rate.ok) return rate.response;
  try {
    const identity = await requireApiIdentity(request);
    const { data } = await identity.supabase.from("pipeline_stage_settings").select("stage_key,label,probability,position,visible").eq("organization_id", identity.organizationId);
    return NextResponse.json({ stages: mergePipelineStageSettings(data ?? []), fallback: !data?.length }, { headers: rate.headers });
  } catch { return NextResponse.json({ error: "Falha ao carregar etapas." }, { status: 401, headers: rate.headers }); }
}

export async function PUT(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 10, windowMs: 60_000, scope: "pipeline.stages.write" });
  if (!rate.ok) return rate.response;
  try {
    const identity = await requireApiIdentity(request);
    const role = identity.commercialRole || identity.role;
    if (!new Set(["admin", "director", "superintendent"]).has(String(role || ""))) return NextResponse.json({ error: "Somente a liderança estratégica pode configurar etapas." }, { status: 403 });
    const body = await request.json().catch(() => null) as { stages?: Array<{ key?: string; label?: string; probability?: number; position?: number; visible?: boolean }> } | null;
    if (!Array.isArray(body?.stages) || !body.stages.length || body.stages.length > 9) return NextResponse.json({ error: "Envie de uma a nove etapas válidas." }, { status: 400 });
    const rows = body.stages.map((stage) => ({ organization_id: identity.organizationId, stage_key: canonicalPipelineStage(stage.key), label: String(stage.label || "").trim().slice(0, 40), probability: Math.round(Number(stage.probability)), position: Math.round(Number(stage.position)), visible: stage.visible !== false, updated_by: identity.userId, updated_at: new Date().toISOString() }));
    if (rows.some((row) => !row.stage_key || !row.label || !Number.isFinite(row.probability) || row.probability < 0 || row.probability > 100 || !Number.isFinite(row.position) || row.position < 1 || row.position > 999)) return NextResponse.json({ error: "Configuração de etapa inválida." }, { status: 400 });
    const { error } = await getSupabaseAdmin().from("pipeline_stage_settings").upsert(rows, { onConflict: "organization_id,stage_key" });
    if (error) return NextResponse.json({ error: "Não foi possível salvar as etapas." }, { status: 500 });
    return NextResponse.json({ stages: mergePipelineStageSettings(rows.map((row) => ({ ...row, stage_key: row.stage_key! }))), updated: rows.length }, { headers: rate.headers });
  } catch { return NextResponse.json({ error: "Falha ao configurar etapas." }, { status: 400, headers: rate.headers }); }
}
