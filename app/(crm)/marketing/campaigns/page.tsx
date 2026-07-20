"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";

// Qualidade por campanha — consome /api/v1/analytics/campaign-quality
// (gestor+; tabelas vivas: marketing_campaigns, leads, lead_events,
// marketing_spend). Shape em lib/atlas/campaign-quality.ts.

type QualityRow = {
  id: string;
  name: string;
  platform: string;
  status: string;
  leads: number;
  qualifiedLeads: number;
  qualificationRate: number;
  avgScore: number | null;
  sales: number;
  conversionRate: number;
  discarded: number;
  discardRate: number | null;
  discardsByMetaCategory: Array<{ category: string; count: number }>;
  topDiscardReason: { key: string; label: string; count: number } | null;
  spend: number;
  costPerLead: number | null;
  costPerQualifiedLead: number | null;
  qualityGrade: "A" | "B" | "C" | null;
  sampleSufficient: boolean;
};

type Payload = {
  period: { start: string; end: string; days: number };
  totals: {
    campaigns: number;
    campaignsRanked: number;
    leads: number;
    qualified: number;
    sales: number;
    discarded: number;
    classifiedDiscards: number;
    unattributedDiscards: number;
    spend: number;
  };
  ranking: QualityRow[];
  policy: {
    minimumLeadsForDecision: number;
    qualifiedDefinition: string;
    qualityGradeRule: Record<string, string>;
    spendMeasured: boolean;
    windowComplete?: boolean;
  };
};

// Conselheiro Andromeda — consome /api/v1/ai/andromeda-advisor (gestor+;
// só agregados, zero PII; nada é aplicado automaticamente na Meta).
// Shape em lib/ai/andromeda-pipeline-advisor.ts.
type AdvisorRecommendation = {
  campaignId: string;
  campaignName: string;
  action: "scale" | "adjust_targeting" | "fix_form" | "pause_review" | "keep";
  rationale: string;
  confidence: "alta" | "media" | "baixa";
  metaFeedbackHint: string;
};

type AdvisorPayload = {
  engine: "generative" | "deterministic";
  model: string | null;
  recommendations: AdvisorRecommendation[];
  humanApprovalRequired: boolean;
};

// Analista Andromeda — consome /api/v1/ai/campaign-analyst (gestor+; só
// agregados, zero PII). O Analista NARRA (anomalias entre janelas + narrativa
// executiva); o Conselheiro RECOMENDA — papéis distintos, sem competição.
// Shape em lib/ai/campaign-analyst.ts.
type AnalystAnomaly = {
  campaignId: string;
  campaignName: string;
  kind: "qualification_rate" | "discard_category_share" | "cost_per_lead" | "lead_volume";
  direction: "up" | "down";
  magnitude: number;
  evidence: string;
};

type AnalystPayload = {
  narrative: string;
  engine: "generative" | "deterministic";
  anomalies: AnalystAnomaly[];
  period: {
    current: { start: string; end: string; days: number };
    previous: { start: string; end: string; days: number };
  };
  windowComplete: boolean;
};

const analystKindLabels: Record<AnalystAnomaly["kind"], string> = {
  qualification_rate: "Qualificação",
  discard_category_share: "Descarte",
  cost_per_lead: "CPL",
  lead_volume: "Volume",
};

// Tom semântico do chip: piora (queda de qualidade, salto de descarte, CPL
// subindo, volume caindo) = warning/danger; melhora = success.
const analystAnomalyTone = (anomaly: AnalystAnomaly): "success" | "warning" | "danger" => {
  if (anomaly.kind === "qualification_rate") return anomaly.direction === "down" ? "danger" : "success";
  if (anomaly.kind === "discard_category_share") return "warning";
  if (anomaly.kind === "cost_per_lead") return anomaly.direction === "up" ? "warning" : "success";
  return "danger"; // lead_volume só existe como queda >= 50%
};

const analystAnomalyDelta = (anomaly: AnalystAnomaly) => {
  const sign = anomaly.direction === "up" ? "+" : "−";
  const unit = anomaly.kind === "qualification_rate" || anomaly.kind === "discard_category_share"
    ? " p.p."
    : "%";
  return `${sign}${anomaly.magnitude}${unit}`;
};

const advisorActionLabels: Record<AdvisorRecommendation["action"], string> = {
  scale: "ESCALAR VERBA",
  adjust_targeting: "AJUSTAR PÚBLICO",
  fix_form: "CORRIGIR FORMULÁRIO",
  pause_review: "REVISAR / PAUSAR",
  keep: "MANTER",
};

