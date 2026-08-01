import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { mergeCalibration, flattenCalibration, calibrationSummary } from "@/lib/ai/calibration";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}
const isDirector = (role: string) => ["director", "superintendent"].includes(role);

// GET — calibração efetiva (defaults + overrides da organização) + trilhos.
// Liderança comercial: é o painel de como as IAs decidem.
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 40, scope: "ai-calibration" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = roleOf(identity.access);
  if (!["director", "superintendent", "manager"].includes(role)) {
    return apiError("FORBIDDEN", "Calibração das IAs pertence à liderança.", identity.meta, { status: 403 });
  }

  // overrides best-effort — sem a tabela, vale o default (honesto no source)
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_calibration").select("overrides,updated_at")
    .eq("organization_id", identity.access.organization.id).maybeSingle();
  const overrides = !error && data ? data.overrides : {};
  const { calibration, rejected } = mergeCalibration(overrides);

  return apiSuccess({
    source: error ? "defaults" : data ? "organizacao" : "defaults",
    calibration,
    params: flattenCalibration(calibration),
    summary: calibrationSummary(calibration),
    rejected, // overrides gravados que hoje seriam rejeitados (ex.: trilho mudou)
    updatedAt: !error && data ? data.updated_at : null,
  }, identity.meta, { headers: limited.headers });
}

// PUT — define overrides (só diretor). O corpo é {overrides:{grupo:{campo:num}}};
// valores fora do trilho são clampados e reportados; política travada é rejeitada.
export async function PUT(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 20, scope: "ai-calibration-set" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Calibrar as IAs é decisão do diretor.", identity.meta, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { overrides?: unknown } | null;
  if (!body || typeof body.overrides !== "object" || body.overrides == null) {
    return apiError("OVERRIDES_REQUIRED", "Informe overrides como objeto {grupo:{campo:numero}}.", identity.meta, { status: 422 });
  }
  const { calibration, rejected } = mergeCalibration(body.overrides);

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("ai_calibration").upsert({
    organization_id: identity.access.organization.id,
    overrides: body.overrides,
    updated_by: identity.access.profile.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });
  if (error) {
    return apiError("CALIBRATION_UNAVAILABLE", "Calibração indisponível até a ativação do banco (ai_calibration).", identity.meta, { status: 503 });
  }
  return apiSuccess({
    calibration,
    rejected,
    summary: calibrationSummary(calibration),
  }, identity.meta, { headers: limited.headers });
}
