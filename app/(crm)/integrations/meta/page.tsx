"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { supabase } from "@/lib/supabase";

/*
 * CC-6 · Central de configuração Meta.
 * Consolidações do redesign (mesmos dados e fetches, zero chamada nova):
 * - o herói (3 badges + slogan + parágrafo) re-explicava a página → PageHeader
 *   de uma linha; "CONVERSÕES EM TESTE" + banner amber "produção bloqueada" +
 *   descrição da Fase 25 + célula do resultado diziam o mesmo 4x → 1 badge no
 *   painel de Conversões + claim na faixa "Seguro por padrão" (o resultado do
 *   ensaio continua mostrando o ambiente, porque ali é evidência da API);
 * - a governança era repetida em 6 lugares (banner amber, notas "exclusivo da
 *   diretoria" em 3 ensaios, descrições de campanhas/relatórios/Andromeda) →
 *   faixa única "Seguro por padrão" + chips de alçada + title nos botões;
 * - prontidão dita 3x (métrica X/5, card checklist, avisos por ensaio) →
 *   espinha da jornada + tokens de credencial no rodapé do pulso; o checklist
 *   antigo rotulava adsInsights E cronWorker como "Worker Hostinger" (duas
 *   linhas idênticas) — agora cada credencial tem nome próprio;
 * - a linha de métricas duplicava números que a jornada já conta → cada passo
 *   da espinha carrega seu número (perfis compradores foi para o funil);
 * - estado da fonte em 2 badges + prosa → 1 badge + token mono "sinal ✓/—";
 * - sucesso de ensaio contado 2x (notice global + grid inline) → resultado
 *   honesto inline único (emerald), falha rose com code/details da API;
 * - "Diretoria · diário" + "Inteligência comparativa" (mesma fonte, mesmo
 *   público) → uma seção; escala com badge + linha de pendências → token único.
 */

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
  andromedaReadiness: {
    score: number;
    eligibleLeads: number;
    deliveryRate: number;
    dualIdentifierRate: number;
    feedbackCoverage: number;
    recommendations: string[];
    privacy: string;
  };
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

const scaleBlockerLabels: Record<string, string> = {
  amostra_menor_que_50: "menos de 50 leads",
  cobertura_de_atendimento_menor_que_60: "cobertura de atendimento abaixo de 60%",
  qualidade_menor_que_20: "qualidade abaixo de 20%",
  conversao_menor_que_5: "conversão abaixo de 5%",
};

/* Anel de foco padrão CC-6 para interativos que não são cc6-ghost-btn. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const field = `w-full rounded-xl border border-[rgba(148,163,184,.16)] bg-white/[.03] p-3 text-sm text-[#e8eef8] transition-colors placeholder:text-[#6b7890] hover:border-[rgba(148,163,184,.26)] ${focusRing}`;
const btnAccent = `rounded-xl border border-[rgba(75,141,248,.45)] bg-[rgba(75,141,248,.12)] px-4 py-2.5 text-xs font-semibold text-[#e8eef8] transition-colors hover:bg-[rgba(75,141,248,.2)] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;
const btnGhost = "cc6-ghost-btn disabled:cursor-not-allowed disabled:opacity-40";
const optionClass = "text-slate-900";
const sectionTitle = "mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]";
const sectionHint = "mt-1 text-xs leading-5 text-[#6b7890]";
const rowHover = "transition-colors hover:bg-[rgba(75,141,248,0.04)]";

/* Falha diagnosticável: o helper central da Graph devolve code/fbtrace dentro
   de error.details — antes o cliente descartava e mostrava só a frase genérica. */
type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: unknown };
};
function describeTestFailure(body: unknown, fallback: string): string {
  const raw = (body as ApiErrorBody | null)?.error;
  if (!raw) return fallback;
  const details =
    typeof raw.details === "string" && raw.details.trim()
      ? ` — ${raw.details}`
      : "";
  const code = raw.code ? ` [${raw.code}]` : "";
  return `${raw.message || fallback}${details}${code}`;
}

function ReadyToken({
  label,
  done,
  hint,
}: {
  label: string;
  done: boolean;
  hint: string;
}) {
  return (
    <span title={hint} className="cc6-num whitespace-nowrap">
      {label}{" "}
      {done ? (
        <span className="cc6-ok">✓</span>
      ) : (
        <span aria-label="pendente">—</span>
      )}
    </span>
  );
}

function TestFailure({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="cc6-sev-band cc6-panel-quiet mt-3 py-2.5 pl-4 pr-3 text-xs leading-5 text-[#fb7185]"
      style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
    >
      {message}
    </p>
  );
}

