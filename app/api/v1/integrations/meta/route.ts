import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateAndromedaLearning } from "@/lib/meta/andromeda-learning-loop";
import { buildMetaCampaignIntelligence } from "@/lib/meta/campaign-intelligence";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

function canManage(role: string | null, legacyRole: string) {
  return ["director", "superintendent", "manager"].includes(role || "") || ["admin", "manager"].includes(legacyRole);
}
function isDirector(role: string | null, legacyRole: string) { return role === "director" || legacyRole === "admin"; }

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 60, scope: "meta-campaign-ranking" });
  if (!limited.ok) return limited.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const [{ data: sources, error }, { data: events }, { data: conversionConfig }, { data: conversionEvents }, { data: learningEvents }, { data: metaLeads }, { data: dailyReports }, { data: matchingRows }, { data: attributionTouches }] = await Promise.all([
    access.supabase.from("meta_lead_sources").select("id,page_id,form_id,name,active,default_owner_id,conversion_sharing_enabled,consent_basis,created_at,updated_at").order("created_at", { ascending: false }),
    access.supabase.from("meta_lead_events").select("id,status,received_at,processed_at,last_error").order("received_at", { ascending: false }).limit(100),
    access.supabase.from("meta_conversion_configs").select("dataset_id,mode,enabled,test_event_code,consent_required").maybeSingle(),
    access.supabase.from("meta_conversion_events").select("lead_id,status,event_name,delivered_at,created_at").order("created_at", { ascending: false }).limit(1000),
    access.supabase.from("campaign_events").select("event_type,source,payload").in("source", ["crm-funnel", "crm-followup", "crm-qualification"]).order("occurred_at", { ascending: false }).limit(1000),
    access.supabase.from("leads").select("status,score,metadata,created_at,last_interaction_at").eq("source", "Meta Lead Ads").order("created_at", { ascending: false }).limit(2000),
    access.supabase.from("meta_daily_reports").select("id,report_date,status,payload,created_at,updated_at").in("status", ["ready", "reviewed"]).order("report_date", { ascending: false }).limit(7),
    access.supabase.from("leads").select("id,email,phone,metadata").eq("source", "Meta Lead Ads").order("created_at", { ascending: false }).limit(2000),
    access.supabase.from("lead_attribution_touches").select("lead_id").eq("organization_id", access.access.organization.id).order("occurred_at", { ascending: false }).limit(5000),
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
  const matchEligible = (matchingRows ?? []).filter((lead) => {
    const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
    const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
    return meta.dataSharingConsent === true && Boolean(lead.email || lead.phone);
  });
  const matchEligibleIds = new Set(matchEligible.map((lead) => lead.id));
  const eligibleConversionEvents = (conversionEvents ?? []).filter((event) => event.lead_id && matchEligibleIds.has(event.lead_id));
  const dualIdentifiers = matchEligible.filter((lead) => Boolean(lead.email && lead.phone)).length;
  const deepNames = new Set(["QualifiedLead", "Schedule", "SubmitApplication", "ConvertedLead"]);
  const latestDeliveredAt = eligibleConversionEvents
    .filter((event) => event.status === "delivered")
    .map((event) => new Date(event.delivered_at || event.created_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  const freshnessHours = latestDeliveredAt ? Math.round((Date.now() - latestDeliveredAt) / 3_600_000) : null;
  const andromedaAssessment = evaluateAndromedaLearning({
    eligibleLeads: matchEligible.length,
    delivered: eligibleConversionEvents.filter((event) => event.status === "delivered").length,
    failed: eligibleConversionEvents.filter((event) => ["failed", "dead_letter"].includes(event.status)).length,
    duplicateEvents: 0,
    deepEvents: eligibleConversionEvents.filter((event) => deepNames.has(event.event_name)).length,
    leadEvents: eligibleConversionEvents.filter((event) => event.event_name === "Lead").length,
    dualIdentifiers,
    attributedLeads: new Set((attributionTouches ?? []).filter((touch) => matchEligibleIds.has(touch.lead_id)).map((touch) => touch.lead_id)).size,
    freshnessHours,
  });
  const canDecide = isDirector(access.access.profile.commercialRole, access.access.profile.role);
  const { data: candidateRows } = canDecide ? await access.supabase.from("leads").select("id,name,email,phone,metadata").eq("source", "Meta Lead Ads").order("created_at", { ascending: false }).limit(50) : { data: [] };
  const conversionCandidates = (candidateRows ?? []).filter((lead) => {
    const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
    const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
    return meta.dataSharingConsent === true && Boolean(lead.email || lead.phone);
  }).slice(0, 20).map((lead) => ({ id: lead.id, name: lead.name || "Lead Meta", hasEmail: Boolean(lead.email), hasPhone: Boolean(lead.phone) }));
  return NextResponse.json({ scope: { viewerRole: access.access.profile.commercialRole || access.access.profile.role, hierarchicalRls: true, directorDecisionOnly: true }, sources: sources ?? [], summary, conversionConfig, conversionCandidates, conversionSummary, conversionFunnel, internalFunnel, funnelInsights, audienceRecommendations, campaignIntelligence, dailyReports: dailyReports ?? [], andromedaReadiness: { score: andromedaAssessment.score, readiness: andromedaAssessment.readiness, eligibleLeads: matchEligible.length, deliveryRate: andromedaAssessment.metrics.deliveryRate, dualIdentifierRate: andromedaAssessment.metrics.identityQuality, feedbackCoverage: andromedaAssessment.metrics.feedbackCoverage, attributionCoverage: andromedaAssessment.metrics.attributionCoverage, duplicateRate: andromedaAssessment.metrics.duplicateRate, freshnessScore: andromedaAssessment.metrics.freshnessScore, freshnessHours, gates: andromedaAssessment.gates, blockers: andromedaAssessment.blockers, recommendations: andromedaAssessment.recommendations, governance: andromedaAssessment.governance, privacy: "identificadores normalizados e protegidos; sinais agregados no painel" }, readiness: { webhookSecret: Boolean(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN), graphToken: Boolean(process.env.META_LEAD_ACCESS_TOKEN), conversionsToken: Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN), adsInsights: Boolean(process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID), cronWorker: Boolean(process.env.ATLAS_CRON_SECRET) }, canManage: canManage(access.access.profile.commercialRole, access.access.profile.role), canDecide }, { headers: limited.headers });
}

export async function POST(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManage(access.access.profile.commercialRole, access.access.profile.role)) return NextResponse.json({ error: "Permissão insuficiente para configurar a Meta." }, { status: 403 });
  const body = await request.json() as { action?: string; pageId?: string; formId?: string; name?: string; defaultOwnerId?: string; conversionSharingEnabled?: boolean; consentBasis?: string; datasetId?: string; testEventCode?: string };
  if ((body.action === "conversion_config" || body.action === "conversion_go_live" || body.action === "review_daily_report") && !isDirector(access.access.profile.commercialRole, access.access.profile.role)) return NextResponse.json({ error: "Somente o diretor pode decidir sobre otimização de campanhas." }, { status: 403 });
  if (body.action === "review_daily_report") {
    const reportId = String((body as { reportId?: string }).reportId || "");
    if (!/^[0-9a-f-]{36}$/i.test(reportId)) return NextResponse.json({ error: "Relatório inválido." }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("meta_daily_reports").update({ status: "reviewed", reviewed_by: access.access.profile.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", reportId).eq("organization_id", access.access.organization.id);
    if (error) return NextResponse.json({ error: "Não foi possível registrar a revisão." }, { status: 400 });
    return NextResponse.json({ reportId, status: "reviewed" });
  }
  /**
   * PROMOVER O CAPI DE TESTE PARA PRODUÇÃO.
   *
   * `conversion_config` grava sempre `mode: "test"`, e é assim que deve ser:
   * ninguém liga envio de conversão em produção por engano.
   *
   * Mas não existia caminho de volta. O efeito era pior que não configurar:
   * você veria os eventos chegando na aba de TESTE do Gerenciador de Eventos,
   * concluiria que funciona, e a otimização nunca receberia nada. Evento de
   * teste não entra no aprendizado do algoritmo — é justamente para isso que a
   * Meta separa os dois.
   *
   * A guarda: só promove o que JÁ ESTÁ configurado em teste. Assim a ordem é
   * sempre configurar → ver o evento chegar → promover, e não "ligar direto e
   * torcer".
   */
  if (body.action === "conversion_go_live") {
    const admin = getSupabaseAdmin();
    const { data: atual } = await admin
      .from("meta_conversion_configs")
      .select("dataset_id,mode,test_event_code")
      .eq("organization_id", access.access.organization.id)
      .maybeSingle();

    if (!atual?.dataset_id) {
      return NextResponse.json({ error: "Configure o Dataset em modo teste antes de ir para produção." }, { status: 422 });
    }
    if (atual.mode === "live") {
      return NextResponse.json({ ok: true, data: { mode: "live", jaEstava: true } });
    }

    const { data, error } = await admin
      .from("meta_conversion_configs")
      .update({
        mode: "live",
        // `test_event_code` sai junto: deixá-lo gravado faria a próxima volta
        // para teste parecer configurada quando o código já pode ter expirado.
        test_event_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", access.access.organization.id)
      .select("dataset_id,mode,enabled,consent_required")
      .single();

    if (error) {
      /**
       * ── "TENTE DE NOVO" PARA UMA PORTA QUE NUNCA VAI ABRIR ─────────────────
       *
       * Medido no banco vivo em 02/08/2026:
       *
       *     CHECK ((mode = 'test'::text))
       *
       * A migration que abre `mode` para `('test','live')`
       * (20260802230000_modo_de_producao_aceito_no_capi.sql) está ESCRITA e NÃO
       * APLICADA. Enquanto for assim, este `update` volta com 23514 —
       * `check_violation` — em toda tentativa.
       *
       * O que a rota fazia com isso: devolvia `error.message` cru e status 503.
       * As duas coisas erradas, e cada uma por um motivo:
       *
       * - a MENSAGEM era *"new row for relation ... violates check constraint
       *   meta_conversion_configs_mode_check"*. Quem lê é o diretor, no painel.
       *   Não há nada aí que ele possa fazer, e o texto ainda expõe nome de
       *   tabela e de constraint a quem só pediu para ligar a otimização.
       * - o STATUS 503 quer dizer "indisponível agora, tente de novo". Mas a
       *   condição não é transitória: nenhuma quantidade de cliques aplica um
       *   `alter table`. 503 aqui é um convite a bater na mesma porta para
       *   sempre — e o pior desfecho é o diretor concluir que o produto está
       *   instável, quando falta um passo de deploy.
       *
       * 409 diz o que é: o pedido está correto, o banco é que ainda não aceita.
       * E a mensagem nomeia o passo que destrava, porque é a única coisa acionável.
       */
      const constraintRecusou = error.code === "23514";
      if (constraintRecusou) {
        return NextResponse.json(
          {
            error:
              "O banco ainda não aceita o modo produção. Falta aplicar a migration " +
              "20260802230000_modo_de_producao_aceito_no_capi.sql, que libera mode='live'. " +
              "Enquanto isso o Dataset segue em teste e nenhuma conversão conta para a otimização.",
            pendencia: "migration_nao_aplicada",
          },
          { status: 409 },
        );
      }
      // Demais falhas continuam 503 — essas, sim, podem passar sozinhas. Mas sem
      // devolver o texto do Postgres para a tela.
      logger.error("meta.conversion_go_live.falhou", { code: error.code, message: error.message });
      return NextResponse.json({ error: "Não foi possível promover o Dataset agora." }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      data,
      aviso: "A partir de agora as conversões contam para a otimização das campanhas. Voltar para teste é reconfigurar o Dataset.",
    });
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
