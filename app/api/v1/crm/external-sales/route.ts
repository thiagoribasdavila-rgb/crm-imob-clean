import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isMissingColumn, isMissingRelation, mapLegacyLead, mapLegacyProfile } from "@/lib/compat/legacy-v2";

function isDirector(role: string, commercialRole: string | null) { return role === "admin" || commercialRole === "director"; }
function resolvedRole(role: string, commercialRole: string | null) { return commercialRole || (role === "admin" ? "director" : role); }

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "external-sales-read" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = resolvedRole(identity.access.profile.role, identity.access.profile.commercialRole);
  if (!["director","superintendent","manager"].includes(role)) return apiError("FORBIDDEN", "Controle disponível para a liderança comercial.", identity.meta, { status: 403 });
  const admin = getSupabaseAdmin();
  const org = identity.access.organization.id;
  const [records, leads, initialProfiles, initialCandidates] = await Promise.all([
    admin.from("external_sales_records").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(1000),
    admin.from("leads").select("id,name,phone,source,status,created_at").eq("organization_id", org).eq("status", "comprou_outro").limit(1000),
    admin.from("profiles").select("id,full_name").eq("organization_id", org).limit(500),
    admin.from("leads").select("id,name,assigned_to,status").eq("organization_id", org).not("assigned_to","is",null).limit(2000),
  ]);
  let profiles = initialProfiles;
  let candidates = initialCandidates;
  const missingRecordsTable = records.error && isMissingRelation(records.error);
  if (profiles.error && isMissingColumn(profiles.error)) profiles = await admin.from("profiles").select("*").eq("organization_id", org).limit(500);
  if (candidates.error && isMissingColumn(candidates.error)) candidates = await admin.from("leads").select("*").eq("organization_id", org).limit(2000);
  const error = (missingRecordsTable ? null : records.error) || leads.error || profiles.error || candidates.error;
  if (error) return apiError("EXTERNAL_SALES_FAILED", "Não foi possível carregar vendas externas.", identity.meta, { status: 500, details: error.message });
  const directBrokerIds = role === "manager" ? new Set((await admin.from("profiles").select("id").eq("organization_id",org).eq("reports_to",identity.access.profile.id).eq("active",true)).data?.map((item)=>item.id) ?? []) : null;
  const visibleRecords = (missingRecordsTable ? [] : records.data ?? []).filter((item)=>!directBrokerIds || (item.broker_id && directBrokerIds.has(item.broker_id))).map((item)=>isDirector(identity.access.profile.role,identity.access.profile.commercialRole)?item:{...item,estimated_value:null,director_notes:null,reviewed_by:null});
  const compatibleProfiles = (profiles.data ?? []).map((item) => mapLegacyProfile(item));
  const compatibleCandidates = (candidates.data ?? []).map((item) => mapLegacyLead(item));
  return apiSuccess({ viewer:{role,canReviewFinancial:isDirector(identity.access.profile.role,identity.access.profile.commercialRole)}, records: visibleRecords, leads: (leads.data ?? []).filter((item)=>!directBrokerIds || visibleRecords.some((record)=>record.lead_id===item.id)), profiles: compatibleProfiles, candidates:compatibleCandidates.filter((item)=>!directBrokerIds||directBrokerIds.has(String(item.assigned_to||""))).filter((item)=>!["ganho","comprou_outro"].includes(String(item.status))) }, identity.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate=enforceRateLimit(request,{limit:20,scope:"external-buyer-register"}); if(!rate.ok)return rate.response;
  const identity=await requireAccessContext(request); if(!identity.ok)return identity.response;
  const role=resolvedRole(identity.access.profile.role,identity.access.profile.commercialRole); if(!["director","superintendent","manager"].includes(role))return apiError("FORBIDDEN","Registro disponível para a liderança.",identity.meta,{status:403});
  const body=await request.json().catch(()=>null) as {leadId?:string;reason?:string;externalCompany?:string;externalProject?:string}|null;
  if(!body?.leadId||String(body.reason||"").trim().length<10)return apiError("INVALID_RECORD","Selecione a lead e descreva o motivo com ao menos 10 caracteres.",identity.meta,{status:400});
  const {data,error}=await getSupabaseAdmin().rpc("register_external_buyer_profile",{p_actor_id:identity.access.profile.id,p_organization_id:identity.access.organization.id,p_lead_id:body.leadId,p_reason:String(body.reason).trim(),p_external_company:String(body.externalCompany||"").trim(),p_external_project:String(body.externalProject||"").trim()});
  if(error)return apiError("EXTERNAL_BUYER_REGISTRATION_FAILED","Lead fora do seu time ou registro inválido.",identity.meta,{status:409});
  return apiSuccess(data,identity.meta,{status:201,headers:rate.headers});
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