type JourneyStep = {
  id: string;
  index: string;
  label: string;
  metricLabel: string;
  value: string;
  state: "ok" | "warn" | "off";
  detail: string;
  href?: string;
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
  const [testErrors, setTestErrors] = useState<{
    webhook?: string;
    capi?: string;
    insights?: string;
    daily?: string;
  }>({});
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
    setTestErrors((prev) => ({ ...prev, webhook: undefined }));
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
        throw new Error(describeTestFailure(body, "Ensaio Meta falhou."));
      setWebhookResult(body.data);
      await load();
    } catch (cause) {
      setTestErrors((prev) => ({
        ...prev,
        webhook: cause instanceof Error ? cause.message : "Ensaio Meta falhou.",
      }));
    } finally {
      setSaving(false);
    }
  }

  async function testConversion(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    setTestErrors((prev) => ({ ...prev, capi: undefined }));
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
          describeTestFailure(body, "Ensaio da Conversions API falhou."),
        );
      setConversionResult(body.data);
      await load();
    } catch (cause) {
      setTestErrors((prev) => ({
        ...prev,
        capi:
          cause instanceof Error
            ? cause.message
            : "Ensaio da Conversions API falhou.",
      }));
    } finally {
      setSaving(false);
    }
  }

  async function testInsights(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    setTestErrors((prev) => ({ ...prev, insights: undefined }));
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
          describeTestFailure(body, "Comparação do Meta Insights falhou."),
        );
      setInsightsResult(body.data);
    } catch (cause) {
      setTestErrors((prev) => ({
        ...prev,
        insights:
          cause instanceof Error
            ? cause.message
            : "Comparação do Meta Insights falhou.",
      }));
    } finally {
      setSaving(false);
    }
  }

  async function testDailyReport() {
    setSaving(true);
    setError("");
    setNotice("");
    setTestErrors((prev) => ({ ...prev, daily: undefined }));
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
          describeTestFailure(body, "Ensaio do relatório diário falhou."),
        );
      setDailyReportTest(body.data);
      await load();
    } catch (cause) {
      setTestErrors((prev) => ({
        ...prev,
        daily:
          cause instanceof Error
            ? cause.message
            : "Ensaio do relatório diário falhou.",
      }));
    } finally {
      setSaving(false);
    }
  }

  const readiness = data?.readiness;
  const ready = data ? Object.values(data.readiness).filter(Boolean).length : 0;
  const activeSources = data
    ? data.sources.filter((item) => item.active).length
    : 0;
  const sharingSources = data
    ? data.sources.filter((item) => item.conversion_sharing_enabled).length
    : 0;
  const imported = data?.summary.imported ?? 0;
  const delivered = data?.conversionSummary.delivered ?? 0;
  const capiOn = Boolean(data?.conversionConfig?.enabled);
  const appTokens =
    (readiness?.webhookSecret ? 1 : 0) + (readiness?.graphToken ? 1 : 0);
  const journeyComplete =
    Boolean(data) &&
    appTokens === 2 &&
    imported > 0 &&
    activeSources > 0 &&
    Boolean(readiness?.conversionsToken) &&
    capiOn &&
    delivered > 0;

  /* Espinha da jornada — 4 estados derivados só de dados que a página já tem. */
  const journey: JourneyStep[] = [
    {
      id: "app",
      index: "01",
      label: "App e tokens",
      metricLabel: "segredos de captura ativos",
      value: data ? `${appTokens}/2` : "—",
      state: !data ? "off" : appTokens === 2 ? "ok" : "warn",
      detail: !data
        ? "Aguardando diagnóstico"
        : appTokens === 2
          ? "Assinatura e token prontos no servidor"
          : "Configurar segredo e token na Hostinger",
    },
    {
      id: "webhook",
      index: "02",
      label: "Webhook",
      metricLabel: "leads importados · 100 eventos",
      value: data ? String(imported) : "—",
      state: !data
        ? "off"
        : imported > 0
          ? "ok"
          : readiness?.webhookSecret
            ? "warn"
            : "off",
      detail: !data
        ? "Aguardando diagnóstico"
        : imported > 0
          ? "Entrada real comprovada e deduplicada"
          : readiness?.webhookSecret
            ? "Executar o ensaio real de entrada"
            : "Depende do segredo do passo 01",
      href: "#meta-webhook",
    },
    {
      id: "sources",
      index: "03",
      label: "Fontes de lead",
      metricLabel: "origens ativas",
      value: data ? String(activeSources) : "—",
      state: !data ? "off" : activeSources > 0 ? "ok" : "warn",
      detail: !data
        ? "Aguardando diagnóstico"
        : activeSources > 0
          ? `${sharingSources} autorizadas a devolver sinais`
          : "Cadastrar Página e Formulário",
      href: "#meta-sources",
    },
    {
      id: "capi",
      index: "04",
      label: "Conversões",
      metricLabel: "sinais entregues em teste",
      value: data ? String(delivered) : "—",
      state: !data
        ? "off"
        : !readiness?.conversionsToken
          ? "off"
          : !capiOn
            ? "warn"
            : delivered > 0
              ? "ok"
              : "warn",
      detail: !data
        ? "Aguardando diagnóstico"
        : !readiness?.conversionsToken
          ? "Token de conversões pendente na Hostinger"
          : !capiOn
            ? "Ativar dataset e código de teste"
            : delivered > 0
              ? "Dataset de teste recebendo · produção bloqueada"
              : "Executar o ensaio CAPI",
      href: "#meta-conversions",
    },
  ];

  const funnelStages: Array<{ key: string; label: string; rate: number | null }> =
    data
      ? [
          { key: "Lead", label: "Novo lead", rate: null },
          { key: "Contact", label: "Contato", rate: null },
          {
            key: "QualifiedLead",
            label: "Qualificado",
            rate: data.funnelInsights.qualifiedRate,
          },
          { key: "Schedule", label: "Visita", rate: data.funnelInsights.visitRate },
          {
            key: "SubmitApplication",
            label: "Proposta",
            rate: data.funnelInsights.proposalRate,
          },
          {
            key: "ConvertedLead",
            label: "Convertido",
            rate: data.funnelInsights.convertedRate,
          },
        ]
      : [];

  return (
    <div data-meta-layout="cc6-journey" className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Integrações · Meta Lead Ads · Conversions API"
        title="Central Meta"
        description="Da campanha ao CRM e de volta à Meta: leads reais com origem preservada, sinais de qualidade com consentimento e decisão sempre humana."
        action={{
          href: "/integrations",
          label: "Todas as integrações",
          priority: "secondary",
        }}
      />

      {error ? (
        <div
          role="alert"
          className="cc6-sev-band cc6-panel-quiet cc6-reveal py-3 pl-5 pr-4 text-sm text-[#fb7185]"
          style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="cc6-sev-band cc6-panel-quiet cc6-reveal py-3 pl-5 pr-4 text-sm text-[#aab6ca]"
          style={{ "--cc6-sev": "var(--atlas-accent)" } as CSSProperties}
        >
          {notice}
        </p>
      ) : null}

      {/* Jornada — o operador responde em segundos: conectado, faltando, próximo passo. */}
      <section aria-label="Jornada da conexão Meta">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Jornada da conexão</p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span
                className="cc6-chip"
                title="Assinatura do webhook, token de captura, token de conversões, leitura de insights e worker cron"
              >
                {data ? `${ready}/5 credenciais` : "—"}
              </span>
              {data ? (
                <StatusBadge tone={journeyComplete ? "success" : "warning"}>
                  {journeyComplete ? "Jornada comprovada" : "Etapas pendentes"}
                </StatusBadge>
              ) : (
                <StatusBadge tone={error ? "danger" : "neutral"}>
                  {error ? "Diagnóstico falhou" : "Diagnosticando…"}
                </StatusBadge>
              )}
            </div>
          </div>
          <div
            className="cc6-hairline mt-4 grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-busy={!data}
          >
            {journey.map((step) => {
              const symbol =
                step.state === "ok" ? "✓" : step.state === "warn" ? "•" : "—";
              const symbolClass =
                step.state === "ok"
                  ? "cc6-ok"
                  : step.state === "warn"
                    ? "cc6-warn"
                    : "text-[#6b7890]";
              const body = (
                <>
                  <p className="cc6-eyebrow flex items-center justify-between gap-2">
                    <span>
                      {step.index} · {step.label}
                    </span>
                    <span aria-hidden="true" className={symbolClass}>
                      {symbol}
                    </span>
                  </p>
                  <p className="cc6-metric-value mt-2 text-3xl leading-none">
                    {step.value}
                  </p>
                  <p className="cc6-metric-label mt-1.5">{step.metricLabel}</p>
                  <p
                    className={`mt-1 text-[11px] leading-4 ${
                      step.state === "warn" ? "cc6-warn" : "text-[#6b7890]"
                    }`}
                  >
                    {step.detail}
                  </p>
                </>
              );
              return step.href ? (
                <a
                  key={step.id}
                  href={step.href}
                  title={`Ir para o painel — ${step.detail}`}
                  className={`rounded-xl p-3 ${rowHover} ${focusRing}`}
                >
                  {body}
                </a>
              ) : (
                <div key={step.id} title={step.detail} className="rounded-xl p-3">
                  {body}
                </div>
              );
            })}
          </div>
          <p className="cc6-hairline mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-3 text-[11px] leading-5 text-[#6b7890]">
            {data && readiness ? (
              <>
                <ReadyToken
                  label="assinatura"
                  done={readiness.webhookSecret}
                  hint="Segredo do app e verify token do webhook"
                />
                <ReadyToken
                  label="captura"
                  done={readiness.graphToken}
                  hint="Token de captura de leads"
                />
                <ReadyToken
                  label="conversões"
                  done={readiness.conversionsToken}
                  hint="Token da Conversions API"
                />
                <ReadyToken
                  label="insights"
                  done={readiness.adsInsights}
                  hint="Conta e token de leitura do Meta Ads"
                />
                <ReadyToken
                  label="worker"
                  done={readiness.cronWorker}
                  hint="Worker cron da Hostinger"
                />
                <span>segredos apenas no servidor</span>
              </>
            ) : (
              "Aguardando leitura das credenciais…"
            )}
          </p>
        </TiltShell>
      </section>

      {/* Governança consolidada — antes repetida em banner + 5 notas espalhadas. */}
      <section
        aria-labelledby="meta-governance-title"
        className="cc6-sev-band cc6-panel cc6-reveal p-5"
        style={{ "--cc6-sev": "#34d399", animationDelay: "90ms" } as CSSProperties}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="cc6-eyebrow">Governança</p>
            <h2 id="meta-governance-title" className={sectionTitle}>
              Seguro por padrão
            </h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span
              className="cc6-chip"
              title="Cadastrar fontes e configurar o dataset de teste"
            >
              gestão{" "}
              {data ? (
                data.canManage ? (
                  <span className="cc6-ok">✓</span>
                ) : (
                  "—"
                )
              ) : (
                "—"
              )}
            </span>
            <span
              className="cc6-chip"
              title="Ensaios reais e revisão de relatórios são exclusivos da diretoria"
            >
              decisão{" "}
              {data ? (
                data.canDecide ? (
                  <span className="cc6-ok">✓</span>
                ) : (
                  "—"
                )
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
        <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm leading-6 text-[#aab6ca] sm:grid-cols-2">
          <li className="flex gap-2">
            <span aria-hidden="true" className="cc6-ok">✓</span>
            Nenhuma campanha é alterada automaticamente — IA e time produzem
            evidência; a decisão é exclusiva da diretoria.
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="cc6-ok">✓</span>
            Conversions API restrita ao dataset de teste; produção tecnicamente
            bloqueada até homologação e aceite explícito.
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="cc6-ok">✓</span>
            Compartilhamento de sinais nasce desligado e exige base de
            autorização registrada por origem.
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="cc6-ok">✓</span>
            Tokens e segredos vivem no servidor — esta página nunca os exibe.
          </li>
        </ul>
      </section>

      {/* Jornada 02 — ensaio real do webhook. */}
      <section
        id="meta-webhook"
        aria-labelledby="meta-webhook-title"
        className="cc6-panel cc6-reveal scroll-mt-24 p-5"
        style={{ animationDelay: "140ms" }}
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Jornada 02 · Webhook · Fase 24</p>
            <h2 id="meta-webhook-title" className={sectionTitle}>
              Entrada única e atribuição comprovadas
            </h2>
            <p className={sectionHint}>
              O Atlas assina e entrega o mesmo lead oficial de teste duas vezes:
              deve nascer uma única lead, com origem preservada.
            </p>
          </div>
          {webhookResult ? (
            <StatusBadge
              tone={webhookResult.attributionPreserved ? "success" : "warning"}
            >
              {webhookResult.attributionPreserved ? "Comprovado" : "Revisar"}
            </StatusBadge>
          ) : null}
        </header>
        <form
          onSubmit={testWebhook}
          className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]"
        >
          <select
            required
            aria-label="Página e formulário cadastrados"
            value={webhookTest.sourceId}
            onChange={(event) =>
              setWebhookTest({ ...webhookTest, sourceId: event.target.value })
            }
            className={field}
          >
            <option className={optionClass} value="">
              Página e formulário cadastrados
            </option>
            {data?.sources
              .filter((source) => source.active && source.form_id)
              .map((source) => (
                <option className={optionClass} key={source.id} value={source.id}>
                  {source.name} · formulário {source.form_id}
                </option>
              ))}
          </select>
          <input
            required
            inputMode="numeric"
            pattern="[0-9]+"
            aria-label="ID do lead oficial de teste"
            value={webhookTest.leadgenId}
            onChange={(event) =>
              setWebhookTest({ ...webhookTest, leadgenId: event.target.value })
            }
            placeholder="ID do lead oficial de teste"
            className={`cc6-num ${field}`}
          />
          <button
            disabled={!data?.canDecide || saving}
            title={
              data && !data.canDecide
                ? "Ensaio exclusivo da diretoria"
                : undefined
            }
            className={btnGhost}
          >
            {saving ? "Comprovando…" : "Executar ensaio real"}
          </button>
        </form>
        {testErrors.webhook ? <TestFailure message={testErrors.webhook} /> : null}
        {webhookResult ? (
          <div
            className="cc6-sev-band cc6-panel-quiet mt-3 flex flex-wrap items-start gap-x-10 gap-y-3 p-4 pl-5"
            style={
              {
                "--cc6-sev": webhookResult.attributionPreserved
                  ? "#34d399"
                  : "#f5b544",
              } as CSSProperties
            }
          >
            <div>
              <p className="cc6-metric-value text-2xl leading-none">
                {webhookResult.leadCount}
              </p>
              <p className="cc6-metric-label mt-1.5">
                lead criada · 2 entregas
              </p>
            </div>
            <div>
              <p className="cc6-num text-sm leading-6 text-[#e8eef8]">
                {(webhookResult.duplicateDelivery.duplicates ?? 0) >= 1 ? (
                  <span className="cc6-ok">duplicidade bloqueada</span>
                ) : (
                  <span className="cc6-ok">entrega validada</span>
                )}
              </p>
              <p className="cc6-metric-label mt-1">deduplicação</p>
            </div>
            <div>
              <p className="cc6-num text-sm leading-6 text-[#e8eef8]">
                {webhookResult.attributionPreserved ? (
                  <span className="cc6-ok">origem preservada</span>
                ) : (
                  <span className="cc6-warn">revisar</span>
                )}
              </p>
              <p className="cc6-metric-label mt-1 truncate">
                lead {webhookResult.leadId}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[11px] leading-5 text-[#6b7890]">
            O ID deve vir de um lead oficial de teste da Meta e permanecer
            legível pelo token configurado no servidor. Último ensaio: —
          </p>
        )}
      </section>

      {/* Jornada 03 — fontes de lead: inventário + cadastro. */}
      <section
        id="meta-sources"
        aria-label="Fontes de lead"
        className="cc6-reveal grid scroll-mt-24 gap-4 xl:grid-cols-[1fr_380px]"
        style={{ animationDelay: "180ms" }}
      >
        <div className="cc6-panel overflow-hidden">
          <header className="flex flex-wrap items-baseline justify-between gap-3 px-5 pb-2 pt-5">
            <div className="min-w-0">
              <p className="cc6-eyebrow">Jornada 03 · Fontes de lead</p>
              <h2 className={sectionTitle}>Páginas e formulários</h2>
            </div>
            <p className="cc6-num text-[11px] text-[#6b7890]">
              {data
                ? `${activeSources} ativas · ${sharingSources} com sinal`
                : "—"}
            </p>
          </header>
          <div className="pb-2" aria-busy={!data}>
            {!data ? (
              <div className="space-y-2 px-5 py-3">
                {[1, 2, 3].map((item) => (
                  <AtlasSkeleton key={item} className="h-12" />
                ))}
              </div>
            ) : !data.sources.length ? (
              <div className="px-5 py-6">
                <AtlasEmpty
                  reason="first-use"
                  eyebrow="Integração ainda vazia"
                  title="Nenhuma origem cadastrada"
                  description="Conecte a primeira Página e Formulário ao lado para aceitar webhooks."
                />
              </div>
            ) : (
              data.sources.map((source, index) => (
                <article
                  key={source.id}
                  className={`cc6-reveal flex flex-wrap items-center gap-x-6 gap-y-1.5 px-5 py-3 ${rowHover} ${index ? "cc6-hairline" : ""}`}
                  style={{ animationDelay: `${Math.min(index + 1, 12) * 35}ms` }}
                >
                  <div className="min-w-0 flex-1 basis-52">
                    <p className="text-sm font-medium leading-6 text-[#e8eef8]">
                      {source.name}
                    </p>
                    <p className="cc6-num mt-0.5 text-[10px] tracking-wide text-[#6b7890]">
                      página {source.page_id} · formulário{" "}
                      {source.form_id || "todos"}
                      {source.consent_basis
                        ? ` · base: ${source.consent_basis}`
                        : ""}
                    </p>
                  </div>
                  <p className="cc6-num shrink-0 text-[11px] text-[#aab6ca]">
                    <ReadyToken
                      label="sinal"
                      done={source.conversion_sharing_enabled}
                      hint={
                        source.conversion_sharing_enabled
                          ? "Autorizada a devolver sinais de conversão à Meta"
                          : "Sem compartilhamento de conversões"
                      }
                    />
                  </p>
                  <StatusBadge tone={source.active ? "success" : "warning"}>
                    {source.active ? "Ativa" : "Pausada"}
                  </StatusBadge>
                </article>
              ))
            )}
          </div>
        </div>

        <form onSubmit={saveSource} className="cc6-panel space-y-3 self-start p-5">
          <div>
            <p className="cc6-eyebrow">Nova origem</p>
            <h2 className={sectionTitle}>Conectar Página/Formulário</h2>
          </div>
          <input
            required
            aria-label="Nome da origem"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Nome da origem, ex.: ARVO Julho"
            className={field}
          />
          <input
            required
            inputMode="numeric"
            aria-label="ID da Página Meta"
            value={form.pageId}
            onChange={(event) =>
              setForm({ ...form, pageId: event.target.value })
            }
            placeholder="ID da Página Meta"
            className={`cc6-num ${field}`}
          />
          <input
            inputMode="numeric"
            aria-label="ID do formulário (opcional)"
            value={form.formId}
            onChange={(event) =>
              setForm({ ...form, formId: event.target.value })
            }
            placeholder="ID do formulário (opcional)"
            className={`cc6-num ${field}`}
          />
          <label className="flex items-start gap-3 rounded-xl border border-[rgba(148,163,184,.16)] bg-white/[.03] p-3.5 text-sm leading-6 text-[#aab6ca] transition-colors hover:border-[rgba(148,163,184,.26)]">
            <input
              type="checkbox"
              checked={form.conversionSharingEnabled}
              onChange={(event) =>
                setForm({
                  ...form,
                  conversionSharingEnabled: event.target.checked,
                })
              }
              className={`mt-1 accent-[var(--atlas-accent)] ${focusRing}`}
            />
            <span>
              Esta origem possui autorização válida para enviar sinais de
              conversão à Meta.
            </span>
          </label>
          {form.conversionSharingEnabled ? (
            <textarea
              required
              aria-label="Base de autorização"
              value={form.consentBasis}
              onChange={(event) =>
                setForm({ ...form, consentBasis: event.target.value })
              }
              placeholder="Registre a base de autorização, política ou formulário aplicado"
              className={`min-h-24 resize-y ${field}`}
            />
          ) : null}
          <button
            disabled={!data?.canManage || saving}
            title={
              data && !data.canManage
                ? "Somente gestão pode alterar esta integração"
                : undefined
            }
            className={`w-full ${btnAccent}`}
          >
            {saving ? "Salvando…" : "Ativar fonte de leads"}
          </button>
          {!data?.canManage ? (
            <p className="text-[11px] leading-5 cc6-warn">
              Somente gestão pode alterar esta integração.
            </p>
          ) : null}
        </form>
      </section>

      {/* Jornada 04 — conversões: dataset de teste + ensaio CAPI. */}
      <section
        id="meta-conversions"
        aria-label="Conversões em teste"
        className="cc6-reveal grid scroll-mt-24 gap-4 xl:grid-cols-[380px_1fr]"
        style={{ animationDelay: "220ms" }}
      >
        <form
          onSubmit={saveConversion}
          className="cc6-panel space-y-3 self-start p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="cc6-eyebrow">Jornada 04 · Conversões</p>
              <h2 className={sectionTitle}>Dataset de teste</h2>
            </div>
            <StatusBadge tone="warning">Produção bloqueada</StatusBadge>
          </div>
          <p className="text-[11px] leading-5 text-[#6b7890]">
            Somente o código de eventos de teste é aceito nesta homologação —
            nenhum sinal real otimiza campanhas sem aceite explícito.
          </p>
          <input
            required
            inputMode="numeric"
            aria-label="Dataset ID da Meta"
            value={conversion.datasetId}
            onChange={(event) =>
              setConversion({ ...conversion, datasetId: event.target.value })
            }
            placeholder="Dataset ID da Meta"
            className={`cc6-num ${field}`}
          />
          <input
            required
            aria-label="Código de evento de teste"
            value={conversion.testEventCode}
            onChange={(event) =>
              setConversion({
                ...conversion,
                testEventCode: event.target.value,
              })
            }
            placeholder="Código de evento de teste"
            className={`cc6-num ${field}`}
          />
          <button
            disabled={!data?.canManage || saving}
            title={
              data && !data.canManage
                ? "Somente gestão pode alterar esta integração"
                : undefined
            }
            className={`w-full ${btnAccent}`}
          >
            {saving ? "Validando…" : "Ativar validação em teste"}
          </button>
        </form>

        <div className="cc6-panel p-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="cc6-eyebrow">Fase 25 · Ensaio CAPI</p>
              <h2 className={sectionTitle}>
                Evento confirmado no dataset de teste
              </h2>
              <p className={sectionHint}>
                Usa uma lead Meta consentida, envia pela fila segura do servidor
                e exige a confirmação de recebimento da Meta.
              </p>
            </div>
            {conversionResult ? (
              <StatusBadge
                tone={
                  conversionResult.mode === "test" &&
                  !conversionResult.productionEnabled
                    ? "success"
                    : "warning"
                }
              >
                {conversionResult.mode === "test" &&
                !conversionResult.productionEnabled
                  ? "Confirmado em teste"
                  : "Revisar ambiente"}
              </StatusBadge>
            ) : null}
          </header>
          <form
            onSubmit={testConversion}
            className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"
          >
            <select
              required
              aria-label="Lead Meta com consentimento e identificador"
              value={conversionLeadId}
              onChange={(event) => setConversionLeadId(event.target.value)}
              className={field}
            >
              <option className={optionClass} value="">
                Lead Meta com consentimento e identificador
              </option>
              {data?.conversionCandidates.map((lead) => (
                <option className={optionClass} key={lead.id} value={lead.id}>
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
              title={
                data && !data.canDecide
                  ? "Ensaio exclusivo da diretoria"
                  : undefined
              }
              className={btnGhost}
            >
              {saving ? "Consultando Meta…" : "Executar teste CAPI"}
            </button>
          </form>
          {!data?.conversionConfig?.enabled ? (
            <p className="mt-3 text-[11px] leading-5 cc6-warn">
              Informe o Dataset ID e o código de evento de teste ao lado para
              liberar o ensaio.
            </p>
          ) : !data?.conversionCandidates.length ? (
            <p className="mt-3 text-[11px] leading-5 cc6-warn">
              Nenhuma lead Meta possui simultaneamente consentimento e e-mail ou
              telefone elegível.
            </p>
          ) : null}
          {testErrors.capi ? <TestFailure message={testErrors.capi} /> : null}
          {conversionResult ? (
            <div
              className="cc6-sev-band cc6-panel-quiet mt-3 flex flex-wrap items-start gap-x-10 gap-y-3 p-4 pl-5"
              style={
                {
                  "--cc6-sev":
                    conversionResult.mode === "test" &&
                    !conversionResult.productionEnabled
                      ? "#34d399"
                      : "#f5b544",
                } as CSSProperties
              }
            >
              <div>
                <p className="cc6-metric-value text-2xl leading-none">
                  {conversionResult.eventsReceived}
                </p>
                <p className="cc6-metric-label mt-1.5">
                  evento confirmado pela Meta
                </p>
              </div>
              <div>
                <p className="cc6-num text-sm leading-6 text-[#e8eef8]">
                  {conversionResult.mode === "test" &&
                  !conversionResult.productionEnabled ? (
                    <span className="cc6-ok">teste · produção bloqueada</span>
                  ) : (
                    <span className="cc6-warn">revisar</span>
                  )}
                </p>
                <p className="cc6-metric-label mt-1">
                  dataset {conversionResult.datasetIdMasked}
                </p>
              </div>
              <div className="min-w-0">
                <p className="cc6-num text-sm leading-6 text-[#e8eef8]">
                  {conversionResult.traceId ? (
                    <span className="cc6-ok">trace Meta registrado</span>
                  ) : (
                    "evento registrado"
                  )}
                </p>
                <p className="cc6-metric-label mt-1 truncate">
                  {conversionResult.eventId}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Homologação — Insights conferido e cron idempotente. */}
      <section
        aria-label="Homologação de leitura e relatório"
        className="cc6-reveal grid gap-4 xl:grid-cols-[1fr_360px]"
        style={{ animationDelay: "260ms" }}
      >
        <div className="cc6-panel p-5">
          <header className="min-w-0">
            <p className="cc6-eyebrow">Homologação · Fase 26 · Meta Insights</p>
            <h2 className={sectionTitle}>Hoje, 7 e 30 dias conferidos</h2>
            <p className={sectionHint}>
              Copie do Ads Manager o gasto, as impressões e os cliques; o Atlas
              consulta a conta em modo somente leitura e mostra qualquer
              diferença.
            </p>
          </header>
          <form onSubmit={testInsights} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { key: "day", label: "Hoje" },
                  { key: "week", label: "Últimos 7 dias" },
                  { key: "month", label: "Últimos 30 dias" },
                ] as const
              ).map(({ key, label }) => (
                <fieldset key={key} className="cc6-panel-quiet p-3">
                  <legend className="cc6-eyebrow px-1">{label}</legend>
                  <div className="mt-1 grid gap-2">
                    <input
                      required
                      min="0"
                      step="0.01"
                      type="number"
                      aria-label={`${label} · gasto em reais`}
                      value={insightsReference[`${key}Spend`]}
                      onChange={(event) =>
                        setInsightsReference({
                          ...insightsReference,
                          [`${key}Spend`]: event.target.value,
                        })
                      }
                      placeholder="Gasto (R$)"
                      className={`cc6-num ${field}`}
                    />
                    <input
                      required
                      min="0"
                      step="1"
                      type="number"
                      aria-label={`${label} · impressões`}
                      value={insightsReference[`${key}Impressions`]}
                      onChange={(event) =>
                        setInsightsReference({
                          ...insightsReference,
                          [`${key}Impressions`]: event.target.value,
                        })
                      }
                      placeholder="Impressões"
                      className={`cc6-num ${field}`}
                    />
                    <input
                      required
                      min="0"
                      step="1"
                      type="number"
                      aria-label={`${label} · cliques`}
                      value={insightsReference[`${key}Clicks`]}
                      onChange={(event) =>
                        setInsightsReference({
                          ...insightsReference,
                          [`${key}Clicks`]: event.target.value,
                        })
                      }
                      placeholder="Cliques"
                      className={`cc6-num ${field}`}
                    />
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                disabled={
                  !data?.canDecide || saving || !data?.readiness.adsInsights
                }
                title={
                  data && !data.canDecide
                    ? "Comparação exclusiva da diretoria"
                    : undefined
                }
                className={btnGhost}
              >
                {saving ? "Comparando períodos…" : "Comparar com Meta Ads"}
              </button>
              {!data?.readiness.adsInsights ? (
                <p className="text-[11px] leading-5 cc6-warn">
                  Conta e token de leitura do Meta Ads pendentes na Hostinger.
                </p>
              ) : null}
            </div>
          </form>
          {testErrors.insights ? (
            <TestFailure message={testErrors.insights} />
          ) : null}
          {insightsResult ? (
            <div className="mt-3 space-y-3">
              <p
                className={`cc6-num text-[11px] leading-5 ${
                  insightsResult.status === "passed" ? "cc6-ok" : "cc6-warn"
                }`}
              >
                {insightsResult.status === "passed"
                  ? "Confere nos três períodos"
                  : "Diferenças encontradas — revise conta, período e atualização do Ads Manager"}
                {" · conta "}
                {insightsResult.accountIdMasked}
                {insightsResult.readOnly ? " · somente leitura" : ""}
              </p>
              <div className="grid gap-3 lg:grid-cols-3">
                {insightsResult.periods.map((period) => (
                  <div
                    key={period.key}
                    className="cc6-sev-band cc6-panel-quiet p-3 pl-4"
                    style={
                      {
                        "--cc6-sev": period.matches ? "#34d399" : "#f5b544",
                      } as CSSProperties
                    }
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-[#e8eef8]">
                        {period.key === "day"
                          ? "Hoje"
                          : period.key === "week"
                            ? "7 dias"
                            : "30 dias"}
                      </p>
                      <span
                        className={`cc6-num text-[10px] uppercase tracking-[0.14em] ${
                          period.matches ? "cc6-ok" : "cc6-warn"
                        }`}
                      >
                        {period.matches ? "confere" : "diferença"}
                      </span>
                    </div>
                    <p className="cc6-num mt-2 text-[11px] leading-5 text-[#aab6ca]">
                      R$ {period.actual.spend.toFixed(2)} ·{" "}
                      {period.actual.impressions.toLocaleString("pt-BR")} impr ·{" "}
                      {period.actual.clicks.toLocaleString("pt-BR")} cliques
                    </p>
                    <p className="cc6-num mt-1 text-[10px] leading-4 text-[#6b7890]">
                      Δ R$ {period.difference.spend.toFixed(2)} ·{" "}
                      {period.difference.impressions} impr ·{" "}
                      {period.difference.clicks} cliques · {period.campaigns}{" "}
                      campanhas
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="cc6-panel self-start p-5">
          <p className="cc6-eyebrow">Homologação · Fase 32 · Cron 08h</p>
          <h2 className={sectionTitle}>Relatório diário único</h2>
          <p className={sectionHint}>
            Duas execuções do worker: a segunda deve encerrar sem criar outra
            linha nem repetir consultas e custo de IA.
          </p>
          <button
            type="button"
            disabled={!data?.canDecide || saving}
            onClick={() => void testDailyReport()}
            title={
              data && !data.canDecide
                ? "Ensaio exclusivo da diretoria"
                : undefined
            }
            className={`mt-4 ${btnGhost}`}
          >
            {saving ? "Executando duas vezes…" : "Executar ensaio de idempotência"}
          </button>
          {testErrors.daily ? <TestFailure message={testErrors.daily} /> : null}
          {dailyReportTest ? (
            <div
              className="cc6-sev-band cc6-panel-quiet mt-3 space-y-3 p-4 pl-5"
              style={
                {
                  "--cc6-sev":
                    dailyReportTest.duplicateWorkPrevented &&
                    dailyReportTest.reportCount === 1
                      ? "#34d399"
                      : "#f5b544",
                } as CSSProperties
              }
            >
              <div>
                <p className="cc6-metric-value text-2xl leading-none">
                  {dailyReportTest.reportCount}
                </p>
                <p className="cc6-metric-label mt-1.5">relatório no dia</p>
              </div>
              <p className="cc6-num text-[11px] leading-5 text-[#aab6ca]">
                {dailyReportTest.duplicateWorkPrevented ? (
                  <span className="cc6-ok">trabalho duplicado evitado</span>
                ) : (
                  <span className="cc6-warn">revisar segunda execução</span>
                )}
                {" · "}
                {dailyReportTest.reportStatus === "reviewed"
                  ? "revisado"
                  : "pronto para o diretor"}
                {" · "}
                {dailyReportTest.reportDate}
              </p>
            </div>
          ) : (
            <p className="cc6-num mt-3 text-[11px] leading-5 text-[#6b7890]">
              Última execução: —
            </p>
          )}
        </div>
      </section>

      {/* Aprendizado — funil de eventos devolvido à Meta. */}
      <section
        aria-labelledby="meta-funnel-title"
        className="cc6-panel cc6-reveal p-5"
        style={{ animationDelay: "300ms" }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Aprendizado</p>
            <h2 id="meta-funnel-title" className={sectionTitle}>
              Funil ensinado à Meta
            </h2>
          </div>
          <span
            className="cc6-chip"
            title="Compraram em outro lugar — usados só para aprendizado interno"
          >
            {data ? `${data.funnelInsights.buyerProfiles} perfis compradores` : "—"}
          </span>
        </header>
        <div aria-busy={!data}>
          {!data ? (
            <div className="mt-4">
              <AtlasSkeleton className="h-24" />
            </div>
          ) : (
            <>
              <div className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-4 pt-4">
                {funnelStages.map((stage) => (
                  <div key={stage.key}>
                    <p className="cc6-metric-value text-2xl leading-none">
                      {data.conversionFunnel[stage.key] ?? 0}
                    </p>
                    <p className="cc6-metric-label mt-1.5">{stage.label}</p>
                    <p
                      className={`cc6-num mt-0.5 text-[10px] ${
                        typeof stage.rate === "number"
                          ? "cc6-ok"
                          : "text-[#6b7890]"
                      }`}
                    >
                      {typeof stage.rate === "number"
                        ? `${stage.rate}% dos leads`
                        : "evento base"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="cc6-hairline cc6-num mt-4 pt-3 text-[11px] leading-5 text-[#6b7890]">
                Perdas registradas somente para aprendizado interno:{" "}
                <span className={data.funnelInsights.lost ? "cc6-crit" : ""}>
                  {data.funnelInsights.lost}
                </span>
              </p>
            </>
          )}
        </div>
      </section>

      {/* Andromeda — diagnóstico do sinal CRM → Meta. */}
      <section
        aria-labelledby="meta-andromeda-title"
        className="cc6-panel cc6-reveal p-5"
        style={{ animationDelay: "340ms" }}
      >
        <header className="min-w-0">
          <p className="cc6-eyebrow">Andromeda signal loop</p>
          <h2 id="meta-andromeda-title" className={sectionTitle}>
            Qualidade da conexão CRM → Meta
          </h2>
          <p className={sectionHint}>
            Mede se o Andromeda recebe eventos confiáveis e profundos — é
            diagnóstico, não gatilho.
          </p>
        </header>
        <div aria-busy={!data}>
          {!data ? (
            <div className="mt-4">
              <AtlasSkeleton className="h-24" />
            </div>
          ) : (
            <>
              <div className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-4 pt-4">
                <div>
                  <p className="cc6-metric-value text-3xl leading-none">
                    {data.andromedaReadiness.score}%
                  </p>
                  <p className="cc6-metric-label mt-1.5">
                    prontidão · {data.andromedaReadiness.eligibleLeads} leads
                    elegíveis
                  </p>
                </div>
                <div>
                  <p className="cc6-metric-value text-3xl leading-none">
                    {data.andromedaReadiness.deliveryRate}%
                  </p>
                  <p className="cc6-metric-label mt-1.5">entrega confirmada</p>
                </div>
                <div>
                  <p className="cc6-metric-value text-3xl leading-none">
                    {data.andromedaReadiness.dualIdentifierRate}%
                  </p>
                  <p className="cc6-metric-label mt-1.5">telefone + e-mail</p>
                </div>
                <div>
                  <p className="cc6-metric-value text-3xl leading-none">
                    {data.andromedaReadiness.feedbackCoverage}%
                  </p>
                  <p className="cc6-metric-label mt-1.5">feedback profundo</p>
                </div>
              </div>
              <div className="cc6-hairline mt-4 pt-3">
                {data.andromedaReadiness.recommendations.length ? (
                  <ul className="space-y-1 text-[11px] leading-5 text-[#aab6ca]">
                    {data.andromedaReadiness.recommendations.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden="true" className="cc6-warn">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] leading-5 cc6-ok">
                    Sinal saudável para continuar a homologação controlada.
                  </p>
                )}
                <p className="mt-2 text-[10px] leading-4 text-[#6b7890]">
                  {data.andromedaReadiness.privacy}
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Audience intelligence — sinais agregados do time comercial. */}
      <section
        aria-labelledby="meta-audience-title"
        className="cc6-panel cc6-reveal p-5"
        style={{ animationDelay: "380ms" }}
      >
        <header className="min-w-0">
          <p className="cc6-eyebrow">Audience intelligence</p>
          <h2 id="meta-audience-title" className={sectionTitle}>
            O que o time comercial está ensinando
          </h2>
          <p className={sectionHint}>
            Sinais agregados dos acompanhamentos para orientar público, oferta e
            criativos — sem descrições nem dados pessoais.
          </p>
        </header>
        {data?.audienceRecommendations.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.audienceRecommendations.map((item, index) => (
              <span
                key={item.signal}
                className="cc6-chip"
                title={`Prioridade ${index + 1} · ${item.count} acompanhamentos`}
              >
                {index + 1}. {item.signal.replaceAll("_", " ")} · {item.count}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#6b7890]">
            {data
              ? "Aguardando acompanhamentos — preço, região, financiamento, prazo, produto e concorrência aparecem aqui quando registrados."
              : "—"}
          </p>
        )}
      </section>

      {/* Campaign intelligence — ranking com trava de escala. */}
      <section
        aria-labelledby="meta-campaigns-title"
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "420ms" }}
      >
        <header className="px-5 pt-5">
          <p className="cc6-eyebrow">Fase 37 · Campaign intelligence</p>
          <h2 id="meta-campaigns-title" className={sectionTitle}>
            Ranking comercial com trava de escala
          </h2>
          <p className={sectionHint}>
            Compara qualidade e conversão sem inventar custo ou ROAS — escala só
            aparece com 50+ leads e operação comercial comprovada.
          </p>
        </header>
        <div className="overflow-x-auto px-5 pb-5 pt-2">
          {data?.campaignIntelligence.length ? (
            <table className="w-full min-w-[1020px] text-left text-xs">
              <thead>
                <tr className="border-b border-[rgba(148,163,184,0.12)]">
                  {[
                    "#",
                    "Campanha",
                    "Amostra",
                    "Perf.",
                    "Qualidade",
                    "Visitas",
                    "Propostas",
                    "Conversão",
                    "Diagnóstico",
                  ].map((column) => (
                    <th
                      key={column}
                      className="cc6-num py-2.5 pr-4 text-[10px] font-medium uppercase tracking-[0.14em] text-[#6b7890]"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.campaignIntelligence.map((campaign) => (
                  <tr
                    key={campaign.campaignId}
                    className={`border-b border-[rgba(148,163,184,0.08)] align-top ${rowHover}`}
                  >
                    <td className="cc6-num py-3 pr-4 text-base font-semibold text-[#e8eef8]">
                      {campaign.rank}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-sm font-medium text-[#e8eef8]">
                        {campaign.campaignId === "sem-campanha"
                          ? "Origem não identificada"
                          : campaign.campaignName || campaign.campaignId}
                      </p>
                      <p className="cc6-num mt-1 text-[10px] text-[#6b7890]">
                        {campaign.total} leads · score médio{" "}
                        {campaign.averageScore}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge
                        tone={
                          campaign.sampleStatus === "reliable"
                            ? "success"
                            : campaign.sampleStatus === "learning"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {campaign.sampleStatus === "reliable"
                          ? "Confiável"
                          : campaign.sampleStatus === "learning"
                            ? "Aprendendo"
                            : "Insuficiente"}
                      </StatusBadge>
                      <p className="cc6-num mt-1.5 text-[10px] text-[#6b7890]">
                        {campaign.confidencePercent}% de confiança
                      </p>
                    </td>
                    <td className="cc6-num py-3 pr-4 text-base font-semibold text-[#e8eef8]">
                      {campaign.performanceScore}
                    </td>
                    <td className="cc6-num py-3 pr-4 text-[#aab6ca]">
                      {campaign.qualityRate}%
                    </td>
                    <td className="cc6-num py-3 pr-4 text-[#aab6ca]">
                      {campaign.visitRate}%
                    </td>
                    <td className="cc6-num py-3 pr-4 text-[#aab6ca]">
                      {campaign.proposalRate}%
                    </td>
                    <td className="cc6-num py-3 pr-4 font-semibold cc6-ok">
                      {campaign.conversionRate}%
                    </td>
                    <td className="max-w-sm py-3 leading-5 text-[#aab6ca]">
                      {campaign.recommendation}
                      <p className="cc6-num mt-1.5 text-[11px]">
                        <ReadyToken
                          label="escala"
                          done={campaign.scaleEligible}
                          hint={
                            campaign.scaleEligible
                              ? "Elegível para análise de escala — decisão da diretoria"
                              : "Escala bloqueada até cumprir as pendências"
                          }
                        />
                      </p>
                      {!campaign.scaleEligible ? (
                        <p className="mt-1 text-[10px] leading-4 text-[#6b7890]">
                          Pendências:{" "}
                          {campaign.scaleBlockers
                            .map(
                              (blocker) =>
                                scaleBlockerLabels[blocker] || blocker,
                            )
                            .join(" · ")}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : data ? (
            <div className="py-4">
              <AtlasEmpty
                reason="no-activity"
                eyebrow="Sem amostra de campanhas"
                title="Ainda sem sinais de campanha"
                description="Quando os leads entrarem com ID de campanha, qualidade, visitas, propostas e conversão aparecem aqui."
              />
            </div>
          ) : (
            <p className="py-4 text-sm text-[#6b7890]">—</p>
          )}
        </div>
      </section>

      {/* Diretoria — relatório diário, revisão e leitura comparativa (antes 2 cards). */}
      <section
        aria-labelledby="meta-director-title"
        className="cc6-panel cc6-reveal p-5"
        style={{ animationDelay: "460ms" }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Diretoria · diário</p>
            <h2 id="meta-director-title" className={sectionTitle}>
              Relatórios para decisão
            </h2>
            <p className={sectionHint}>
              Consolidado das últimas 24 horas gerado pelo worker — recomendações
              nunca executam mudanças sozinhas.
            </p>
          </div>
          <p className="cc6-num text-[11px] text-[#6b7890]">
            {data?.canDecide ? `${data.dailyReports.length} recentes` : "—"}
          </p>
        </header>
        <div className="mt-4 space-y-4" aria-busy={!data}>
          {!data ? (
            <AtlasSkeleton className="h-40" />
          ) : !data.canDecide ? (
            <p className="cc6-panel-quiet p-4 text-sm leading-6 text-[#6b7890]">
              Relatórios decisórios são visíveis exclusivamente para a diretoria
              — o restante do time contribui por meio dos acompanhamentos.
            </p>
          ) : !data.dailyReports.length ? (
            <AtlasEmpty
              reason="no-activity"
              eyebrow="Consolidação pendente"
              title="Primeiro relatório ainda não gerado"
              description="O worker diário consolidará campanhas, sinais e recomendações para sua revisão."
            />
          ) : (
            data.dailyReports.map((report, index) => (
              <article
                key={report.id}
                className={`cc6-reveal cc6-panel-quiet p-4 ${rowHover}`}
                style={{ animationDelay: `${Math.min(index + 1, 8) * 40}ms` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="cc6-num text-sm font-medium text-[#e8eef8]">
                    {new Date(
                      `${report.report_date}T12:00:00`,
                    ).toLocaleDateString("pt-BR")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={report.status === "reviewed" ? "success" : "warning"}
                    >
                      {report.status === "reviewed"
                        ? "Revisado"
                        : "Aguarda diretor"}
                    </StatusBadge>
                    {report.status === "ready" ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void reviewReport(report.id)}
                        className={btnGhost}
                      >
                        Registrar revisão do diretor
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {report.payload.recommendations.length ? (
                    report.payload.recommendations.slice(0, 4).map((item) => (
                      <div
                        key={item.campaignId}
                        className="rounded-xl border border-[rgba(148,163,184,0.10)] p-3"
                      >
                        <p className="cc6-num text-xs font-medium text-[#e8eef8]">
                          Campanha {item.campaignId}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#aab6ca]">
                          {item.recommendation}
                        </p>
                        <p className="cc6-num mt-2 text-[10px] text-[#6b7890]">
                          qualidade {item.qualityRate}% · conversão{" "}
                          {item.conversionRate}%
                        </p>
                      </div>
                    ))
                  ) : (
                    <AtlasEmpty
                      reason="no-activity"
                      eyebrow="Amostra insuficiente"
                      title="Sem recomendações neste período"
                      description="As recomendações aparecem quando houver amostra suficiente no período."
                    />
                  )}
                </div>
              </article>
            ))
          )}

          {data?.canDecide && data.dailyReports[0] ? (
            <div className="cc6-hairline pt-4">
              <p className="cc6-eyebrow">Leitura comparativa · hoje · 7 · 30</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {(data.dailyReports[0].payload.aiConsensus || []).map(
                  (analysis, index) => (
                    <div
                      key={`${analysis.provider}-${index}`}
                      className="cc6-panel-quiet p-4"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-medium text-[#e8eef8]">
                          Parecer {index + 1} · {analysis.provider}
                        </p>
                        <span className="cc6-num text-[10px] text-[#6b7890]">
                          {analysis.model}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[#aab6ca]">
                        {analysis.analysis}
                      </p>
                      {analysis.citations.length ? (
                        <p className="cc6-num mt-2 text-[10px] text-[#6b7890]">
                          {analysis.citations.length} fontes consultadas
                        </p>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Estratégia recomendada — conteúdo educativo compactado. */}
      <section
        aria-label="Estratégia Meta recomendada"
        className="cc6-panel-quiet cc6-reveal p-5"
        style={{ animationDelay: "500ms" }}
      >
        <p className="cc6-eyebrow">Estratégia atual · Advantage+</p>
        <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "1",
              "Controle só o necessário",
              "Localização, idade mínima, idioma e exclusões operacionais como limites; preferências comerciais entram como sugestões.",
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
            <div key={step}>
              <p className="text-sm font-medium leading-6 text-[#e8eef8]">
                <span className="cc6-num text-[#6b7890]">{step}.</span> {title}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[#6b7890]">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
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
    <div className="cc6-panel-quiet p-4">
      <p className="cc6-metric-label">{label}</p>
      <p className="cc6-metric-value mt-1.5 text-2xl leading-none">
        {campaigns.reduce((sum, item) => sum + item.total, 0)}
      </p>
      <p className="cc6-metric-label mt-1">leads no período</p>
      <p className="cc6-num mt-2 text-[11px] leading-5 text-[#aab6ca]">
        {top
          ? `Líder: ${top.campaignName || top.campaignId} · nota ${top.performanceScore}`
          : "Sem amostra no período"}
      </p>
      {top ? (
        <p className="cc6-num mt-1 text-[10px] leading-4 text-[#6b7890]">
          SLA 5 min {top.sla5Rate}% · SLA 15 min {top.sla15Rate}% · cobertura{" "}
          {top.responseCoverage}%
        </p>
      ) : null}
      {top?.cpl !== null && top?.cpl !== undefined ? (
        <p className="cc6-num mt-1 text-[10px] leading-4 cc6-ok">
          CPL R$ {top.cpl.toFixed(2)} · CPQL{" "}
          {top.costPerQualifiedLead
            ? `R$ ${top.costPerQualifiedLead.toFixed(2)}`
            : "—"}{" "}
          · CTR {top.ctr ?? 0}%
        </p>
      ) : (
        <p className="cc6-num mt-1 text-[10px] leading-4 cc6-warn">
          Insights financeiros ainda não conectados
        </p>
      )}
    </div>
  );
}
