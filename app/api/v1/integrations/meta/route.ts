import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildMetaCampaignIntelligence } from "@/lib/meta/campaign-intelligence";

export const dynamic = "force-dynamic";

function canManage(role: string | null, legacyRole: string) {
  return ["director", "superintendent", "manager"].includes(role || "") || ["admin", "manager"].includes(legacyRole);
}
function isDirector(role: string | null, legacyRole: string) { return role === "director" || legacyRole === "admin"; }

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const [{ data: sources, error }, { data: events }, { data: conversionConfig }, { data: conversionEvents }, { data: learningEvents }, { data: metaLeads }, { data: dailyReports }] = await Promise.all([
    access.supabase.from("meta_lead_sources").select("id,page_id,form_id,name,active,default_owner_id,conversion_sharing_enabled,consent_basis,created_at,updated_at").order("created_at", { ascending: false }),
    access.supabase.from("meta_lead_events").select("id,status,received_at,processed_at,last_error").order("received_at", { ascending: false }).limit(100),
    access.supabase.from("meta_conversion_configs").select("dataset_id,mode,enabled,test_event_code,consent_required").maybeSingle(),
    access.supabase.from("meta_conversion_events").select("status,event_name").order("created_at", { ascending: false }).limit(100),
    access.supabase.from("campaign_events").select("event_type,source,payload").in("source", ["crm-funnel", "crm-followup"]).order("occurred_at", { ascending: false }).limit(500),
    access.supabase.from("leads").select("status,score,metadata").eq("source", "Meta Lead Ads").order("created_at", { ascending: false }).limit(2000),
    access.supabase.from("meta_daily_reports").select("id,report_date,status,payload,created_at,updated_at").order("report_date", { ascending: false }).limit(7),
  ]);
  if (error) return NextResponse.json({ error: "Aplique a migração Meta Lead Ads para configurar fontes." }, { status: 503 });
  const summary = (events ?? []).reduce((total, event) => ({ ...total, [event.status]: (total[event.status] || 0) + 1 }), {} as Record<string, number>);
  const conversionSummary = (conversionEvents ?? []).reduce((total, event) => ({ ...total, [event.status]: (total[event.status] || 0) + 1 }), {} as Record<string, number>);
  const conversionFunnel = (conversionEvents ?? []).reduce((total, event) => ({ ...total, [event.event_name]: (total[event.event_name] || 0) + 1 }), {} as Record<string, number>);
  const internalFunnel = (learningEvents ?? []).reduce((total, event) => {
    if (event.source !== "crm-funnel") return total;
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    const stage = String(payload.stage || "desconhecido");
    return { ...total, [stage]: (total[stage] || 0) + 1 };
  }, {} as Record<string, number>);
  const audienceSignals = (learningEvents ?? []).reduce((total, event) => {
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    const signals = Array.isArray(payload.decision_signals) ? payload.decision_signals : [];
    for (const signal of signals) if (typeof signal === "string" && signal !== "motivo_nao_classificado") total[signal] = (total[signal] || 0) + 1;
    return total;
  }, {} as Record<string, number>);
  const audienceRecommendations = Object.entries(audienceSignals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([signal, count]) => ({ signal, count }));
  const leads = conversionFunnel.Lead || 0;
  const rate = (value: number) => leads > 0 ? Math.round((value / leads) * 100) : 0;
  const funnelInsights = { qualifiedRate: rate(conversionFunnel.QualifiedLead || 0), visitRate: rate(conversionFunnel.Schedule || 0), proposalRate: rate(conversionFunnel.SubmitApplication || 0), convertedRate: rate(conversionFunnel.ConvertedLead || 0), lost: internalFunnel.perdido || 0, buyerProfiles: internalFunnel.comprou_outro || 0 };
  const campaignIntelligence = buildMetaCampaignIntelligence(metaLeads ?? []);
  return NextResponse.json({ sources: sources ?? [], summary, conversionConfig, conversionSummary, conversionFunnel, internalFunnel, funnelInsights, audienceRecommendations, campaignIntelligence, dailyReports: dailyReports ?? [], readiness: { webhookSecret: Boolean(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN), graphToken: Boolean(process.env.META_LEAD_ACCESS_TOKEN), conversionsToken: Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN), cronWorker: Boolean(process.env.ATLAS_CRON_SECRET) }, canManage: canManage(access.access.profile.commercialRole, access.access.profile.role), canDecide: isDirector(access.access.profile.commercialRole, access.access.profile.role) });
}

