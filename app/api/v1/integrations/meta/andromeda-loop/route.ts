import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateAndromedaLearning } from "@/lib/meta/andromeda-learning-loop";

export const dynamic = "force-dynamic";
const managementRoles = ["director", "superintendent"];
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function collectEvidence(organizationId: string) {
  const admin = getSupabaseAdmin(); const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: leads, error: leadError }, { data: events, error: eventError }, { data: touches, error: touchError }] = await Promise.all([
    admin.from("leads").select("id,email,phone,metadata").eq("organization_id", organizationId).eq("source", "Meta Lead Ads").gte("created_at", since).limit(10000),
    admin.from("meta_conversion_events").select("lead_id,event_name,status,delivered_at,created_at").eq("organization_id", organizationId).gte("created_at", since).limit(20000),
    admin.from("lead_attribution_touches").select("lead_id").eq("organization_id", organizationId).gte("occurred_at", since).limit(20000),
  ]);
  if (leadError || eventError || touchError) throw new Error("andromeda_evidence_unavailable");
  const eligible = (leads || []).filter((lead) => { const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {}; const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {}; return meta.dataSharingConsent === true && Boolean(lead.email || lead.phone); });
  const eligibleIds = new Set(eligible.map((lead) => lead.id)); const eligibleEvents = (events || []).filter((event) => event.lead_id && eligibleIds.has(event.lead_id));
  const deepNames = new Set(["QualifiedLead", "Schedule", "SubmitApplication", "ConvertedLead"]); const lastDelivered = eligibleEvents.filter((event) => event.status === "delivered").map((event) => new Date(event.delivered_at || event.created_at).getTime()).filter(Number.isFinite).sort((a,b)=>b-a)[0];
  return { eligibleLeads: eligible.length, delivered: eligibleEvents.filter((event) => event.status === "delivered").length, failed: eligibleEvents.filter((event) => ["failed", "dead_letter"].includes(event.status)).length, duplicateEvents: eligibleEvents.filter((event) => event.status === "duplicate").length, deepEvents: eligibleEvents.filter((event) => deepNames.has(event.event_name)).length, leadEvents: eligibleEvents.filter((event) => event.event_name === "Lead").length, dualIdentifiers: eligible.filter((lead) => lead.email && lead.phone).length, attributedLeads: new Set((touches || []).filter((touch) => eligibleIds.has(touch.lead_id)).map((touch) => touch.lead_id)).size, freshnessHours: lastDelivered ? Math.round((Date.now() - lastDelivered) / 3_600_000) : null };
}

export async function GET(request: NextRequest) {
  const rate=enforceRateLimit(request,{limit:45,scope:"meta.andromeda-loop.read"});if(!rate.ok)return rate.response;
  const access=await requireAccessContext(request,{roles:managementRoles});if(!access.ok)return access.response;
  const admin=getSupabaseAdmin(); const {data:cycles,error}=await admin.from("meta_andromeda_learning_cycles").select("id,window_started_at,window_ended_at,signal_version,readiness_score,readiness,evidence,recommendations,blockers,status,decision_reason,decided_at,created_at").eq("organization_id",access.access.organization.id).order("created_at",{ascending:false}).limit(30);
  if(error)return apiError("ANDROMEDA_LOOP_UNAVAILABLE","Aplique a migration da Fase 92.",access.meta,{status:503});
  let live=null;try{live=evaluateAndromedaLearning(await collectEvidence(access.access.organization.id));}catch{}
  return apiSuccess({live,cycles:cycles||[],policy:{signalMode:"test_only",consentRequired:true,aggregatedEvidenceOnly:true,negativeSignalsInternalOnly:true,directorDecisionRequired:true,automaticAudienceChanges:false,automaticBudgetChanges:false,approvedCycleExecutesExternalChange:false}},access.meta,{headers:{...rate.headers,"Cache-Control":"no-store"}});
}

export async function POST(request: NextRequest) {
  const rate=enforceRateLimit(request,{limit:12,windowMs:60_000,scope:"meta.andromeda-loop.write"});if(!rate.ok)return rate.response;
  const access=await requireAccessContext(request,{roles:["director"]});if(!access.ok)return access.response;
  let body:{action?:string;cycleId?:string;decision?:string;reason?:string};try{body=await request.json();}catch{return apiError("INVALID_JSON","Envie JSON válido.",access.meta,{status:400});}
  const admin=getSupabaseAdmin();
  if(body.action==="decide") { const cycleId=String(body.cycleId||"");const reason=String(body.reason||"").trim();if(!isUuid(cycleId)||!["approved","rejected"].includes(String(body.decision))||reason.length<20)return apiError("INVALID_DECISION","Informe ciclo, decisão e justificativa com pelo menos 20 caracteres.",access.meta,{status:422});const{data,error}=await admin.rpc("decide_meta_andromeda_cycle",{p_actor_id:access.access.profile.id,p_organization_id:access.access.organization.id,p_cycle_id:cycleId,p_decision:body.decision,p_reason:reason});if(error)return apiError("ANDROMEDA_DECISION_REJECTED","O ciclo não está pendente ou a decisão é inválida.",access.meta,{status:409});return apiSuccess(data,access.meta,{headers:rate.headers}); }
  if(body.action!=="generate")return apiError("INVALID_ACTION","Use generate ou decide.",access.meta,{status:400});
  try { const evidence=await collectEvidence(access.access.organization.id);const assessment=evaluateAndromedaLearning(evidence);const endedAt=new Date();const startedAt=new Date(endedAt.getTime()-30*86_400_000);const canonical=JSON.stringify({window:startedAt.toISOString().slice(0,10),evidence,assessment});const evidenceHash=createHash("sha256").update(canonical).digest("hex");const{data,error}=await admin.from("meta_andromeda_learning_cycles").upsert({organization_id:access.access.organization.id,window_started_at:startedAt.toISOString(),window_ended_at:endedAt.toISOString(),readiness_score:assessment.score,readiness:assessment.readiness,evidence:{...evidence,metrics:assessment.metrics,gates:assessment.gates,governance:assessment.governance},recommendations:assessment.recommendations,blockers:assessment.blockers,evidence_hash:evidenceHash,status:"draft",created_by:access.access.profile.id},{onConflict:"organization_id,evidence_hash",ignoreDuplicates:true}).select("id,readiness_score,readiness,status,blockers,recommendations").maybeSingle();if(error)throw error;return apiSuccess({cycle:data,duplicatePrevented:!data,externalChangeExecuted:false},access.meta,{status:data?201:200,headers:rate.headers}); } catch { return apiError("ANDROMEDA_CYCLE_FAILED","Não foi possível consolidar evidências seguras do ciclo.",access.meta,{status:503}); }
}