const advisorConfidenceLabels: Record<AdvisorRecommendation["confidence"], string> = {
  alta: "alta",
  media: "média",
  baixa: "baixa",
};

const metaCategoryLabels: Record<string, string> = {
  duplicate: "Duplicado",
  invalid_contact_info: "Contato inválido",
  unreachable: "Inalcançável",
  not_interested: "Sem interesse",
  out_of_service_area: "Fora da área",
  budget_mismatch: "Orçamento",
  not_qualified: "Crédito negado",
  wrong_product: "Produto",
  purchased_from_competitor: "Concorrente",
  spam: "Spam",
  other: "Outro",
};

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

/* ===== Vocabulário CC-5 desta central (só apresentação; globals.css intocável,
   por isso Tailwind arbitrary values). Painéis em linear-gradient 180deg
   #0f1830→#0b1224, hairlines rgba(148,163,184,.12) (.22 no hover), tinta
   #e8eef8/#aab6ca/#6b7890, acento único var(--atlas-accent), semânticos rose
   #fb7185 / amber #f5b544 / emerald #34d399, raios 16/12px (rounded-2xl/xl),
   profundidade por geometria (barras finas + hairlines) — zero glow novo. ===== */
const cc5Panel =
  "rounded-2xl border border-[rgba(148,163,184,.12)] bg-[linear-gradient(180deg,#0f1830,#0b1224)]";
const cc5PanelHover = "transition-colors duration-200 hover:border-[rgba(148,163,184,.22)]";
const cc5Inner = "rounded-xl border border-[rgba(148,163,184,.12)] bg-white/[.02]";
const cc5InnerHover = "transition-colors duration-200 hover:border-[rgba(148,163,184,.22)]";
const cc5Eyebrow = "font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-[#6b7890]";
const cc5Focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const cc5Chip =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.12em] tabular-nums";

const chipTone = {
  neutral: "border-[rgba(148,163,184,.16)] text-[#aab6ca]",
  accent: "border-[rgba(75,141,248,.35)] text-[var(--atlas-accent)]",
  emerald: "border-[rgba(52,211,153,.3)] text-[#34d399]",
  amber: "border-[rgba(245,181,68,.32)] text-[#f5b544]",
  rose: "border-[rgba(251,113,133,.32)] text-[#fb7185]",
} as const;
type ChipToneKey = keyof typeof chipTone;

const semanticInk: Record<"success" | "warning" | "danger", string> = {
  success: "text-[#34d399]",
  warning: "text-[#f5b544]",
  danger: "text-[#fb7185]",
};
const semanticChip: Record<"success" | "warning" | "danger", string> = {
  success: chipTone.emerald,
  warning: chipTone.amber,
  danger: chipTone.rose,
};

const advisorActionChips: Record<AdvisorRecommendation["action"], ChipToneKey> = {
  scale: "emerald",
  adjust_targeting: "accent",
  fix_form: "amber",
  pause_review: "rose",
  keep: "neutral",
};

const gradeChips: Record<NonNullable<QualityRow["qualityGrade"]>, ChipToneKey> = {
  A: "emerald",
  B: "accent",
  C: "amber",
};

// period.start/end chegam como ISO UTC — fatiar evita deslocar o dia por fuso.
const isoDay = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;

// Metric-card CC-5: barra fina de tom (geometria), eyebrow mono, número grande
// mono tabular e micro-tendência textual vinda do Analista (quando houver dado).
function MetricCard({
  eyebrow,
  explain,
  value,
  valueClass = "text-[#e8eef8]",
  detail,
  trend,
  barClass,
}: {
  eyebrow: string;
  explain: string;
  value: string;
  valueClass?: string;
  detail: string;
  trend: ReactNode;
  barClass: string;
}) {
  return (
    <article className={`${cc5Panel} ${cc5PanelHover} p-5`}>
      <span aria-hidden="true" className={`block h-[2px] w-10 rounded-full ${barClass}`} />
      <p className={`${cc5Eyebrow} mt-3`} title={explain}>
        {eyebrow}
      </p>
      <p
        className={`mt-2 font-mono text-3xl font-semibold leading-none tracking-tight tabular-nums sm:text-[34px] ${valueClass}`}
      >
        {value}
      </p>
      <p className="mt-2.5 font-mono text-[11px] leading-5 tabular-nums text-[#aab6ca]">{detail}</p>
      {trend}
    </article>
  );
}