export async function POST(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManage(access.access.profile.commercialRole, access.access.profile.role)) return NextResponse.json({ error: "Permissão insuficiente para configurar a Meta." }, { status: 403 });
  const body = await request.json() as { action?: string; pageId?: string; formId?: string; name?: string; defaultOwnerId?: string; conversionSharingEnabled?: boolean; consentBasis?: string; datasetId?: string; testEventCode?: string };
  if ((body.action === "conversion_config" || body.action === "review_daily_report") && !isDirector(access.access.profile.commercialRole, access.access.profile.role)) return NextResponse.json({ error: "Somente o diretor pode decidir sobre otimização de campanhas." }, { status: 403 });
  if (body.action === "review_daily_report") {
    const reportId = String((body as { reportId?: string }).reportId || "");
    if (!/^[0-9a-f-]{36}$/i.test(reportId)) return NextResponse.json({ error: "Relatório inválido." }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("meta_daily_reports").update({ status: "reviewed", reviewed_by: access.access.profile.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", reportId).eq("organization_id", access.access.organization.id);
    if (error) return NextResponse.json({ error: "Não foi possível registrar a revisão." }, { status: 400 });
    return NextResponse.json({ reportId, status: "reviewed" });
  }
  if (body.action === "conversion_config") {
    const datasetId = String(body.datasetId || "").trim();
    const testEventCode = String(body.testEventCode || "").trim();
    if (!/^\d{5,30}$/.test(datasetId) || !testEventCode) return NextResponse.json({ error: "Informe Dataset ID e código de teste válidos." }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("meta_conversion_configs").upsert({ organization_id: access.access.organization.id, dataset_id: datasetId, mode: "test", enabled: true, test_event_code: testEventCode.slice(0, 100), consent_required: true, updated_at: new Date().toISOString() }, { onConflict: "organization_id" }).select("dataset_id,mode,enabled,test_event_code,consent_required").single();
    if (error) return NextResponse.json({ error: "Não foi possível ativar o modo de teste." }, { status: 400 });
    return NextResponse.json({ conversionConfig: data });
  }
  const pageId = String(body.pageId || "").trim();
  const formId = String(body.formId || "").trim() || null;
  const name = String(body.name || "").trim().slice(0, 120);
  if (!/^\d{5,30}$/.test(pageId) || (formId && !/^\d{5,30}$/.test(formId)) || name.length < 2) return NextResponse.json({ error: "Informe Página, Formulário e nome válidos." }, { status: 400 });
  const admin = getSupabaseAdmin();
  let defaultOwnerId: string | null = null;
  if (body.defaultOwnerId && /^[0-9a-f-]{36}$/i.test(body.defaultOwnerId)) {
    const { data: owner } = await admin.from("profiles").select("id").eq("id", body.defaultOwnerId).eq("organization_id", access.access.organization.id).eq("active", true).maybeSingle();
    if (!owner) return NextResponse.json({ error: "Responsável padrão fora da organização." }, { status: 400 });
    defaultOwnerId = owner.id;
  }
  const consentBasis = String(body.consentBasis || "").trim().slice(0, 500) || null;
  if (body.conversionSharingEnabled && !consentBasis) return NextResponse.json({ error: "Registre a base de consentimento antes de compartilhar conversões." }, { status: 400 });
  const { data, error } = await admin.from("meta_lead_sources").upsert({ organization_id: access.access.organization.id, page_id: pageId, form_id: formId, name, active: true, default_owner_id: defaultOwnerId, conversion_sharing_enabled: body.conversionSharingEnabled === true, consent_basis: consentBasis, updated_at: new Date().toISOString() }, { onConflict: "page_id,form_id" }).select("id,page_id,form_id,name,active,default_owner_id,conversion_sharing_enabled,consent_basis").single();
  if (error) return NextResponse.json({ error: "Não foi possível salvar a fonte Meta." }, { status: 400 });
  return NextResponse.json({ source: data }, { status: 201 });
}
