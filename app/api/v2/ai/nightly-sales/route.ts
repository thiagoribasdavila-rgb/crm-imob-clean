import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateNightlyEligibility, nightlyWindow } from "@/lib/ai/governed-nightly-copilot";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const header = request.headers.get("authorization");
  return Boolean(process.env.ATLAS_CRON_SECRET && header === `Bearer ${process.env.ATLAS_CRON_SECRET}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const window=nightlyWindow();if(!window.active)return NextResponse.json({ prepared: 0, reason: "A jornada opera somente entre 22h e 6h59 em São Paulo.",window:window.label });
  const templateName = String(process.env.WHATSAPP_NIGHTLY_APPROACH_TEMPLATE || "").trim();
  if (!/^[a-z0-9_]{2,512}$/.test(templateName)) return NextResponse.json({ error: "Configure um template oficial em WHATSAPP_NIGHTLY_APPROACH_TEMPLATE." }, { status: 503 });

  const admin = getSupabaseAdmin();
  const { data: leads, error } = await admin.from("leads").select("id,organization_id,assigned_to,development_id,name,phone,status,metadata").not("assigned_to", "is", null).not("phone", "is", null).in("status", ["novo", "contato", "qualificacao"]).limit(100);
  if (error) return NextResponse.json({ error: "Não foi possível selecionar as leads." }, { status: 500 });
  let prepared = 0;
  let blocked = 0;
  for (const lead of leads ?? []) {
    const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
    const reactivation = metadata.reactivation && typeof metadata.reactivation === "object" ? metadata.reactivation as Record<string, unknown> : {};
    const messaging = metadata.messagingConsent && typeof metadata.messagingConsent === "object" ? metadata.messagingConsent as Record<string, unknown> : {};
    const consentBasis = String(reactivation.consentBasis || (messaging.whatsapp === true ? messaging.basis : "") || "").trim();
    if (!consentBasis) { blocked += 1; continue; }
    const phone = String(lead.phone).replace(/\D/g, "");
    const [{ data: existing }, { data: suppression }, { data: development }, { count: materialCount },{data:approvedTemplate},{data:contactEligibility}] = await Promise.all([
      admin.from("ai_sales_journeys").select("id").eq("organization_id", lead.organization_id).eq("lead_id", lead.id).maybeSingle(),
      admin.from("messaging_suppressions").select("id").eq("organization_id", lead.organization_id).eq("channel", "whatsapp").eq("recipient", phone).maybeSingle(),
      lead.development_id ? admin.from("developments").select("id,name,developer_name,city,status,delivery_date").eq("id", lead.development_id).eq("organization_id", lead.organization_id).maybeSingle() : Promise.resolve({ data: null }),
      lead.development_id ? admin.from("project_materials").select("id", { count: "exact", head: true }).eq("organization_id", lead.organization_id).eq("development_id", lead.development_id).eq("is_current", true) : Promise.resolve({ count: 0 }),
      admin.from("message_templates").select("id").eq("organization_id",lead.organization_id).eq("channel","whatsapp").eq("name",templateName).eq("status","approved").maybeSingle(),admin.rpc("check_lead_contact_eligibility",{p_organization_id:lead.organization_id,p_lead_id:lead.id,p_channel:"whatsapp"}),
    ]);
    const eligibility=evaluateNightlyEligibility({consent:Boolean(consentBasis)&&Boolean((contactEligibility as{eligible?:boolean}|null)?.eligible),suppressed:Boolean(suppression),officialApiReady:Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_ACCESS_TOKEN),approvedTemplate:Boolean(approvedTemplate),assignedBroker:Boolean(lead.assigned_to),projectReady:Boolean(development)&&Number(materialCount||0)>=2,existingJourney:Boolean(existing)});if(!eligibility.eligible){blocked+=1;continue}
    let { data: conversation } = await admin.from("conversations").select("id").eq("organization_id", lead.organization_id).eq("lead_id", lead.id).eq("channel", "whatsapp").maybeSingle();
    if (!conversation) conversation = (await admin.from("conversations").insert({ organization_id: lead.organization_id, lead_id: lead.id, channel: "whatsapp", external_thread_id: phone, assigned_to: lead.assigned_to, status: "open" }).select("id").single()).data;
    if (!conversation) continue;
    const projectName = development?.name || "o projeto de interesse";
    const content = `Abordagem noturna Atlas: apresentar ${projectName}, contextualizar ${development?.city || "a região"} e iniciar a descoberta consultiva. Em seguida: qualificar, simular e preparar proposta para revisão humana.`;
    const { data: message } = await admin.from("messages").insert({ organization_id: lead.organization_id, conversation_id: conversation.id, direction: "outbound", channel: "whatsapp", recipient: phone, content, media: [{ type: "whatsapp_template", name: templateName, language: "pt_BR", journey: "nightly_sales" }], status: "queued" }).select("id").single();
    if (!message) continue;
    const snapshot = { project: development || null, currentMaterials: materialCount || 0, region: development?.city || null, mission: ["discovery", "qualification", "simulation_draft", "human_handoff"],policy:eligibility };
    const { data: journey } = await admin.from("ai_sales_journeys").insert({ organization_id: lead.organization_id, lead_id: lead.id, broker_id: lead.assigned_to, development_id: lead.development_id, conversation_id: conversation.id, stage: "approach", status: "pending_approval", last_message_id: message.id, consent_basis: consentBasis, context_snapshot: snapshot,policy_version:1,maximum_automated_stage:"qualification",outbound_count:1,morning_handoff_required:true }).select("id").single();
    if (!journey) continue;
    await admin.from("approval_requests").insert({ organization_id: lead.organization_id, request_type: "ai_nightly_approach", entity_type: "message", entity_id: message.id, payload: { journeyId: journey.id, leadId: lead.id, brokerId: lead.assigned_to, project: projectName, afterHour: 22, stages: snapshot.mission }, requested_by: lead.assigned_to });
    prepared += 1;
  }
  return NextResponse.json({ prepared, blocked, window: window.label, requiresApproval: true,maximumAutomatedStage:"qualification",proposalAllowed:false,morningHandoff:true });
}