export default function CampaignsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [advisor, setAdvisor] = useState<AdvisorPayload | null>(null);
  const [advisorError, setAdvisorError] = useState("");
  const [advisorLoading, setAdvisorLoading] = useState(true);
  const [analyst, setAnalyst] = useState<AnalystPayload | null>(null);
  const [analystError, setAnalystError] = useState("");
  const [analystLoading, setAnalystLoading] = useState(true);
  const [analystAgeSeconds, setAnalystAgeSeconds] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const response = await fetch(`/api/v1/analytics/campaign-quality?days=${days}`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error?.message || "Painel indisponível");
        if (active) setData(json.data as Payload);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Painel indisponível");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [days, reloadKey]);

  useEffect(() => {
    let active = true;
    (async () => {
      setAdvisorLoading(true);
      setAdvisorError("");
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const response = await fetch(`/api/v1/ai/andromeda-advisor?days=${days}`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error?.message || "Conselheiro indisponível");
        if (active) setAdvisor(json.data as AdvisorPayload);
      } catch (reason) {
        if (active) setAdvisorError(reason instanceof Error ? reason.message : "Conselheiro indisponível");
      } finally {
        if (active) setAdvisorLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [days, reloadKey]);

  useEffect(() => {
    let active = true;
    (async () => {
      setAnalystLoading(true);
      setAnalystError("");
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const response = await fetch(`/api/v1/ai/campaign-analyst?days=${days}`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error?.message || "Analista indisponível");
        if (active) setAnalyst(json.data as AnalystPayload);
      } catch (reason) {
        if (active) setAnalystError(reason instanceof Error ? reason.message : "Analista indisponível");
      } finally {
        if (active) setAnalystLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [days, reloadKey]);

  // "atualizado há Xs" — zera a cada nova resposta do analista.
  useEffect(() => {
    if (!analyst) return;
    setAnalystAgeSeconds(0);
    const timer = setInterval(() => setAnalystAgeSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [analyst]);

  const totals = data?.totals;
  const ranking = data?.ranking ?? [];
  const minimum = data?.policy.minimumLeadsForDecision ?? 30;
  const insufficient = ranking.filter((row) => !row.sampleSufficient).length;

  // Derivações puramente visuais (mesmas contas que a versão anterior exibia).
  const discardCritical = totals ? totals.leads > 0 && totals.discarded / totals.leads > 0.25 : false;

  // Estado honesto da comunicação com a Meta para o strip do topo.
  const metaState = error
    ? { dot: "bg-[#fb7185]", chip: chipTone.rose, label: "FALHA NA LEITURA" }
    : loading
      ? { dot: "bg-[#6b7890] motion-safe:animate-pulse", chip: chipTone.neutral, label: "SINCRONIZANDO…" }
      : data?.policy.windowComplete === false
        ? { dot: "bg-[#f5b544]", chip: chipTone.amber, label: "PISO — JANELA TRUNCADA" }
        : data
          ? { dot: "bg-[#34d399]", chip: chipTone.emerald, label: "DADO COMPLETO" }
          : { dot: "bg-[#6b7890]", chip: chipTone.neutral, label: "AGUARDANDO" };

  // Micro-tendência textual dos metric-cards: anomalias reais do Analista
  // (janela atual vs anterior de mesmo tamanho) — nunca tendência inventada.
  const trendLine = (kind: AnalystAnomaly["kind"]): ReactNode => {
    if (!analyst) return null;
    const floorSuffix = analyst.windowComplete ? "" : " · piso";
    const anomaly = analyst.anomalies.find((item) => item.kind === kind) ?? null;
    if (!anomaly) {
      return (
        <p
          className="mt-1.5 font-mono text-[10px] tabular-nums text-[#6b7890]"
          title={`Comparação com ${isoDay(analyst.period.previous.start)} → ${isoDay(analyst.period.previous.end)}`}
        >
          sem anomalia vs janela anterior{floorSuffix}
        </p>
      );
    }
    return (
      <p
        className={`mt-1.5 truncate font-mono text-[10px] tabular-nums ${semanticInk[analystAnomalyTone(anomaly)]}`}
        title={anomaly.evidence}
      >
        {anomaly.direction === "up" ? "▲" : "▼"} {analystAnomalyDelta(anomaly)} · {anomaly.campaignName}
        {floorSuffix}
      </p>
    );
  };

  return (
    <div className="space-y-4 pb-10" data-phase="campaign-quality">
      {/* ===== Estado da comunicação com a Meta: janela analisada, honestidade
             do dado (completo/piso), custos e controles da janela. ===== */}
      <section
        aria-label="Estado da comunicação com a Meta"
        className={`cc5-reveal ${cc5Panel} flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5`}
      >
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[.18em] text-[#e8eef8]">
          META · ÚLTIMOS <span className="tabular-nums">{data?.period.days ?? days}</span> DIAS
        </p>
        {data ? (
          <p className="font-mono text-[10px] tabular-nums text-[#6b7890]" title="Janela analisada (UTC)">
            {isoDay(data.period.start)} → {isoDay(data.period.end)}
          </p>
        ) : null}
        <p role="status" aria-live="polite" className={`${cc5Chip} ${metaState.chip}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${metaState.dot}`} />
          {metaState.label}
        </p>
        {data && !data.policy.spendMeasured ? (
          <p
            className={`${cc5Chip} ${chipTone.neutral}`}
            title="marketing_spend indisponível — CPL omitido em vez de fingir zero."
          >
            CUSTOS OFF · CPL OMITIDO
          </p>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Período"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className={`rounded-lg border border-[rgba(148,163,184,.12)] bg-white/[.03] px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[.08em] tabular-nums text-[#e8eef8] transition-colors hover:border-[rgba(148,163,184,.22)] ${cc5Focus}`}
          >
            <option className="text-slate-900" value={7}>7 dias</option>
            <option className="text-slate-900" value={30}>30 dias</option>
            <option className="text-slate-900" value={90}>90 dias</option>
          </select>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
            aria-label="Atualizar leitura da Meta e as análises"
            title="Atualizar leitura da Meta e as análises"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(148,163,184,.12)] bg-white/[.03] font-mono text-sm text-[#aab6ca] transition-colors hover:border-[rgba(148,163,184,.22)] hover:text-[#e8eef8] disabled:cursor-wait disabled:opacity-60 ${cc5Focus}`}
          >
            ↻
          </button>
        </div>
      </section>

      {/* ===== Cabeçalho compacto ===== */}
      <header className={`cc5-reveal ${cc5Panel} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={cc5Eyebrow}>MARKETING · CENTRAL DE CAMPANHAS</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#e8eef8] sm:text-3xl">
              Qualidade por campanha
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aab6ca]">
              Quais campanhas trazem leads que qualificam — e quais trazem leads que o time descarta.
              Nota A/B/C explicável, motivos de descarte na taxonomia Meta e custo por lead qualificado
              quando houver investimento lançado.
            </p>
          </div>
          <Link
            href="/marketing/campaign-intelligence"
            className={`inline-flex min-h-11 items-center font-mono text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--atlas-accent)] transition-colors hover:text-[#e8eef8] ${cc5Focus}`}
          >
            Inteligência multicanal →
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[rgba(148,163,184,.12)] pt-4">
          <span
            className={`${cc5Chip} ${chipTone.emerald}`}
            title="Conversão medida no CRM (vendas registradas), não no gerenciador de anúncios."
          >
            CRM é a verdade da conversão
          </span>
          <span
            className={`${cc5Chip} ${chipTone.accent}`}
            title={`Campanha só recebe nota de qualidade a partir de ${minimum} leads na janela.`}
          >
            Amostra mínima · {minimum} leads
          </span>
          <span
            className={`${cc5Chip} ${chipTone.neutral}`}
            title="Lê apenas tabelas vivas: marketing_campaigns, leads, lead_events, marketing_spend."
          >
            Só tabelas vivas
          </span>
        </div>
      </header>

      {/* Erro nunca vira tela vazia: motivo recebido da API + retry visíveis. */}
      {error ? (
        <AtlasRecoverableError
          description={error}
          onRetry={() => setReloadKey((value) => value + 1)}
          busy={loading}
          scope="page"
        />
      ) : null}
      {loading && !data ? <AtlasSkeleton className="h-72 w-full" /> : null}

      {/* ===== 1º na hierarquia: as taxas que decidem verba. ===== */}
      {totals && data ? (
        <section
          aria-label="Indicadores decisivos da janela"
          className="cc5-reveal grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          style={{ animationDelay: "70ms" }}
        >
          <MetricCard
            eyebrow="Taxa de qualificação"
            explain="Decisiva: parcela dos leads da janela que o time qualificou. Fonte: /api/v1/analytics/campaign-quality."
            value={totals.leads > 0 ? `${Math.round((totals.qualified / totals.leads) * 1000) / 10}%` : "—"}
            detail={`${totals.qualified} de ${totals.leads} leads · ${totals.sales} vendas`}
            barClass="bg-[var(--atlas-accent)]"
            trend={trendLine("qualification_rate")}
          />
          <MetricCard
            eyebrow="Taxa de descarte"
            explain="Crítica acima de 25% da janela: leads que o time descartou, com motivo na taxonomia Meta quando classificado."
            value={totals.leads > 0 ? `${Math.round((totals.discarded / totals.leads) * 1000) / 10}%` : "—"}
            valueClass={discardCritical ? "text-[#fb7185]" : "text-[#e8eef8]"}
            detail={
              totals.discarded > 0
                ? `${totals.classifiedDiscards} de ${totals.discarded} com motivo (${Math.round((totals.classifiedDiscards / totals.discarded) * 100)}%)`
                : "nenhum descarte na janela"
            }
            barClass={discardCritical ? "bg-[#fb7185]" : "bg-[rgba(148,163,184,.25)]"}
            trend={trendLine("discard_category_share")}
          />
          <MetricCard
            eyebrow="CPL médio"
            explain="Investimento lançado em marketing_spend dividido pelos leads da janela; por qualificada quando houver qualificação."
            value={
              data.policy.spendMeasured && totals.leads > 0 && totals.spend > 0
                ? brl(totals.spend / totals.leads)
                : "—"
            }
            detail={
              data.policy.spendMeasured
                ? totals.qualified > 0 && totals.spend > 0
                  ? `${brl(totals.spend)} · ${brl(totals.spend / totals.qualified)} por qualificada`
                  : `${brl(totals.spend)} investidos`
                : "custos indisponíveis (marketing_spend)"
            }
            barClass={data.policy.spendMeasured ? "bg-[rgba(148,163,184,.25)]" : "bg-[#f5b544]"}
            trend={trendLine("cost_per_lead")}
          />
          <MetricCard
            eyebrow="Campanhas com leads"
            explain="Campanhas ranqueadas na janela versus o total cadastrado na organização."
            value={`${totals.campaignsRanked}`}
            detail={`${totals.campaigns} na organização · janela de ${data.period.days} dias`}
            barClass="bg-[rgba(148,163,184,.25)]"
            trend={trendLine("lead_volume")}
          />
        </section>
      ) : null}

      {/* ===== Honestidade do dado — sagrada e com tipografia digna. ===== */}
      {data && (data.policy.windowComplete === false || !data.policy.spendMeasured) ? (
        <section
          aria-label="Cobertura e honestidade do dado"
          className={`cc5-reveal ${cc5Panel} p-5`}
          style={{ animationDelay: "70ms" }}
        >
          <p className={cc5Eyebrow} title="O painel declara limites de cobertura em vez de fingir precisão.">
            Cobertura · Honestidade do dado
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {data.policy.windowComplete === false ? (
              <div className={`relative ${cc5Inner} p-4 pl-5`}>
                <span aria-hidden="true" className="absolute bottom-3 left-0 top-3 w-[2px] rounded-full bg-[#f5b544]" />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#f5b544]">
                  Janela truncada
                </p>
                <p className="mt-1.5 text-sm leading-6 text-[#e8eef8]">
                  Janela truncada no teto de paginação —{" "}
                  <strong className="font-semibold">números são piso, não total</strong>.
                </p>
              </div>
            ) : null}
            {!data.policy.spendMeasured ? (
              <div className={`relative ${cc5Inner} p-4 pl-5`}>
                <span aria-hidden="true" className="absolute bottom-3 left-0 top-3 w-[2px] rounded-full bg-[#f5b544]" />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#f5b544]">
                  Custo não medido
                </p>
                <p className="mt-1.5 text-sm leading-6 text-[#e8eef8]">
                  Custos indisponíveis (<span className="font-mono text-[13px]">marketing_spend</span>) —{" "}
                  <strong className="font-semibold">CPL omitido em vez de fingir zero</strong>.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {data && insufficient > 0 ? (
        <div
          role="note"
          aria-label="Campanhas sem amostra mínima"
          className={`cc5-reveal relative ${cc5Panel} p-4 pl-6`}
          style={{ animationDelay: "70ms" }}
        >
          <span aria-hidden="true" className="absolute bottom-4 left-0 top-4 w-[2px] rounded-full bg-[#f5b544]" />
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#f5b544]">
            Amostra mínima · {minimum} leads
          </p>
          <p className="mt-1.5 text-sm leading-6 text-[#aab6ca]">
            {insufficient === 1 ? (
              <>
                <span className="font-mono font-semibold tabular-nums text-[#e8eef8]">1</span> campanha ainda
                não atingiu
              </>
            ) : (
              <>
                <span className="font-mono font-semibold tabular-nums text-[#e8eef8]">{insufficient}</span>{" "}
                campanhas ainda não atingiram
              </>
            )}{" "}
            a amostra mínima de{" "}
            <span className="font-mono font-semibold tabular-nums text-[#e8eef8]">{minimum}</span> leads — sem
            nota de qualidade e sem decisão de verba até lá.
          </p>
        </div>
      ) : null}

      {/* ===== 2º na hierarquia: o ranking campanha a campanha. ===== */}
      {data ? (
        <section
          aria-label="Ranking de campanhas por qualidade"
          className={`cc5-reveal ${cc5Panel}`}
          style={{ animationDelay: "140ms" }}
        >
          <div className="border-b border-[rgba(148,163,184,.12)] p-5 sm:px-6">
            <p
              className={cc5Eyebrow}
              title="Fonte: /api/v1/analytics/campaign-quality — tabelas vivas marketing_campaigns, leads, lead_events, marketing_spend."
            >
              Ranking · Qualidade da lead
            </p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-[#e8eef8]">
              Campanhas ordenadas pela qualidade da lead
            </h2>
            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-[#6b7890]">
              Qualificada = {data.policy.qualifiedDefinition}. Nota A: {data.policy.qualityGradeRule.A}. Nota
              B: {data.policy.qualityGradeRule.B}.
            </p>
          </div>
          <div className="overflow-x-auto p-5 sm:px-6">
            {ranking.length === 0 ? (
              <AtlasEmpty
                reason="no-activity"
                title="Nenhuma campanha com leads na janela"
                description="Assim que leads chegarem com campaign_id preenchido (portais, Meta ou importação), o ranking de qualidade aparece aqui. Amplie o período para 90 dias ou confira as integrações."
                action={<Link href="/integrations" className="atlas-button-secondary inline-flex min-h-11 items-center">Ver integrações</Link>}
              />
            ) : (
              <table className="w-full min-w-[1060px] text-left text-sm text-[#aab6ca]">
                <caption className="sr-only">
                  Campanhas ordenadas pela qualidade da lead na janela de {data.period.days} dias.
                </caption>
                <thead>
                  <tr className="border-b border-[rgba(148,163,184,.12)] font-mono text-[10px] uppercase tracking-[.14em] text-[#6b7890]">
                    <th scope="col" className="py-3 pr-4 font-semibold">Campanha</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Qualidade</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Leads</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Qualificadas</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Score médio</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Descartes</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Vendas</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Investimento</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">CPL</th>
                    <th scope="col" className="py-3 text-right font-semibold">CPL qualificado</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[rgba(148,163,184,.08)] align-top transition-colors last:border-b-0 hover:bg-white/[.02]"
                    >
                      <td className="py-4 pr-4">
                        <div className="font-medium text-[#e8eef8]">{row.name}</div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-[.08em] text-[#6b7890]">
                          {row.platform} · {row.status}
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        {row.sampleSufficient && row.qualityGrade ? (
                          <span className={`${cc5Chip} ${chipTone[gradeChips[row.qualityGrade]]}`}>
                            NOTA {row.qualityGrade}
                          </span>
                        ) : (
                          <span
                            className={`${cc5Chip} ${chipTone.amber}`}
                            title={`Abaixo da amostra mínima de ${minimum} leads — sem nota e sem decisão de verba.`}
                          >
                            AMOSTRA INSUFICIENTE
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular-nums text-[#e8eef8]">{row.leads}</td>
                      <td className="py-4 pr-4 text-right">
                        <span className="font-mono tabular-nums text-[#e8eef8]">{row.qualifiedLeads}</span>{" "}
                        <span className="font-mono text-xs tabular-nums text-[#6b7890]">
                          ({row.qualificationRate}%)
                        </span>
                        <span
                          aria-hidden="true"
                          className="ml-auto mt-1.5 block h-[3px] w-16 overflow-hidden rounded-full bg-white/[.05]"
                        >
                          <span
                            className="block h-full rounded-full bg-[var(--atlas-accent)] opacity-80"
                            style={{ width: `${Math.min(100, Math.max(0, row.qualificationRate))}%` }}
                          />
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular-nums text-[#e8eef8]">
                        {row.avgScore ?? "—"}
                      </td>
                      <td className="py-4 pr-4 text-right">
                        <span
                          className={`font-mono tabular-nums ${
                            row.discardRate !== null && row.discardRate > 25 ? "text-[#fb7185]" : "text-[#e8eef8]"
                          }`}
                        >
                          {row.discarded}
                        </span>
                        {row.discardRate !== null && row.discarded > 0 ? (
                          <span className="font-mono text-xs tabular-nums text-[#6b7890]"> ({row.discardRate}%)</span>
                        ) : null}
                        {row.topDiscardReason ? (
                          <div className="mt-1 text-xs text-[#6b7890]">Principal: {row.topDiscardReason.label}</div>
                        ) : null}
                        {row.discardsByMetaCategory.length ? (
                          <div className="mt-2 flex flex-wrap justify-end gap-1">
                            {row.discardsByMetaCategory.slice(0, 3).map((item) => (
                              <span
                                key={item.category}
                                className={`${cc5Chip} ${chipTone.neutral} px-2 py-0.5 tracking-[.06em]`}
                              >
                                {metaCategoryLabels[item.category] ?? item.category} · {item.count}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4 text-right">
                        <span className="font-mono tabular-nums text-[#e8eef8]">{row.sales}</span>{" "}
                        <span className="font-mono text-xs tabular-nums text-[#6b7890]">({row.conversionRate}%)</span>
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular-nums text-[#e8eef8]">
                        {row.spend > 0 ? brl(row.spend) : "—"}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular-nums text-[#e8eef8]">
                        {row.costPerLead === null ? "—" : brl(row.costPerLead)}
                      </td>
                      <td className="py-4 text-right font-mono tabular-nums text-[#e8eef8]">
                        {row.costPerQualifiedLead === null ? "—" : brl(row.costPerQualifiedLead)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : null}

      {/* ===== 3º na hierarquia: IA em painéis distintos e explicáveis —
             o Analista NARRA, o Conselheiro RECOMENDA. ===== */}
      <section
        aria-label="Análises de IA da central de campanhas"
        className="cc5-reveal grid items-start gap-4 xl:grid-cols-2"
        style={{ animationDelay: "140ms" }}
      >
        <article aria-label="Analista Andromeda em dedicação integral" className={`${cc5Panel} ${cc5PanelHover} p-5 sm:p-6`}>
          {/* Flutuação MUITO sutil do robô — keyframes inline (globals.css é
              intocável) sob motion-safe: zero movimento em reduced-motion. */}
          <style>{"@keyframes atlasAnalystFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}"}</style>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p
              className={cc5Eyebrow}
              title="Narra a janela: compara com o período anterior de mesmo tamanho e aponta anomalias."
            >
              Analista · Dedicação full-time
            </p>
            {analyst ? (
              <span className={`${cc5Chip} ${analyst.engine === "generative" ? chipTone.accent : chipTone.neutral}`}>
                {analyst.engine === "generative" ? "IA GENERATIVA" : "DETERMINÍSTICO"}
              </span>
            ) : null}
            {analyst ? (
              <span className="ml-auto font-mono text-[10px] tabular-nums text-[#6b7890]">
                atualizado há {analystAgeSeconds}s
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 font-mono text-[10px] leading-4 text-[#6b7890]">
            fonte /api/v1/ai/campaign-analyst · só agregados · zero PII · narra; quem recomenda é o conselheiro
          </p>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
            <figure className={`${cc5Inner} shrink-0 self-center px-3 pb-2 pt-3 sm:self-start`}>
              <div className="motion-safe:[animation:atlasAnalystFloat_7s_ease-in-out_infinite]">
                <Image
                  src="/brand/atlas-robot-assistant.png"
                  alt="Robô analista Atlas em dedicação integral às campanhas"
                  width={140}
                  height={210}
                  className="h-auto w-[96px] object-contain sm:w-[112px]"
                />
              </div>
              <figcaption className="mt-2 border-t border-[rgba(148,163,184,.12)] pt-1.5 text-center font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-[#6b7890]">
                Andromeda · on
              </figcaption>
            </figure>
            <div className="min-w-0 flex-1 space-y-3">
              {analystError ? (
                <AtlasRecoverableError
                  description={analystError}
                  onRetry={() => setReloadKey((value) => value + 1)}
                  busy={analystLoading}
                  scope="module"
                />
              ) : analystLoading && !analyst ? (
                <AtlasSkeleton className="h-24 w-full" />
              ) : analyst && data && data.ranking.length === 0 ? (
                <AtlasEmpty
                  reason="no-activity"
                  title="Nada para narrar ainda"
                  description="Assim que campanhas tiverem leads na janela, o analista compara a janela atual com a anterior, aponta anomalias e escreve o resumo executivo aqui."
                />
              ) : analyst ? (
                <>
                  <p aria-live="polite" className="max-w-[62ch] text-[15px] leading-8 text-[#e8eef8]">
                    {analyst.narrative}
                  </p>
                  {analyst.anomalies.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {analyst.anomalies.slice(0, 6).map((anomaly) => (
                        <span
                          key={`${anomaly.campaignId}-${anomaly.kind}`}
                          title={anomaly.evidence}
                          className={`${cc5Chip} ${semanticChip[analystAnomalyTone(anomaly)]}`}
                        >
                          {analystKindLabels[anomaly.kind]} {analystAnomalyDelta(anomaly)} · {anomaly.campaignName}
                        </span>
                      ))}
                      {analyst.anomalies.length > 6 ? (
                        <span className={`${cc5Chip} ${chipTone.neutral}`}>+{analyst.anomalies.length - 6}</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-[#6b7890]">
                      Nenhuma anomalia entre a janela atual e a anterior de mesmo tamanho.
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </article>

        <article aria-label="Conselheiro Andromeda" className={`${cc5Panel} ${cc5PanelHover} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p
              className={cc5Eyebrow}
              title="Recomenda o próximo passo por campanha cruzando qualidade, funil e descartes."
            >
              Conselheiro · Pipeline × Andromeda
            </p>
            {advisor ? (
              <span className={`${cc5Chip} ${advisor.engine === "generative" ? chipTone.accent : chipTone.neutral}`}>
                {advisor.engine === "generative"
                  ? `IA GENERATIVA${advisor.model ? ` · ${advisor.model}` : ""}`
                  : "REGRAS DETERMINÍSTICAS"}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 font-mono text-[10px] leading-4 text-[#6b7890]">
            fonte /api/v1/ai/andromeda-advisor · só agregados · zero PII · nada é aplicado na Meta automaticamente
          </p>
          <div className="mt-4 space-y-3">
            <div className={`relative ${cc5Inner} p-4 pl-5`}>
              <span aria-hidden="true" className="absolute bottom-3 left-0 top-3 w-[2px] rounded-full bg-[#f5b544]" />
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#f5b544]">
                Trava de segurança
              </p>
              <p className="mt-1.5 text-sm leading-6 text-[#aab6ca]">
                Aprovação humana obrigatória: cada recomendação é um conselho para o gestor executar — o Atlas
                não altera verba, não pausa campanha e não envia nada à Meta automaticamente.
              </p>
            </div>
            {advisorError ? (
              <AtlasRecoverableError
                description={advisorError}
                onRetry={() => setReloadKey((value) => value + 1)}
                busy={advisorLoading}
                scope="module"
              />
            ) : advisorLoading && !advisor ? (
              <AtlasSkeleton className="h-40 w-full" />
            ) : !advisor || advisor.recommendations.length === 0 ? (
              <AtlasEmpty
                reason="no-activity"
                title="Nenhuma recomendação na janela"
                description="Assim que campanhas tiverem leads na janela, o conselheiro cruza qualidade, funil e descartes para sugerir o próximo passo — sempre sob aprovação humana."
              />
            ) : (
              <ul className="space-y-3">
                {advisor.recommendations.map((rec) => (
                  <li key={rec.campaignId} className={`${cc5Inner} ${cc5InnerHover} p-4`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`${cc5Chip} ${chipTone[advisorActionChips[rec.action]]}`}>
                        {advisorActionLabels[rec.action]}
                      </span>
                      <span className="font-medium text-[#e8eef8]">{rec.campaignName}</span>
                      <span className="ml-auto font-mono text-[10px] uppercase tracking-[.14em] text-[#6b7890]">
                        confiança {advisorConfidenceLabels[rec.confidence]}
                      </span>
                    </div>
                    <p className="mt-2.5 text-sm leading-6 text-[#aab6ca]">{rec.rationale}</p>
                    <div className="mt-2.5 border-t border-[rgba(148,163,184,.12)] pt-2.5">
                      <p className="font-mono text-[9px] font-semibold uppercase tracking-[.16em] text-[var(--atlas-accent)]">
                        Feedback → Meta
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#aab6ca]">{rec.metaFeedbackHint}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
