import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

const canManage = (role: string, commercialRole: string | null) =>
  role === "admin" || ["director", "superintendent"].includes(commercialRole ?? "");

const textFields = new Map([
  ["name", "name"], ["projectCode", "project_code"], ["addressLine", "address_line"],
  ["neighborhood", "neighborhood"], ["city", "city"], ["state", "state"],
  ["postalCode", "postal_code"], ["marketSegment", "market_segment"],
  ["productType", "product_type"], ["status", "status"],
  ["salesCycleStatus", "sales_cycle_status"],
]);
const numericFields = new Map([
  ["bedroomsMin", "bedrooms_min"], ["bedroomsMax", "bedrooms_max"],
  ["privateAreaMin", "private_area_min"], ["privateAreaMax", "private_area_max"],
  ["priceMin", "price_min"], ["priceMax", "price_max"], ["totalUnits", "total_units"],
]);

export async function GET(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, { limit: 90, scope: "developments.detail.read" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const { id } = await context.params;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("developments").select("*")
    .eq("id", id).eq("organization_id", identity.access.organization.id).maybeSingle();
  if (error) return apiError("DEVELOPMENT_LOOKUP_FAILED", "Não foi possível carregar o empreendimento.", identity.meta, { status: 500 });
  if (!data) return apiError("DEVELOPMENT_NOT_FOUND", "Empreendimento não encontrado.", identity.meta, { status: 404 });
  const [{ count: materials }, { count: units }] = await Promise.all([
    admin.from("project_materials").select("id", { head: true, count: "exact" }).eq("organization_id", identity.access.organization.id).eq("development_id", id),
    admin.from("properties").select("id", { head: true, count: "exact" }).eq("organization_id", identity.access.organization.id).eq("development_id", id),
  ]);
  return apiSuccess({ development: data, summary: { materials: materials ?? 0, units: units ?? 0 } }, identity.meta, { headers: rate.headers });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, { limit: 20, windowMs: 15 * 60_000, scope: "developments.detail.update" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!canManage(identity.access.profile.role, identity.access.profile.commercialRole)) {
    return apiError("FORBIDDEN", "Somente a diretoria pode alterar empreendimentos.", identity.meta, { status: 403 });
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError("INVALID_DEVELOPMENT", "Nenhuma alteração foi informada.", identity.meta, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [input, column] of textFields) if (input in body) patch[column] = String(body[input] ?? "").trim() || null;
  for (const [input, column] of numericFields) {
    if (!(input in body)) continue;
    const value = body[input] === "" || body[input] === null ? null : Number(body[input]);
    if (value !== null && !Number.isFinite(value)) return apiError("INVALID_NUMBER", `Valor inválido em ${input}.`, identity.meta, { status: 400 });
    patch[column] = value;
  }
  if ("developerId" in body) patch.developer_id = body.developerId || null;
  if ("typologies" in body) patch.typologies = Array.isArray(body.typologies) ? body.typologies.map(String).filter(Boolean) : [];
  if (Object.keys(patch).length === 1) return apiError("EMPTY_UPDATE", "Nenhum campo permitido foi informado.", identity.meta, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("developments").update(patch).eq("id", id)
    .eq("organization_id", identity.access.organization.id).select("*").maybeSingle();
  if (error) return apiError("DEVELOPMENT_UPDATE_FAILED", "Não foi possível atualizar o empreendimento.", identity.meta, { status: 409 });
  if (!data) return apiError("DEVELOPMENT_NOT_FOUND", "Empreendimento não encontrado.", identity.meta, { status: 404 });
  structuredApiLog("info", "development.updated", request, identity.meta, { developmentId: id, actorId: identity.access.profile.id, fields: Object.keys(patch) });
  return apiSuccess({ development: data }, identity.meta, { headers: rate.headers });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const rate = enforceRateLimit(request, { limit: 8, windowMs: 15 * 60_000, scope: "developments.detail.archive" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!canManage(identity.access.profile.role, identity.access.profile.commercialRole)) {
    return apiError("FORBIDDEN", "Somente a diretoria pode arquivar empreendimentos.", identity.meta, { status: 403 });
  }
  const { id } = await context.params;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("developments")
    .update({ status: "archived", sales_cycle_status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", id).eq("organization_id", identity.access.organization.id)
    .select("id,name,status,sales_cycle_status").maybeSingle();
  if (error) return apiError("DEVELOPMENT_ARCHIVE_FAILED", "Não foi possível arquivar o empreendimento.", identity.meta, { status: 409 });
  if (!data) return apiError("DEVELOPMENT_NOT_FOUND", "Empreendimento não encontrado.", identity.meta, { status: 404 });
  structuredApiLog("info", "development.archived", request, identity.meta, { developmentId: id, actorId: identity.access.profile.id });
  return apiSuccess({ development: data }, identity.meta, { headers: rate.headers });
}
