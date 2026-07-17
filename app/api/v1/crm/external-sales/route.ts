import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function isDirector(role: string, commercialRole: string | null) { return role === "admin" || commercialRole === "director"; }

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "external-sales-read" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity.access.profile.role, identity.access.profile.commercialRole)) return apiError("FORBIDDEN", "Visão exclusiva da diretoria.", identity.meta, { status: 403 });
  const admin = getSupabaseAdmin();
  const org = identity.access.organization.id;
  const [records, leads, profiles] = await Promise.all([
    admin.from("external_sales_records").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(1000),
    admin.from("leads").select("id,name,phone,source,status,created_at").eq("organization_id", org).eq("status", "comprou_outro").limit(1000),
    admin.from("profiles").select("id,full_name").eq("organization_id", org).limit(500),
  ]);
  const error = records.error || leads.error || profiles.error;
  if (error) return apiError("EXTERNAL_SALES_FAILED", "Não foi possível carregar vendas externas.", identity.meta, { status: 500, details: error.message });
  return apiSuccess({ records: records.data ?? [], leads: leads.data ?? [], profiles: profiles.data ?? [] }, identity.meta, { headers: rate.headers });
}

export async function PATCH(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "external-sales-review" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity.access.profile.role, identity.access.profile.commercialRole)) return apiError("FORBIDDEN", "Somente a diretoria pode validar vendas externas.", identity.meta, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: string; externalCompany?: string; externalProject?: string; estimatedValue?: number | null; purchaseDate?: string | null; evidenceStatus?: string; directorNotes?: string } | null;
  if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return apiError("INVALID_RECORD", "Registro inválido.", identity.meta, { status: 400 });
  const statuses = new Set(["declared", "reviewing", "verified", "discarded"]);
  if (body.evidenceStatus && !statuses.has(body.evidenceStatus)) return apiError("INVALID_STATUS", "Situação de evidência inválida.", identity.meta, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from("external_sales_records").update({ external_company: String(body.externalCompany || "").trim().slice(0, 160) || null, external_project: String(body.externalProject || "").trim().slice(0, 160) || null, estimated_value: Number.isFinite(Number(body.estimatedValue)) ? Number(body.estimatedValue) : null, purchase_date: body.purchaseDate || null, evidence_status: body.evidenceStatus || "reviewing", director_notes: String(body.directorNotes || "").trim().slice(0, 2000) || null, reviewed_by: identity.access.profile.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", body.id).eq("organization_id", identity.access.organization.id).select("*").single();
  if (error) return apiError("EXTERNAL_SALE_UPDATE_FAILED", "Não foi possível revisar o registro.", identity.meta, { status: 400, details: error.message });
  return apiSuccess({ record: data }, identity.meta, { headers: rate.headers });
}
