"use client";

import { FormEvent, useEffect, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import {
  AtlasCard,
  AtlasCardHeader,
  AtlasMetric,
} from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Source = {
  id: string;
  page_id: string;
  form_id: string | null;
  name: string;
  active: boolean;
  default_owner_id: string | null;
  conversion_sharing_enabled: boolean;
  consent_basis: string | null;
};
type ConversionConfig = {
  dataset_id: string;
  mode: "test";
  enabled: boolean;
  test_event_code: string | null;
  consent_required: boolean;
} | null;
type CampaignIntelligence = {
  rank: number;
  campaignId: string;
  campaignName?: string;
  total: number;
  contacted: number;
  qualified: number;
  visits: number;
  proposals: number;
  converted: number;
  buyersElsewhere: number;
  averageScore: number;
  averageResponseMinutes: number | null;
  responseCoverage: number;
  sla5Rate: number;
  sla15Rate: number;
  qualityRate: number;
  visitRate: number;
  proposalRate: number;
  conversionRate: number;
  performanceScore: number;
  spend?: number | null;
  cpl?: number | null;
  costPerQualifiedLead?: number | null;
  ctr?: number | null;
  sampleStatus: "insufficient" | "learning" | "reliable";
  confidencePercent: number;
  scaleEligible: boolean;
  scaleBlockers: string[];
  recommendation: string;
};
type DailyReport = {
  id: string;
  report_date: string;
  status: "ready" | "reviewed";
  payload: {
    generatedAt: string;
    periods: {
      day: CampaignIntelligence[];
      week: CampaignIntelligence[];
      month: CampaignIntelligence[];
    };
    recommendations: Array<{
      campaignId: string;
      recommendation: string;
      qualityRate: number;
      conversionRate: number;
      decisionRequired: boolean;
    }>;
    topSignals: Array<{ signal: string; count: number }>;
    aiConsensus: Array<{
      provider: string;
      model: string;
      analysis: string;
      citations: string[];
    }>;
    delivery: Record<string, number>;
    governance: { decisionRole: "director"; automaticCampaignChanges: false };
  };
};
type InsightsResult = {
  status: "passed" | "mismatch";
  accountIdMasked: string;
  readOnly: boolean;
  comparedAt: string;
  periods: Array<{
    key: "day" | "week" | "month";
    actual: { spend: number; impressions: number; clicks: number };
    difference: { spend: number; impressions: number; clicks: number };
    matches: boolean;
    campaigns: number;
  }>;
};
type DailyReportTest = {
  status: "passed";
  reportDate: string;
  reportId: string;
  reportCount: number;
  duplicateWorkPrevented: boolean;
  reportStatus: string;
  generatedAt: string | null;
  testedAt: string;
};
type Payload = {
  sources: Source[];
  summary: Record<string, number>;
  conversionConfig: ConversionConfig;
  conversionCandidates: Array<{
    id: string;
    name: string;
    hasEmail: boolean;
    hasPhone: boolean;
  }>;
  conversionSummary: Record<string, number>;
  conversionFunnel: Record<string, number>;
  internalFunnel: Record<string, number>;
  funnelInsights: {
    qualifiedRate: number;
    visitRate: number;
    proposalRate: number;
    convertedRate: number;
    lost: number;
    buyerProfiles: number;
  };
  audienceRecommendations: Array<{ signal: string; count: number }>;
  campaignIntelligence: CampaignIntelligence[];
  dailyReports: DailyReport[];
  readiness: {
    webhookSecret: boolean;
    graphToken: boolean;
    conversionsToken: boolean;
    adsInsights: boolean;
    cronWorker: boolean;
  };
  canManage: boolean;
  canDecide: boolean;
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[.035] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/40";
const scaleBlockerLabels: Record<string, string> = {
  amostra_menor_que_50: "menos de 50 leads",
  cobertura_de_atendimento_menor_que_60: "cobertura de atendimento abaixo de 60%",
  qualidade_menor_que_20: "qualidade abaixo de 20%",
  conversao_menor_que_5: "conversão abaixo de 5%",
};

export default function MetaIntegration() {
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState({
    name: "",
    pageId: "",
    formId: "",
    conversionSharingEnabled: false,
    consentBasis: "",
  });
  const [conversion, setConversion] = useState({
    datasetId: "",
    testEventCode: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [webhookTest, setWebhookTest] = useState({
    sourceId: "",
    leadgenId: "",
  });
  const [webhookResult, setWebhookResult] = useState<{
    leadId: string;
    leadCount: number;
    attributionPreserved: boolean;
    duplicateDelivery: { duplicates?: number };
    testedAt: string;
  } | null>(null);
  const [conversionLeadId, setConversionLeadId] = useState("");
  const [conversionResult, setConversionResult] = useState<{
    mode: string;
    productionEnabled: boolean;
    datasetIdMasked: string;
    eventId: string;
    eventName: string;
    eventsReceived: number;
    traceId: string | null;
    deliveredAt: string;
  } | null>(null);
  const [insightsReference, setInsightsReference] = useState({
    daySpend: "",
    dayImpressions: "",
    dayClicks: "",
    weekSpend: "",
    weekImpressions: "",
    weekClicks: "",
    monthSpend: "",
    monthImpressions: "",
    monthClicks: "",
  });
  const [insightsResult, setInsightsResult] = useState<InsightsResult | null>(
    null,
  );
  const [dailyReportTest, setDailyReportTest] =
    useState<DailyReportTest | null>(null);

  async function request(init?: RequestInit) {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.access_token) throw new Error("Sessão expirada.");
    const response = await fetch("/api/v1/integrations/meta", {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.access_token}`,
      },
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Falha na integração Meta.");
    return body;
  }

  async function load() {
    try {
      const payload = (await request()) as Payload;
      setData(payload);
      if (payload.conversionConfig)
        setConversion({
          datasetId: payload.conversionConfig.dataset_id,
          testEventCode: payload.conversionConfig.test_event_code || "",
        });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha na integração Meta.",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveSource(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await request({ method: "POST", body: JSON.stringify(form) });
      setForm({
        name: "",
        pageId: "",
        formId: "",
        conversionSharingEnabled: false,
        consentBasis: "",
      });
      setNotice("Origem conectada com segurança.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar fonte.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveConversion(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await request({
        method: "POST",
        body: JSON.stringify({ action: "conversion_config", ...conversion }),
      });
      setNotice(
        "Conversions API ativada em ambiente de teste. Produção continua bloqueada.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao configurar conversões.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function reviewReport(reportId: string) {
    setSaving(true);
    setError("");
    try {
      await request({
        method: "POST",
        body: JSON.stringify({ action: "review_daily_report", reportId }),
      });
      setNotice("Revisão diária registrada pela diretoria.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao revisar relatório.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const source = data?.sources.find(
        (item) => item.id === webhookTest.sourceId,
      );
      if (!source?.form_id)
        throw new Error("Selecione uma origem com formulário específico.");
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch("/api/v1/integrations/meta/webhook-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          pageId: source.page_id,
          formId: source.form_id,
          leadgenId: webhookTest.leadgenId,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Ensaio Meta falhou.");
      setWebhookResult(body.data);
      setNotice("Webhook assinado, deduplicado e atribuído corretamente.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ensaio Meta falhou.");
    } finally {
      setSaving(false);
    }
  }

  async function testConversion(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        "/api/v1/integrations/meta/conversion-test",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ leadId: conversionLeadId }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Ensaio da Conversions API falhou.",
        );
      setConversionResult(body.data);
      setNotice(
        "Evento confirmado no dataset de teste; produção permanece bloqueada.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Ensaio da Conversions API falhou.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function testInsights(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const period = (key: "day" | "week" | "month") => ({
      spend: Number(insightsReference[`${key}Spend`]),
      impressions: Number(insightsReference[`${key}Impressions`]),
      clicks: Number(insightsReference[`${key}Clicks`]),
    });
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch("/api/v1/integrations/meta/insights-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          periods: {
            day: period("day"),
            week: period("week"),
            month: period("month"),
          },
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Comparação do Meta Insights falhou.",
        );
      setInsightsResult(body.data);
      setNotice(
        body.data.status === "passed"
          ? "Meta Insights confere nos três períodos."
          : "Comparação concluída com diferenças; revise conta, período e atualização do Ads Manager.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Comparação do Meta Insights falhou.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function testDailyReport() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        "/api/v1/integrations/meta/daily-report-test",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Ensaio do relatório diário falhou.",
        );
      setDailyReportTest(body.data);
      setNotice(
        "Duas execuções concluídas com um único relatório e sem repetir custo de IA.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Ensaio do relatório diário falhou.",
      );
    } finally {
      setSaving(false);
    }
  }

  const ready = data ? Object.values(data.readiness).filter(Boolean).length : 0;
  return (
    <div className="space-y-6 pb-12">
      <section className="atlas-grid-glow rounded-[30px] border border-blue-400/15 bg-gradient-to-br from-blue-500/[.14] via-violet-500/[.08] to-transparent p-6 sm:p-8">
        <div className="flex flex-wrap gap-2">
          <AtlasBadge tone="info">META LEAD ADS</AtlasBadge>
          <AtlasBadge tone="violet">CICLO DE APRENDIZADO</AtlasBadge>
          <AtlasBadge tone="warning">CONVERSÕES EM TESTE</AtlasBadge>
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">
          Da campanha ao CRM, do CRM à otimização.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Receba leads reais, preserve a origem e devolva sinais de qualidade à
          Meta com consentimento, rastreabilidade e controle humano.
        </p>
      </section>
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AtlasMetric
          label="Prontidão técnica"
          value={data ? `${ready}/5` : "—"}
          detail="Webhook, Insights, tokens e worker"
          trend="META"
          tone={ready === 5 ? "green" : "amber"}
        />
        <AtlasMetric
          label="Fontes ativas"
          value={data?.sources.filter((item) => item.active).length ?? "—"}
          detail="Páginas e formulários"
          trend="LEADS"
          tone="blue"
        />
        <AtlasMetric
          label="Leads importados"
          value={data?.summary.imported ?? 0}
          detail="Últimos 100 eventos"
          trend="CRM"
          tone="green"
        />
        <AtlasMetric
          label="Sinais entregues"
          value={data?.conversionSummary.delivered ?? 0}
          detail="Somente eventos de teste"
          trend="CAPI"
          tone="violet"
        />
        <AtlasMetric
          label="Perfis compradores"
          value={data?.funnelInsights.buyerProfiles ?? "—"}
          detail="Compraram em outro lugar"
          trend="LEARN"
          tone="rose"
        />
      </section>
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[.07] p-4 text-sm leading-6 text-amber-100">
        <strong>Governança de campanhas:</strong> a IA e o time comercial
        produzem evidências e recomendações. Somente o diretor pode autorizar
        decisões de público, orçamento, criativo, escala ou ativação.
      </div>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 24 · Webhook Meta"
          title="Comprovar entrada única e atribuição"
          description="Use um lead criado na ferramenta oficial de testes da Meta. O Atlas assina e entrega o mesmo evento duas vezes, importa os dados reais e comprova que apenas uma lead foi criada."
        />
        <form
          onSubmit={testWebhook}
          className="grid gap-3 p-5 sm:p-6 lg:grid-cols-[1fr_1fr_auto]"
        >
          <select
            required
            value={webhookTest.sourceId}
            onChange={(event) =>
              setWebhookTest({ ...webhookTest, sourceId: event.target.value })
            }
            className={inputClass}
          >
            <option value="">Página e formulário cadastrados</option>
            {data?.sources
              .filter((source) => source.active && source.form_id)
              .map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name} · formulário {source.form_id}
                </option>
              ))}
          </select>
          <input
            required
            inputMode="numeric"
            pattern="[0-9]+"
            value={webhookTest.leadgenId}
            onChange={(event) =>
              setWebhookTest({ ...webhookTest, leadgenId: event.target.value })
            }
            placeholder="ID do lead oficial de teste"
            className={inputClass}
          />
          <button
            disabled={!data?.canDecide || saving}
            className="atlas-button-primary min-w-48 disabled:opacity-40"
          >
            {saving ? "Comprovando..." : "Executar ensaio real"}
          </button>
        </form>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {!data?.canDecide ? (
            <p className="text-xs text-amber-300">
              A execução e a evidência deste ensaio são exclusivas da diretoria.
            </p>
          ) : null}
          {webhookResult ? (
            <div className="grid gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] p-4 sm:grid-cols-3">
              <div>
                <span className="text-xs text-emerald-200/70">
                  Leads criadas
                </span>
                <strong className="mt-1 block text-2xl text-white">
                  {webhookResult.leadCount}
                </strong>
              </div>
              <div>
                <span className="text-xs text-emerald-200/70">
                  Entrega repetida
                </span>
                <strong className="mt-1 block text-sm text-white">
                  {(webhookResult.duplicateDelivery.duplicates ?? 0) >= 1
                    ? "Duplicidade bloqueada"
                    : "Validada"}
                </strong>
              </div>
              <div>
                <span className="text-xs text-emerald-200/70">Atribuição</span>
                <strong className="mt-1 block text-sm text-white">
                  {webhookResult.attributionPreserved
                    ? "Origem preservada"
                    : "Revisar"}
                </strong>
                <p className="mt-1 text-[10px] text-slate-500">
                  Lead {webhookResult.leadId}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-5 text-slate-500">
              O ID deve vir de um lead oficial de teste da Meta e permanecer
              disponível para leitura pelo token configurado na Hostinger.
            </p>
          )}
        </div>
      </AtlasCard>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 25 · Conversions API"
          title="Confirmar evento no dataset de teste"
          description="O Atlas usa uma lead Meta consentida, envia um evento real pela fila segura da Hostinger e exige a confirmação da Meta. A produção continua tecnicamente bloqueada."
        />
        <form
          onSubmit={testConversion}
          className="grid gap-3 p-5 sm:p-6 lg:grid-cols-[1fr_auto]"
        >
          <select
            required
            value={conversionLeadId}
            onChange={(event) => setConversionLeadId(event.target.value)}
            className={inputClass}
          >
            <option value="">
              Lead Meta com consentimento e identificador
            </option>
            {data?.conversionCandidates.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name} ·{" "}
                {lead.hasEmail && lead.hasPhone
                  ? "e-mail e telefone"
                  : lead.hasEmail
                    ? "e-mail"
                    : "telefone"}
              </option>
            ))}
          </select>
          <button
            disabled={
              !data?.canDecide || saving || !data?.conversionConfig?.enabled
            }
            className="atlas-button-primary min-w-52 disabled:opacity-40"
          >
            {saving ? "Consultando Meta..." : "Executar teste CAPI"}
          </button>
        </form>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {!data?.conversionConfig?.enabled ? (
            <p className="text-xs text-amber-300">
              Informe o Dataset ID e o código de evento de teste no cartão
              Conversions API para liberar o ensaio.
            </p>
          ) : !data?.conversionCandidates.length ? (
            <p className="text-xs text-amber-300">
              Nenhuma lead Meta possui simultaneamente consentimento e e-mail ou
              telefone elegível.
            </p>
          ) : null}
          {conversionResult ? (
            <div className="grid gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] p-4 sm:grid-cols-3">
              <div>
                <span className="text-xs text-emerald-200/70">
                  Meta confirmou
                </span>
                <strong className="mt-1 block text-2xl text-white">
                  {conversionResult.eventsReceived} evento
                </strong>
              </div>
              <div>
                <span className="text-xs text-emerald-200/70">Ambiente</span>
                <strong className="mt-1 block text-sm text-white">
                  {conversionResult.mode === "test" &&
                  !conversionResult.productionEnabled
                    ? "Teste · produção bloqueada"
                    : "Revisar"}
                </strong>
                <p className="mt-1 text-[10px] text-slate-500">
                  Dataset {conversionResult.datasetIdMasked}
                </p>
              </div>
              <div>
                <span className="text-xs text-emerald-200/70">
                  Rastreabilidade
                </span>
                <strong className="mt-1 block text-sm text-white">
                  {conversionResult.traceId
                    ? "Trace Meta registrado"
                    : "Evento registrado"}
                </strong>
                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {conversionResult.eventId}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </AtlasCard>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 26 · Meta Insights"
          title="Conferir hoje, 7 dias e 30 dias"
          description="Copie do Ads Manager o gasto, as impressões e os cliques de cada período. O Atlas consulta a conta em modo somente leitura e mostra qualquer diferença antes da homologação."
        />
        <form onSubmit={testInsights} className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-3 xl:grid-cols-3">
            {(
              [
                { key: "day", label: "Hoje" },
                { key: "week", label: "Últimos 7 dias" },
                { key: "month", label: "Últimos 30 dias" },
              ] as const
            ).map(({ key, label }) => (
              <fieldset
                key={key}
                className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
              >
                <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-sky-300">
                  {label}
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={insightsReference[`${key}Spend`]}
                    onChange={(event) =>
                      setInsightsReference({
                        ...insightsReference,
                        [`${key}Spend`]: event.target.value,
                      })
                    }
                    placeholder="Gasto (R$)"
                    className={inputClass}
                  />
                  <input
                    required
                    min="0"
                    step="1"
                    type="number"
                    value={insightsReference[`${key}Impressions`]}
                    onChange={(event) =>
                      setInsightsReference({
                        ...insightsReference,
                        [`${key}Impressions`]: event.target.value,
                      })
                    }
                    placeholder="Impressões"
                    className={inputClass}
                  />
                  <input
                    required
                    min="0"
                    step="1"
                    type="number"
                    value={insightsReference[`${key}Clicks`]}
                    onChange={(event) =>
                      setInsightsReference({
                        ...insightsReference,
                        [`${key}Clicks`]: event.target.value,
                      })
                    }
                    placeholder="Cliques"
                    className={inputClass}
                  />
                </div>
              </fieldset>
            ))}
          </div>
          <button
            disabled={
              !data?.canDecide || saving || !data?.readiness.adsInsights
            }
            className="atlas-button-primary w-full disabled:opacity-40"
          >
            {saving ? "Comparando períodos..." : "Comparar com Meta Ads"}
          </button>
          {!data?.readiness.adsInsights ? (
            <p className="text-xs text-amber-300">
              Conta e token de leitura do Meta Ads ainda não estão configurados
              na Hostinger.
            </p>
          ) : null}
        </form>
        {insightsResult ? (
          <div className="grid gap-3 px-5 pb-5 sm:px-6 sm:pb-6 lg:grid-cols-3">
            {insightsResult.periods.map((period) => (
              <div
                key={period.key}
                className={`rounded-2xl border p-4 ${period.matches ? "border-emerald-400/20 bg-emerald-400/[.07]" : "border-amber-400/20 bg-amber-400/[.07]"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-white">
                    {period.key === "day"
                      ? "Hoje"
                      : period.key === "week"
                        ? "7 dias"
                        : "30 dias"}
                  </strong>
                  <AtlasBadge tone={period.matches ? "success" : "warning"}>
                    {period.matches ? "CONFERE" : "DIFERENÇA"}
                  </AtlasBadge>
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  R$ {period.actual.spend.toFixed(2)} ·{" "}
                  {period.actual.impressions.toLocaleString("pt-BR")} impressões
                  · {period.actual.clicks.toLocaleString("pt-BR")} cliques
                </p>
                <p className="mt-2 text-[10px] text-slate-500">
                  Diferença: R$ {period.difference.spend.toFixed(2)} ·{" "}
                  {period.difference.impressions} impressões ·{" "}
                  {period.difference.clicks} cliques · {period.campaigns}{" "}
                  campanhas
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </AtlasCard>
      <section className="grid gap-6 xl:grid-cols-2">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Configuração segura"
            title="Fontes de leads"
            description="Cada origem controla separadamente se seus dados podem alimentar conversões."
          />
          <div className="p-5 sm:p-6">
            {!data ? (
              <AtlasSkeleton className="h-48" />
            ) : !data.sources.length ? (
              <AtlasEmpty
                title="Nenhuma fonte cadastrada"
                description="Cadastre a primeira Página e Formulário para aceitar webhooks."
              />
            ) : (
              <div className="space-y-3">
                {data.sources.map((source) => (
                  <div
                    key={source.id}
                    className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <strong className="text-white">{source.name}</strong>
                        <p className="mt-1 text-xs text-slate-500">
                          Página {source.page_id} · Formulário{" "}
                          {source.form_id || "todos"}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <AtlasBadge
                          tone={source.active ? "success" : "warning"}
                        >
                          {source.active ? "ATIVA" : "PAUSADA"}
                        </AtlasBadge>
                        <AtlasBadge
                          tone={
                            source.conversion_sharing_enabled
                              ? "info"
                              : "warning"
                          }
                        >
                          {source.conversion_sharing_enabled
                            ? "SINAL AUTORIZADO"
                            : "SEM COMPARTILHAMENTO"}
                        </AtlasBadge>
                      </div>
                    </div>
                    {source.consent_basis ? (
                      <p className="mt-3 text-xs leading-5 text-slate-400">
                        Base registrada: {source.consent_basis}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </AtlasCard>
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Nova origem"
            title="Conectar Página/Formulário"
            description="O compartilhamento com conversões nasce desligado e depende de base registrada."
          />
          <form onSubmit={saveSource} className="space-y-3 p-5 sm:p-6">
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              placeholder="Nome da origem, ex.: ARVO Julho"
              className={inputClass}
            />
            <input
              required
              inputMode="numeric"
              value={form.pageId}
              onChange={(event) =>
                setForm({ ...form, pageId: event.target.value })
              }
              placeholder="ID da Página Meta"
              className={inputClass}
            />
            <input
              inputMode="numeric"
              value={form.formId}
              onChange={(event) =>
                setForm({ ...form, formId: event.target.value })
              }
              placeholder="ID do formulário (opcional)"
              className={inputClass}
            />
            <label className="flex items-start gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.conversionSharingEnabled}
                onChange={(event) =>
                  setForm({
                    ...form,
                    conversionSharingEnabled: event.target.checked,
                  })
                }
                className="mt-1"
              />
              <span>
                Esta origem possui autorização válida para enviar sinais de
                conversão à Meta.
              </span>
            </label>
            {form.conversionSharingEnabled ? (
              <textarea
                required
                value={form.consentBasis}
                onChange={(event) =>
                  setForm({ ...form, consentBasis: event.target.value })
                }
                placeholder="Registre a base de autorização, política ou formulário aplicado"
                className={`${inputClass} min-h-24 resize-y`}
              />
            ) : null}
            <button
              disabled={!data?.canManage || saving}
              className="atlas-button-primary w-full disabled:opacity-40"
            >
              {saving ? "Salvando..." : "Ativar fonte de leads"}
            </button>
            {!data?.canManage ? (
              <p className="text-xs text-amber-300">
                Somente gestão pode alterar esta integração.
              </p>
            ) : null}
          </form>
        </AtlasCard>
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Conversions API"
            title="Validar retorno de qualidade"
            description="O sistema aceita exclusivamente o código de eventos de teste nesta etapa de homologação."
          />
          <form onSubmit={saveConversion} className="space-y-3 p-5 sm:p-6">
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[.07] p-4 text-xs leading-5 text-amber-200">
              Modo produção bloqueado. Nenhum sinal real será usado para
              otimizar campanhas até a homologação e o aceite explícito.
            </div>
            <input
              required
              inputMode="numeric"
              value={conversion.datasetId}
              onChange={(event) =>
                setConversion({ ...conversion, datasetId: event.target.value })
              }
              placeholder="Dataset ID da Meta"
              className={inputClass}
            />
            <input
              required
              value={conversion.testEventCode}
              onChange={(event) =>
                setConversion({
                  ...conversion,
                  testEventCode: event.target.value,
                })
              }
              placeholder="Código de evento de teste"
              className={inputClass}
            />
            <button
              disabled={!data?.canManage || saving}
              className="atlas-button-primary w-full disabled:opacity-40"
            >
              {saving ? "Validando..." : "Ativar validação em teste"}
            </button>
          </form>
        </AtlasCard>
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Saúde da conexão"
            title="Checklist e aprendizado"
            description="Acompanhe a conexão, a conversão acumulada e os sinais produzidos por avanços reais."
          />
          <div className="space-y-2 p-5 text-xs text-slate-400 sm:p-6">
            {data ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {[
                    ["Lead", "Novo lead", null],
                    ["Contact", "Contato", null],
                    [
                      "QualifiedLead",
                      "Qualificado",
                      data.funnelInsights.qualifiedRate,
                    ],
                    ["Schedule", "Visita", data.funnelInsights.visitRate],
                    [
                      "SubmitApplication",
                      "Proposta",
                      data.funnelInsights.proposalRate,
                    ],
                    [
                      "ConvertedLead",
                      "Convertido",
                      data.funnelInsights.convertedRate,
                    ],
                  ].map(([key, label, rate]) => (
                    <div
                      key={String(key)}
                      className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"
                    >
                      <span className="block text-slate-500">{label}</span>
                      <div className="mt-1 flex items-end justify-between gap-2">
                        <strong className="block text-lg text-white">
                          {data.conversionFunnel[String(key)] ?? 0}
                        </strong>
                        {typeof rate === "number" ? (
                          <span className="text-emerald-300">
                            {rate}% dos leads
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-400/15 bg-rose-400/[.06] p-3">
                  <span>
                    Perdas registradas somente para aprendizado interno
                  </span>
                  <strong className="text-base text-rose-200">
                    {data.funnelInsights.lost}
                  </strong>
                </div>
                {Object.entries(data.readiness).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex justify-between rounded-xl bg-white/[.03] p-3"
                  >
                    <span>
                      {key === "webhookSecret"
                        ? "Assinatura do webhook"
                        : key === "graphToken"
                          ? "Token de captura de leads"
                          : key === "conversionsToken"
                            ? "Token de conversões"
                            : "Worker Hostinger"}
                    </span>
                    <AtlasBadge tone={value ? "success" : "warning"}>
                      {value ? "PRONTO" : "PENDENTE"}
                    </AtlasBadge>
                  </div>
                ))}
              </>
            ) : (
              <AtlasSkeleton className="h-48" />
            )}
          </div>
        </AtlasCard>
      </section>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Audience intelligence"
          title="O que o time comercial está ensinando"
          description="Sinais agregados dos acompanhamentos para orientar público, oferta e criativos. Nenhuma descrição ou dado pessoal aparece aqui."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">
          {data?.audienceRecommendations.length ? (
            data.audienceRecommendations.map((item, index) => (
              <div
                key={item.signal}
                className="rounded-2xl border border-violet-400/10 bg-violet-400/[.04] p-4"
              >
                <span className="text-[10px] uppercase tracking-wider text-violet-300">
                  Prioridade {index + 1}
                </span>
                <strong className="mt-2 block capitalize text-white">
                  {item.signal.replaceAll("_", " ")}
                </strong>
                <p className="mt-1 text-xs text-slate-500">
                  {item.count} acompanhamentos
                </p>
              </div>
            ))
          ) : (
            <div className="sm:col-span-2 lg:col-span-5">
              <AtlasEmpty
                title="Aguardando acompanhamentos"
                description="Os motivos mais frequentes aparecerão quando os corretores registrarem preço, região, financiamento, prazo, produto ou concorrência."
              />
            </div>
          )}
        </div>
      </AtlasCard>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 37 · Campaign intelligence"
          title="Ranking comercial com trava de escala"
          description="A superintendência compara qualidade e conversão sem inventar custo ou ROAS; escala só aparece com 50+ leads e operação comercial comprovada. A decisão continua exclusiva do diretor."
        />
        <div className="overflow-x-auto p-5 sm:p-6">
          {data?.campaignIntelligence.length ? (
            <table className="w-full min-w-[1060px] text-left text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-white/[.07]">
                  <th className="p-3">Posição</th>
                  <th className="p-3">Campanha</th>
                  <th className="p-3">Amostra</th>
                  <th className="p-3">Performance</th>
                  <th className="p-3">Qualidade</th>
                  <th className="p-3">Visitas</th>
                  <th className="p-3">Propostas</th>
                  <th className="p-3">Conversão</th>
                  <th className="p-3">Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {data.campaignIntelligence.map((campaign) => (
                  <tr
                    key={campaign.campaignId}
                    className="border-b border-white/[.05] align-top"
                  >
                    <td className="p-3 text-xl font-semibold text-violet-300">
                      #{campaign.rank}
                    </td>
                    <td className="p-3">
                      <strong className="text-white">
                        {campaign.campaignId === "sem-campanha"
                          ? "Origem não identificada"
                          : campaign.campaignName || campaign.campaignId}
                      </strong>
                      <p className="mt-1 text-slate-600">
                        {campaign.total} leads · score médio{" "}
                        {campaign.averageScore}
                      </p>
                    </td>
                    <td className="p-3">
                      <AtlasBadge
                        tone={
                          campaign.sampleStatus === "reliable"
                            ? "success"
                            : campaign.sampleStatus === "learning"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {campaign.sampleStatus === "reliable"
                          ? "CONFIÁVEL"
                          : campaign.sampleStatus === "learning"
                            ? "APRENDENDO"
                            : "INSUFICIENTE"}
                      </AtlasBadge>
                      <p className="mt-2 text-[10px] text-slate-500">{campaign.confidencePercent}% de confiança</p>
                    </td>
                    <td className="p-3 text-lg font-semibold text-white">
                      {campaign.performanceScore}
                    </td>
                    <td className="p-3 text-slate-300">
                      {campaign.qualityRate}%
                    </td>
                    <td className="p-3 text-slate-300">
                      {campaign.visitRate}%
                    </td>
                    <td className="p-3 text-slate-300">
                      {campaign.proposalRate}%
                    </td>
                    <td className="p-3 font-semibold text-emerald-300">
                      {campaign.conversionRate}%
                    </td>
                    <td className="max-w-sm p-3 leading-5 text-slate-400">
                      {campaign.recommendation}
                      <div className="mt-2"><AtlasBadge tone={campaign.scaleEligible ? "success" : "neutral"}>{campaign.scaleEligible ? "ELEGÍVEL PARA ANÁLISE DE ESCALA" : "ESCALA BLOQUEADA"}</AtlasBadge></div>
                      {!campaign.scaleEligible ? <p className="mt-2 text-[10px] text-slate-600">Pendências: {campaign.scaleBlockers.map((blocker) => scaleBlockerLabels[blocker] || blocker).join(" · ")}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <AtlasEmpty
              title="Sem amostra de campanhas"
              description="Quando os leads reais entrarem com o ID da campanha, o Atlas comparará qualidade, visitas, propostas e conversão."
            />
          )}
        </div>
      </AtlasCard>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 32 · Cron das 08h"
          title="Comprovar relatório diário único"
          description="Executa o cron duas vezes. A primeira gera ou reutiliza o relatório do dia; a segunda encerra sem criar outra linha nem repetir consultas e custos de IA."
        />
        <div className="p-5 sm:p-6">
          <button
            disabled={!data?.canDecide || saving}
            onClick={() => void testDailyReport()}
            className="atlas-button-primary w-full disabled:opacity-40"
          >
            {saving ? "Executando duas vezes..." : "Executar ensaio de idempotência"}
          </button>
          {dailyReportTest ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] p-4 sm:grid-cols-3">
              <div><span className="text-xs text-emerald-200/70">Relatórios no dia</span><strong className="mt-1 block text-2xl text-white">{dailyReportTest.reportCount}</strong></div>
              <div><span className="text-xs text-emerald-200/70">Segunda execução</span><strong className="mt-1 block text-sm text-white">{dailyReportTest.duplicateWorkPrevented ? "Trabalho duplicado evitado" : "Revisar"}</strong></div>
              <div><span className="text-xs text-emerald-200/70">Situação</span><strong className="mt-1 block text-sm text-white">{dailyReportTest.reportStatus === "reviewed" ? "Revisado" : "Pronto para o diretor"}</strong><p className="mt-1 text-[10px] text-slate-500">{dailyReportTest.reportDate}</p></div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">O ensaio é exclusivo da diretoria e utiliza o worker configurado na Hostinger.</p>
          )}
        </div>
      </AtlasCard>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Diretoria · diário"
          title="Relatórios para decisão"
          description="Resumo das últimas 24 horas, gerado diariamente na Hostinger. Recomendações nunca executam mudanças sozinhas."
        />
        <div className="space-y-4 p-5 sm:p-6">
          {!data ? (
            <AtlasSkeleton className="h-48" />
          ) : !data.canDecide ? (
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5 text-sm text-slate-400">
              Relatórios decisórios são visíveis exclusivamente para a
              diretoria. O restante do time continua contribuindo por meio dos
              acompanhamentos.
            </div>
          ) : !data.dailyReports.length ? (
            <AtlasEmpty
              title="Primeiro relatório ainda não gerado"
              description="O worker diário consolidará campanhas, sinais comerciais, qualidade e recomendações para sua revisão."
            />
          ) : (
            data.dailyReports.map((report) => (
              <article
                key={report.id}
                className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      {new Date(
                        `${report.report_date}T12:00:00`,
                      ).toLocaleDateString("pt-BR")}
                    </p>
                    <h3 className="mt-1 font-semibold text-white">
                      Relatório diário de campanhas
                    </h3>
                  </div>
                  <AtlasBadge
                    tone={report.status === "reviewed" ? "success" : "warning"}
                  >
                    {report.status === "reviewed"
                      ? "REVISADO"
                      : "AGUARDA DIRETOR"}
                  </AtlasBadge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {report.payload.recommendations.length ? (
                    report.payload.recommendations.slice(0, 4).map((item) => (
                      <div
                        key={item.campaignId}
                        className="rounded-xl bg-white/[.03] p-3"
                      >
                        <strong className="text-xs text-white">
                          Campanha {item.campaignId}
                        </strong>
                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          {item.recommendation}
                        </p>
                        <p className="mt-2 text-[10px] text-slate-500">
                          Qualidade {item.qualityRate}% · Conversão{" "}
                          {item.conversionRate}%
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">
                      Sem recomendações com amostra suficiente neste período.
                    </p>
                  )}
                </div>
                {report.status === "ready" ? (
                  <button
                    disabled={saving}
                    onClick={() => void reviewReport(report.id)}
                    className="atlas-button-primary mt-4 disabled:opacity-40"
                  >
                    Registrar revisão do diretor
                  </button>
                ) : null}
              </article>
            ))
          )}
        </div>
      </AtlasCard>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Estratégia Meta atual"
          title="Automação ampla, sinais comerciais precisos"
          description="Modelo recomendado para Advantage+ e otimização por leads de qualidade."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
          {[
            [
              "1",
              "Controle só o necessário",
              "Localização, idade mínima, idioma e exclusões operacionais ficam como limites; preferências comerciais entram como sugestões.",
            ],
            [
              "2",
              "Ensine com qualidade",
              "Qualificação, visita, proposta e conversão valem mais do que volume bruto de formulários.",
            ],
            [
              "3",
              "Diversifique criativos",
              "Preço, região, financiamento, prazo e produto orientam novas mensagens e formatos para a Meta testar.",
            ],
            [
              "4",
              "Homologue antes de escalar",
              "Compare qualidade, taxa por etapa e custo por lead qualificado antes de liberar qualquer automação real.",
            ],
          ].map(([step, title, description]) => (
            <div
              key={step}
              className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
            >
              <AtlasBadge tone="info">PASSO {step}</AtlasBadge>
              <strong className="mt-3 block text-white">{title}</strong>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {description}
              </p>
            </div>
          ))}
        </div>
      </AtlasCard>
      {data?.canDecide && data.dailyReports[0] ? (
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Inteligência comparativa"
            title="Hoje, semana e mês"
            description="Leitura temporal e pareceres independentes para reduzir decisões por impulso."
          />
          <div className="space-y-4 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <PeriodSummary
                label="Hoje"
                campaigns={data.dailyReports[0].payload.periods?.day || []}
              />
              <PeriodSummary
                label="7 dias"
                campaigns={data.dailyReports[0].payload.periods?.week || []}
              />
              <PeriodSummary
                label="30 dias"
                campaigns={data.dailyReports[0].payload.periods?.month || []}
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {(data.dailyReports[0].payload.aiConsensus || []).map(
                (analysis, index) => (
                  <div
                    key={`${analysis.provider}-${index}`}
                    className="rounded-xl border border-blue-400/10 bg-blue-400/[.035] p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs text-blue-200">
                        Parecer {index + 1} · {analysis.provider}
                      </strong>
                      <span className="text-[10px] text-slate-600">
                        {analysis.model}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-400">
                      {analysis.analysis}
                    </p>
                    {analysis.citations.length ? (
                      <p className="mt-2 text-[10px] text-slate-500">
                        {analysis.citations.length} fontes consultadas
                      </p>
                    ) : null}
                  </div>
                ),
              )}
            </div>
          </div>
        </AtlasCard>
      ) : null}
    </div>
  );
}

function PeriodSummary({
  label,
  campaigns,
}: {
  label: string;
  campaigns: CampaignIntelligence[];
}) {
  const top = campaigns[0];
  return (
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] p-4">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <strong className="mt-2 block text-xl text-white">
        {campaigns.reduce((sum, item) => sum + item.total, 0)} leads
      </strong>
      <p className="mt-1 text-xs text-slate-500">
        {top
          ? `Líder: ${top.campaignName || top.campaignId} · nota ${top.performanceScore}`
          : "Sem amostra no período"}
      </p>
      {top ? (
        <p className="mt-2 text-[10px] text-sky-300">
          SLA 5 min {top.sla5Rate}% · SLA 15 min {top.sla15Rate}% · cobertura{" "}
          {top.responseCoverage}%
        </p>
      ) : null}
      {top?.cpl !== null && top?.cpl !== undefined ? (
        <p className="mt-1 text-[10px] text-emerald-300">
          CPL R$ {top.cpl.toFixed(2)} · CPQL{" "}
          {top.costPerQualifiedLead
            ? `R$ ${top.costPerQualifiedLead.toFixed(2)}`
            : "—"}{" "}
          · CTR {top.ctr ?? 0}%
        </p>
      ) : (
        <p className="mt-2 text-[10px] text-amber-300">
          Insights financeiros ainda não conectados
        </p>
      )}
    </div>
  );
}
