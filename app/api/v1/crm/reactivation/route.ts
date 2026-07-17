import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateReactivationPlan } from "@/lib/commercial/consented-reactivation-policy";
import { mapLegacyProfile, mapLegacyProject } from "@/lib/compat/legacy-v2";

type ImportRow = { name?: string; phone?: string; email?: string };
function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? digits : "";
}

function roleOf(role: string, commercialRole: string | null) {
  return commercialRole || (role === "admin" ? "director" : role);
}

function descendants(profiles: Array<{ id: string; reports_to: string | null }>, root: string) {
  const ids = new Set([root]);
  let changed = true;
  while (changed) { changed = false; for (const profile of profiles) if (profile.reports_to && ids.has(profile.reports_to) && !ids.has(profile.id)) { ids.add(profile.id); changed = true; } }
  return ids;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "crm-reactivation-read" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const admin = getSupabaseAdmin();
  const org = identity.access.organization.id;
  const [profilesResult, batchesResult, contactsResult, projectsResult, experienceResult] = await Promise.all([
    admin.from("profiles").select("id,full_name,role,commercial_role,reports_to,active").eq("organization_id", org).eq("active", true),
    admin.from("lead_reactivation_batches").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(100),
    admin.from("lead_reactivation_contacts").select("batch_id,status,block_reason").eq("organization_id", org),
    admin.from("developments").select("id,name,developer_name").eq("organization_id", org).order("name"),
    admin.from("lead_experience_signals").select("id,lead_id,broker_id,signal_type,severity,confidence,evidence,recommendation,suggested_reply,status,created_at").eq("organization_id", org).eq("status", "pending").order("created_at", { ascending: false }).limit(100),
  ]);
  const failed = [profilesResult, batchesResult, contactsResult, projectsResult, experienceResult].find((item) => item.error);
  if (failed?.error) {
    const [legacyProfiles, archivedLeads, activeOrganizations] = await Promise.all([
      admin.from("profiles").select("*").eq("organization_id", org).eq("active", true),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", org).in("status", ["arquivado", "archived"]),
      admin.from("organizations").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    ]);
    if (legacyProfiles.error || archivedLeads.error) return apiError("REACTIVATION_LOOKUP_FAILED", "Não foi possível carregar a central de reativação.", identity.meta, { status: 500 });
    const projectResult = (activeOrganizations.count ?? 0) === 1 ? await admin.from("projects").select("*").order("name") : { data: [] };
    const profiles = (legacyProfiles.data ?? []).map((item) => mapLegacyProfile(item));
    const role = roleOf(identity.access.profile.role, identity.access.profile.commercialRole);
    const visible = role === "director" ? new Set(profiles.map((item) => String(item.id))) : descendants(profiles.map((item) => ({ id: String(item.id), reports_to: item.reports_to ? String(item.reports_to) : null })), identity.access.profile.id);
    const coldCount = archivedLeads.count ?? 0;
    return apiSuccess({
      viewer: { id: identity.access.profile.id, role }, compatibility: "protected-memory-read-only",
      targets: profiles.filter((item) => visible.has(String(item.id)) && String(item.commercial_role || item.role) === "broker"),
      projects: (projectResult.data ?? []).map((item) => mapLegacyProject(item)),
      batches: coldCount ? [{ id: "protected-cold-memory", name: "Memória histórica protegida", owner_id: identity.access.profile.id, development_id: null, source_type: "protected_memory", status: "memory_only", quality_status: "protected", imported_count: coldCount, eligible_count: 0, queued_count: 0, delivered_count: 0, read_count: 0, replied_count: 0, failed_count: 0, created_at: new Date().toISOString(), summary: {} }] : [],
      offers: [], experiences: [], governance: { automaticActivation: false, piiExposed: false, consentRequired: true, coldMemoryCount: coldCount },
    }, identity.meta, { headers: rate.headers });
  }
  const profiles = profilesResult.data ?? [];
  const role = roleOf(identity.access.profile.role, identity.access.profile.commercialRole);
  const visible = role === "director" ? new Set(profiles.map((item) => item.id)) : descendants(profiles, identity.access.profile.id);
  const batches = (batchesResult.data ?? []).filter((item) => visible.has(item.owner_id));
  const contacts = contactsResult.data ?? [];
  const batchIds = batches.map((item) => item.id);
  const { data: offerContacts } = batchIds.length ? await admin.from("lead_reactivation_contacts").select("id,batch_id,status,lead:leads!lead_id(id,name,status,score,assigned_to,next_action_at,metadata)").eq("organization_id", org).in("batch_id", batchIds).in("status", ["imported","replied"]).limit(200) : { data: [] };
  return apiSuccess({
    viewer: { id: identity.access.profile.id, role },
    targets: profiles.filter((item) => visible.has(item.id) && (item.commercial_role || item.role) === "broker"),
    projects: projectsResult.data ?? [],
    batches: batches.map((batch) => ({ ...batch, summary: contacts.filter((item) => item.batch_id === batch.id).reduce((sum, item) => { sum[item.status] = (sum[item.status] || 0) + 1; if (item.block_reason) sum[`blocked:${item.block_reason}`] = (sum[`blocked:${item.block_reason}`] || 0) + 1; return sum; }, {} as Record<string, number>) })),
    offers: (offerContacts ?? []).map((contact) => { const lead = Array.isArray(contact.lead) ? contact.lead[0] : contact.lead; const score = Number(lead?.score || 0); return { contactId: contact.id, batchId: contact.batch_id, status: contact.status, lead, aiPriority: score >= 70 ? "high" : score >= 45 ? "medium" : "learning", aiSuggestion: score >= 70 ? "Priorizar abordagem consultiva hoje." : contact.status === "replied" ? "Retomar a conversa com base na última resposta." : "Validar interesse e atualizar o perfil antes da oferta." }; }).filter((item) => item.lead),
    experiences: (experienceResult.data ?? []).filter((item) => item.broker_id && visible.has(item.broker_id)),
  }, identity.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 20, scope: "crm-reactivation-write" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const body = await request.json().catch(() => null) as { action?: string; name?: string; ownerId?: string; developmentId?: string; sourceType?: string; consentBasis?: string; consentConfirmed?: boolean; rows?: ImportRow[]; batchId?: string; templateName?: string; templateLanguage?: string; dailyCap?: number; intervalSeconds?: number; command?: "pause" | "resume"; signalId?: string; experienceDecision?: "keep" | "change_requested"; reason?: string; leadId?: string; phoneQualityReason?: "invalid_phone" | "disconnected" | "wrong_person"; evidence?: string } | null;
  const admin = getSupabaseAdmin();
  const org = identity.access.organization.id;
  const role = roleOf(identity.access.profile.role, identity.access.profile.commercialRole);

  if (body?.action === "mark_invalid_phone" && body.leadId && body.phoneQualityReason) {
    const evidence = String(body.evidence || "").trim();
    if (evidence.length < 5) return apiError("EVIDENCE_REQUIRED", "Descreva como o telefone inválido foi confirmado.", identity.meta, { status: 400 });
    const { data: visibleLead } = await identity.supabase.from("leads").select("id").eq("id", body.leadId).maybeSingle();
    if (!visibleLead) return apiError("LEAD_NOT_VISIBLE", "Lead inexistente ou fora da sua carteira.", identity.meta, { status: 404 });
    const { data, error } = await admin.rpc("register_invalid_lead_phone", { p_organization_id: org, p_lead_id: body.leadId, p_actor_id: identity.access.profile.id, p_reason: body.phoneQualityReason, p_evidence: evidence.slice(0, 500) });
    if (error) return apiError("PHONE_SUPPRESSION_FAILED", "Não foi possível registrar a limpeza do telefone.", identity.meta, { status: 409 });
    return apiSuccess({ ...data, futureImportsBlocked: true, historyPreserved: true }, identity.meta, { headers: rate.headers });
  }

  if (body?.action === "experience_decision" && body.signalId && ["keep", "change_requested"].includes(body.experienceDecision || "")) {
    const reason = String(body.reason || "").trim();
    if (reason.length < 5) return apiError("REASON_REQUIRED", "Explique brevemente a decisão para manter a auditoria do atendimento.", identity.meta, { status: 400 });
    const { data, error } = await admin.rpc("decide_lead_experience_signal", { p_actor_id: identity.access.profile.id, p_organization_id: org, p_signal_id: body.signalId, p_decision: body.experienceDecision, p_reason: reason.slice(0, 500) });
    if (error) return apiError("EXPERIENCE_DECISION_FAILED", "O alerta mudou ou está fora da sua estrutura. Atualize a tela.", identity.meta, { status: 409 });
    return apiSuccess({ ...data, requiresNewBrokerSelection: body.experienceDecision === "change_requested", humanDecisionRequired: true }, identity.meta, { headers: rate.headers });
  }

  if (body?.action === "control" && body.batchId && ["pause", "resume"].includes(body.command || "")) {
    const { data: batch } = await admin.from("lead_reactivation_batches").select("id,owner_id,status").eq("id", body.batchId).eq("organization_id", org).single();
    if (!batch) return apiError("BATCH_NOT_FOUND", "Campanha não encontrada.", identity.meta, { status: 404 });
    const { data: profiles } = await admin.from("profiles").select("id,reports_to").eq("organization_id", org).eq("active", true);
    const allowed = role === "director" ? new Set((profiles ?? []).map((item) => item.id)) : descendants(profiles ?? [], identity.access.profile.id);
    if (!allowed.has(batch.owner_id) || (body.command === "resume" && role === "broker")) return apiError("FORBIDDEN", "A retomada exige a liderança responsável.", identity.meta, { status: 403 });
    await admin.from("lead_reactivation_batches").update(body.command === "pause" ? { quality_status: "red", paused_reason: "Pausa manual.", updated_at: new Date().toISOString() } : { quality_status: "yellow", status: "queued", paused_reason: null, updated_at: new Date().toISOString() }).eq("id", batch.id);
    return apiSuccess({ batchId: batch.id, status: body.command === "pause" ? "paused" : "queued" }, identity.meta, { headers: rate.headers });
  }

  if (body?.action === "import") {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
    if (!rows.length) return apiError("EMPTY_BASE", "Inclua ao menos um contato válido.", identity.meta, { status: 400 });
    if (!body.consentConfirmed || !body.consentBasis?.trim()) return apiError("CONSENT_REQUIRED", "Confirme e descreva a autorização para contato por WhatsApp.", identity.meta, { status: 400 });
    const sourceType = role === "broker" ? "broker_external" : body.sourceType === "broker_external" ? "broker_external" : "company_legacy";
    const ownerId = role === "broker" ? identity.access.profile.id : body.ownerId || identity.access.profile.id;
    const { data: profiles } = await admin.from("profiles").select("id,reports_to,commercial_role,role").eq("organization_id", org).eq("active", true);
    const allowed = role === "director" ? new Set((profiles ?? []).map((item) => item.id)) : descendants(profiles ?? [], identity.access.profile.id);
    const target = (profiles ?? []).find((item) => item.id === ownerId);
    if (!target || !allowed.has(ownerId) || (target.commercial_role || target.role) !== "broker") return apiError("INVALID_OWNER", "Selecione um corretor permitido na sua estrutura.", identity.meta, { status: 403 });
    if (body.developmentId) {
      const { data: project } = await admin.from("developments").select("id").eq("id", body.developmentId).eq("organization_id", org).maybeSingle();
      if (!project) return apiError("INVALID_PROJECT", "Projeto não encontrado.", identity.meta, { status: 400 });
    }
    const unique = new Map<string, { name: string; phone: string; email: string | null }>();
    const occurrences = new Map<string, number>();
    for (const row of rows) {
      const phone = normalizePhone(row.phone || "");
      if (phone) { occurrences.set(phone, (occurrences.get(phone) || 0) + 1); if (!unique.has(phone)) unique.set(phone, { name: String(row.name || "Lead reativação").trim().slice(0, 120), phone, email: String(row.email || "").trim().toLowerCase() || null }); }
    }
    const normalized = Array.from(unique.values());
    if (!normalized.length) return apiError("INVALID_CONTACTS", "Nenhum telefone válido foi encontrado.", identity.meta, { status: 400 });
    const phones = normalized.map((item) => item.phone);
    const [{ data: suppressions }, { data: qualitySuppressions }, { data: existing }] = await Promise.all([
      admin.from("messaging_suppressions").select("recipient").eq("organization_id", org).eq("channel", "whatsapp").in("recipient", phones),
      admin.from("contact_quality_suppressions").select("id,normalized_contact,reason").eq("organization_id", org).eq("channel", "whatsapp").eq("active", true).in("normalized_contact", phones),
      admin.from("leads").select("id,phone,phone_normalized,assigned_to").eq("organization_id", org).in("phone_normalized", phones),
    ]);
    const blocked = new Set((suppressions ?? []).map((item) => item.recipient));
    const qualityMap = new Map((qualitySuppressions ?? []).map((item) => [item.normalized_contact, item]));
    const existingMap = new Map((existing ?? []).map((item) => [item.phone_normalized || normalizePhone(item.phone || ""), item]));
    const { data: batch, error: batchError } = await admin.from("lead_reactivation_batches").insert({ organization_id: org, owner_id: ownerId, created_by: identity.access.profile.id, development_id: body.developmentId || null, name: String(body.name || "Base de reativação").trim().slice(0, 120), source_type: sourceType, consent_basis: body.consentBasis.trim().slice(0, 500), imported_count: normalized.length }).select("id").single();
    if (batchError || !batch) return apiError("IMPORT_FAILED", "Não foi possível criar a base.", identity.meta, { status: 500 });
    const contacts = [];
    let eligible = 0;
    for (const item of normalized) {
      let lead = existingMap.get(item.phone);
      let reason: string | null = blocked.has(item.phone) ? "opt_out" : qualityMap.has(item.phone) ? "invalid_phone_history" : (occurrences.get(item.phone) || 0) > 1 ? "duplicado_no_arquivo" : lead ? "lead_ja_existente" : null;
      if (!lead && !reason) {
        const created = await admin.from("leads").insert({ organization_id: org, assigned_to: ownerId, development_id: body.developmentId || null, name: item.name, phone: item.phone, email: item.email, source: sourceType === "company_legacy" ? "Base antiga" : "Base externa do corretor", status: "novo", metadata: { reactivation: { batchId: batch.id, consentBasis: body.consentBasis.trim(), importedBy: identity.access.profile.id } } }).select("id,phone,phone_normalized,assigned_to").single();
        if (created.data) lead = created.data;
        else reason = "falha_ao_criar_lead";
      }
      if (!reason) eligible += 1;
      contacts.push({ batch_id: batch.id, organization_id: org, lead_id: lead?.id || null, phone: item.phone, status: reason ? "blocked" : "imported", block_reason: reason });
    }
    const { error: contactsError } = await admin.from("lead_reactivation_contacts").insert(contacts);
    if (contactsError) { await admin.from("lead_reactivation_batches").delete().eq("id", batch.id).eq("organization_id", org); return apiError("IMPORT_FAILED", "A base não foi gravada por completo e foi descartada com segurança.", identity.meta, { status: 500 }); }
    await admin.from("lead_reactivation_batches").update({ eligible_count: eligible }).eq("id", batch.id);
    const qualityHistory = contacts.filter((contact) => contact.block_reason === "invalid_phone_history").map((contact) => ({ organization_id: org, suppression_id: qualityMap.get(contact.phone)!.id, lead_id: contact.lead_id, action: "blocked_import", batch_id: batch.id, actor_id: identity.access.profile.id, details: { sourceType } }));
    if (qualityHistory.length) await admin.from("contact_quality_history").insert(qualityHistory);
    return apiSuccess({ batchId: batch.id, imported: normalized.length, eligible, blocked: normalized.length - eligible }, identity.meta, { status: 201, headers: rate.headers });
  }

  if (body?.action === "activate" && body.batchId) {
    const templateName = String(body.templateName || "").trim();
    const language = String(body.templateLanguage || "pt_BR").trim();
    const intervalSeconds = Math.min(3600, Math.max(10, Math.floor(body.intervalSeconds ?? 30)));
    const dailyCap = Math.min(1000, Math.max(1, Math.min(Math.floor(body.dailyCap ?? 100), Math.floor((9 * 60 * 60) / intervalSeconds))));
    if (!/^[a-z0-9_]{2,512}$/.test(templateName)) return apiError("INVALID_TEMPLATE", "Informe o nome técnico de um template aprovado no WhatsApp.", identity.meta, { status: 400 });
    const { data: batch } = await admin.from("lead_reactivation_batches").select("*").eq("id", body.batchId).eq("organization_id", org).single();
    if (!batch) return apiError("BATCH_NOT_FOUND", "Base não encontrada.", identity.meta, { status: 404 });
    const { data: profiles } = await admin.from("profiles").select("id,reports_to").eq("organization_id", org).eq("active", true);
    const allowed = role === "director" ? new Set((profiles ?? []).map((item) => item.id)) : descendants(profiles ?? [], identity.access.profile.id);
    if (!allowed.has(batch.owner_id)) return apiError("FORBIDDEN", "Base fora da sua estrutura.", identity.meta, { status: 403 });
    const {data:approvedTemplate}=await admin.from("message_templates").select("id").eq("organization_id",org).eq("channel","whatsapp").eq("name",templateName).eq("language",language).eq("status","approved").maybeSingle();
    const { data: contacts } = await admin.from("lead_reactivation_contacts").select("id,lead_id,phone,status").eq("batch_id", batch.id).eq("status", "imported").limit(500);
    const plan=evaluateReactivationPlan({quality:batch.quality_status||"unknown",requestedDailyCap:dailyCap,requestedIntervalSeconds:intervalSeconds,consentBasis:batch.consent_basis,approvedTemplate:Boolean(approvedTemplate),eligibleContacts:(contacts??[]).length,officialApiReady:Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_ACCESS_TOKEN)});if(!plan.eligible)return apiError("REACTIVATION_POLICY_BLOCKED","O plano não passou nos controles de consentimento, qualidade, template e API oficial.",identity.meta,{status:409,details:plan.blockers});
    const activationPhones = (contacts ?? []).map((contact) => contact.phone);
    const [{ data: latestSuppressions }, { data: badQuality }] = activationPhones.length ? await Promise.all([admin.from("messaging_suppressions").select("recipient").eq("organization_id", org).eq("channel", "whatsapp").in("recipient", activationPhones), admin.from("contact_quality_suppressions").select("id,normalized_contact").eq("organization_id", org).eq("channel", "whatsapp").eq("active", true).in("normalized_contact", activationPhones)]) : [{ data: [] }, { data: [] }];
    const suppressedNow = new Set((latestSuppressions ?? []).map((item) => item.recipient));
    const badQualityMap = new Map((badQuality ?? []).map((item) => [item.normalized_contact, item.id]));
    let prepared = 0;
    for (const contact of contacts ?? []) {
      if (suppressedNow.has(contact.phone)) { await admin.from("lead_reactivation_contacts").update({ status: "blocked", block_reason: "opt_out_before_activation" }).eq("id", contact.id).eq("organization_id", org); continue; }
      if (badQualityMap.has(contact.phone)) { await admin.from("lead_reactivation_contacts").update({ status: "blocked", block_reason: "invalid_phone_before_activation" }).eq("id", contact.id).eq("organization_id", org); await admin.from("contact_quality_history").insert({ organization_id: org, suppression_id: badQualityMap.get(contact.phone), lead_id: contact.lead_id, action: "blocked_activation", batch_id: batch.id, actor_id: identity.access.profile.id }); continue; }
      let { data: conversation } = await admin.from("conversations").select("id").eq("organization_id", org).eq("channel", "whatsapp").eq("lead_id", contact.lead_id).maybeSingle();
      if (!conversation) {
        const created = await admin.from("conversations").insert({ organization_id: org, lead_id: contact.lead_id, channel: "whatsapp", external_thread_id: contact.phone, assigned_to: batch.owner_id, status: "open" }).select("id").single();
        conversation = created.data;
      }
      if (!conversation) continue;
      const { data: message } = await admin.from("messages").insert({ organization_id: org, conversation_id: conversation.id, direction: "outbound", channel: "whatsapp", recipient: contact.phone, content: `Template WhatsApp: ${templateName}`, media: [{ type: "whatsapp_template", name: templateName, language, batchId: batch.id }], status: "queued" }).select("id").single();
      if (!message) continue;
      await admin.from("lead_reactivation_contacts").update({ status: "pending_approval", message_id: message.id }).eq("id", contact.id);
      prepared += 1;
    }
    if (!prepared) return apiError("NO_ELIGIBLE_CONTACTS", "Nenhum contato permaneceu elegível após a nova verificação de opt-out.", identity.meta, { status: 409 });
    const { error: approvalError } = await admin.from("approval_requests").insert({ organization_id: org, request_type: "whatsapp_reactivation", entity_type: "reactivation_batch", entity_id: batch.id, payload: { batchId: batch.id, templateName, language, prepared, ownerId: batch.owner_id,policy:plan }, requested_by: identity.access.profile.id });
    if (approvalError) return apiError("APPROVAL_FAILED", "Não foi possível enviar a campanha para aprovação.", identity.meta, { status: 500 });
    await admin.from("lead_reactivation_batches").update({ status: "pending_approval", template_name: templateName, template_language: language, daily_cap: plan.dailyCap, interval_seconds: plan.intervalSeconds,maximum_attempts:plan.maximumAttempts,cooling_off_hours:plan.coolingOffHours,stop_on_reply:true,stop_on_opt_out:true,official_api_only:true,policy_version:1, queued_count: prepared, updated_at: new Date().toISOString() }).eq("id", batch.id);await admin.from("reactivation_governance_events").insert({organization_id:org,batch_id:batch.id,actor_id:identity.access.profile.id,event_type:"approval_requested",policy_snapshot:plan});
    return apiSuccess({ batchId: batch.id, prepared, dailyCap, intervalSeconds, status: "pending_approval" }, identity.meta, { status: 202, headers: rate.headers });
  }
  return apiError("INVALID_ACTION", "Ação inválida.", identity.meta, { status: 400 });
}
