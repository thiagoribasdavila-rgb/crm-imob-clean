import { type NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const canManage = (commercialRole: string | null, role: string) => commercialRole === "director" || commercialRole === "superintendent" || role === "admin";
const optionalNumber = (value: unknown) => value === "" || value === null || value === undefined ? null : Number(value);
const optionalDate = (value: unknown) => value ? String(value) : null;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "developments.registry.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManage(access.access.profile.commercialRole, access.access.profile.role)) return apiError("FORBIDDEN", "Cadastro completo disponível para diretoria e superintendência.", access.meta, { status: 403 });
  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();
  const [developments, developers, events] = await Promise.all([
    admin.from("developments").select("id,developer_id,developer_name,name,project_code,slug,address_line,neighborhood,city,state,postal_code,latitude,longitude,market_segment,product_type,typologies,bedrooms_min,bedrooms_max,private_area_min,private_area_max,price_min,price_max,total_units,status,sales_cycle_status,launch_date,sales_start_date,sales_end_date,delivery_date,created_at,updated_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    admin.from("developers").select("id,trade_name,status").eq("organization_id", organizationId).in("status", ["active", "onboarding"]).order("trade_name"),
    admin.from("development_profile_events").select("id,development_id,actor_id,event_type,changed_fields,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (developments.error) return apiError("DEVELOPMENT_REGISTRY_UNAVAILABLE", "Aplique a migration da Fase 62.", access.meta, { status: 503 });
  const rows = developments.data ?? [];
  return apiSuccess({
    developments: rows,
    developers: developers.data ?? [],
    events: events.data ?? [],
    summary: { total: rows.length, inSales: rows.filter((item) => item.sales_cycle_status === "sales").length, incomplete: rows.filter((item) => !item.developer_id || !item.project_code || !item.city || !item.product_type).length },
    policy: { completeRegistry: true, canonicalDeveloper: true, tenantIsolated: true, auditable: true },
  }, access.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 20, scope: "developments.registry.write" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManage(access.access.profile.commercialRole, access.access.profile.role)) return apiError("FORBIDDEN", "Perfil sem permissão para alterar empreendimentos.", access.meta, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return apiError("INVALID_DEVELOPMENT", "Dados do empreendimento não informados.", access.meta, { status: 400 });
  const { data, error } = await getSupabaseAdmin().rpc("upsert_complete_development", {
    p_actor_id: access.access.profile.id, p_organization_id: access.access.organization.id, p_development_id: body.id || null,
    p_developer_id: body.developerId || null, p_name: String(body.name || ""), p_project_code: String(body.projectCode || ""),
    p_address_line: String(body.addressLine || ""), p_neighborhood: String(body.neighborhood || ""), p_city: String(body.city || ""), p_state: String(body.state || ""), p_postal_code: String(body.postalCode || ""),
    p_latitude: optionalNumber(body.latitude), p_longitude: optionalNumber(body.longitude), p_market_segment: String(body.marketSegment || ""), p_product_type: String(body.productType || ""),
    p_typologies: Array.isArray(body.typologies) ? body.typologies.map(String).filter(Boolean) : String(body.typologies || "").split(",").map((item) => item.trim()).filter(Boolean),
    p_bedrooms_min: optionalNumber(body.bedroomsMin), p_bedrooms_max: optionalNumber(body.bedroomsMax), p_private_area_min: optionalNumber(body.privateAreaMin), p_private_area_max: optionalNumber(body.privateAreaMax),
    p_price_min: optionalNumber(body.priceMin), p_price_max: optionalNumber(body.priceMax), p_total_units: optionalNumber(body.totalUnits), p_status: String(body.status || "active"), p_sales_cycle_status: String(body.salesCycleStatus || "planning"),
    p_launch_date: optionalDate(body.launchDate), p_sales_start_date: optionalDate(body.salesStartDate), p_sales_end_date: optionalDate(body.salesEndDate), p_delivery_date: optionalDate(body.deliveryDate),
  });
  if (error) return apiError("DEVELOPMENT_SAVE_REJECTED", error.message, access.meta, { status: 409 });
  structuredApiLog("info", "developments.profile_saved", request, access.meta, { actorId: access.access.profile.id, developmentId: data?.development?.id });
  return apiSuccess(data, access.meta, { status: body.id ? 200 : 201, headers: rate.headers });
}
