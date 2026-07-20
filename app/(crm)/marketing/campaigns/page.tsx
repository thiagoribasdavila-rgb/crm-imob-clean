"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

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

const advisorActionTones: Record<AdvisorRecommendation["action"], "success" | "info" | "warning" | "danger" | "neutral"> = {
  scale: "success",
  adjust_targeting: "info",
  fix_form: "warning",
  pause_review: "danger",
  keep: "neutral",
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
const gradeTone = (grade: QualityRow["qualityGrade"]) =>
  grade === "A" ? "success" : grade === "B" ? "info" : "warning";

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

  return (
    <div className="space-y-6 pb-10" data-phase="campaign-quality">
      <section className="atlas-grid-glow rounded-[30px] border border-sky-400/10 bg-gradient-to-br from-sky-500/[.12] via-blue-500/[.07] to-emerald-500/[.08] p-6 sm:p-8">
        <div className="flex flex-wrap gap-2">
          <AtlasBadge tone="success">CRM É A VERDADE DA CONVERSÃO</AtlasBadge>
          <AtlasBadge tone="info">AMOSTRA MÍNIMA: {minimum} LEADS</AtlasBadge>
          <AtlasBadge tone="violet">SÓ TABELAS VIVAS</AtlasBadge>
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-white sm:text-5xl">Qualidade por campanha</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Quais campanhas trazem leads que qualificam — e quais trazem leads que o time descarta.
          Nota A/B/C explicável, motivos de descarte na taxonomia Meta e custo por lead qualificado quando houver investimento lançado.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <select
            aria-label="Período"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white"
          >
            <option className="text-slate-900" value={7}>7 dias</option>
            <option className="text-slate-900" value={30}>30 dias</option>
            <option className="text-slate-900" value={90}>90 dias</option>
          </select>
          <Link href="/marketing/campaign-intelligence" className="rounded-full border border-violet-300/30 px-4 py-2 text-xs font-semibold text-violet-200">
            Abrir inteligência multicanal
          </Link>
        </div>
      </section>

      <section
        aria-label="Analista Andromeda em dedicação integral"
        className="rounded-3xl border border-white/[.06] bg-white/[.03] p-5 sm:p-6"
      >
        {/* Flutuação MUITO sutil do robô — keyframes inline (globals.css é
            intocável) sob motion-safe: zero movimento em reduced-motion. */}
        <style>{"@keyframes atlasAnalystFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}"}</style>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="shrink-0 self-center sm:self-start motion-safe:[animation:atlasAnalystFloat_7s_ease-in-out_infinite]">
            <Image
              src="/brand/atlas-robot-assistant.png"
              alt="Robô analista Atlas em dedicação integral às campanhas"
              width={140}
              height={210}
              className="h-auto w-[110px] object-contain sm:w-[140px]"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">
                Analista Andromeda · dedicação integral
              </p>
              {analyst ? (
                <AtlasBadge tone={analyst.engine === "generative" ? "violet" : "neutral"}>
                  {analyst.engine === "generative" ? "IA GENERATIVA" : "DETERMINÍSTICO"}
                </AtlasBadge>
              ) : null}
              {analyst ? (
                <span className="text-[10px] text-slate-500">atualizado há {analystAgeSeconds}s</span>
              ) : null}
            </div>
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
                <p aria-live="polite" className="text-sm leading-7 text-slate-200">
                  {analyst.narrative}
                </p>
                {analyst.anomalies.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {analyst.anomalies.slice(0, 6).map((anomaly) => (
                      <span key={`${anomaly.campaignId}-${anomaly.kind}`} title={anomaly.evidence}>
                        <AtlasBadge tone={analystAnomalyTone(anomaly)}>
                          {analystKindLabels[anomaly.kind]} {analystAnomalyDelta(anomaly)} · {anomaly.campaignName}
                        </AtlasBadge>
                      </span>
                    ))}
                    {analyst.anomalies.length > 6 ? (
                      <AtlasBadge tone="neutral">+{analyst.anomalies.length - 6}</AtlasBadge>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Nenhuma anomalia entre a janela atual e a anterior de mesmo tamanho.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <AtlasRecoverableError
          description={error}
          onRetry={() => setReloadKey((value) => value + 1)}
          busy={loading}
          scope="page"
        />
      ) : null}
      {loading && !data ? <AtlasSkeleton className="h-72 w-full" /> : null}

      {totals ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AtlasMetric label="Campanhas com leads" value={totals.campaignsRanked} detail={`${totals.campaigns} campanhas na organização`} trend={`${data?.period.days ?? days} DIAS`} tone="blue" />
          <AtlasMetric label="Leads na janela" value={totals.leads} detail={`${totals.qualified} qualificadas · ${totals.sales} vendas`} trend="CRM" tone="green" />
          <AtlasMetric label="Descartes" value={totals.discarded} detail={`${totals.classifiedDiscards} com motivo classificado`} trend="TAXONOMIA META" tone="violet" />
          <AtlasMetric
            label="Investimento"
            value={data?.policy.spendMeasured ? brl(totals.spend) : "—"}
            detail={data?.policy.spendMeasured ? "Base marketing_spend" : "marketing_spend indisponível"}
            trend="CUSTO"
            tone="amber"
          />
        </section>
      ) : null}

      {data && insufficient > 0 ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
          {insufficient === 1 ? "1 campanha ainda não atingiu" : `${insufficient} campanhas ainda não atingiram`} a amostra mínima de {minimum} leads —
          sem nota de qualidade e sem decisão de verba até lá.
        </div>
      ) : null}

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Conselheiro Andromeda"
          title="Recomendações Pipeline × Andromeda"
          description="Conselho explicável por campanha, gerado só com dados agregados (zero dados pessoais). Nada é aplicado automaticamente na Meta."
          action={advisor ? (
            <AtlasBadge tone={advisor.engine === "generative" ? "violet" : "info"}>
              {advisor.engine === "generative"
                ? `IA GENERATIVA${advisor.model ? ` · ${advisor.model}` : ""}`
                : "REGRAS DETERMINÍSTICAS"}
            </AtlasBadge>
          ) : null}
        />
        <div className="space-y-4 px-5 pb-5">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
            Aprovação humana obrigatória: cada recomendação é um conselho para o gestor executar —
            o Atlas não altera verba, não pausa campanha e não envia nada à Meta automaticamente.
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
                <li key={rec.campaignId} className="rounded-2xl border border-white/[.06] bg-white/[.03] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <AtlasBadge tone={advisorActionTones[rec.action]}>{advisorActionLabels[rec.action]}</AtlasBadge>
                    <span className="font-medium text-white">{rec.campaignName}</span>
                    <span className="text-xs uppercase tracking-wider text-slate-500">
                      Confiança {advisorConfidenceLabels[rec.confidence]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{rec.rationale}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    <span className="font-semibold text-slate-300">Feedback para a Meta:</span> {rec.metaFeedbackHint}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AtlasCard>

      {data ? (
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Ranking por qualidade"
            title="Campanhas ordenadas pela qualidade da lead"
            description={`Qualificada = ${data.policy.qualifiedDefinition}. Nota A: ${data.policy.qualityGradeRule.A}. Nota B: ${data.policy.qualityGradeRule.B}.`}
          />
          <div className="overflow-x-auto px-5 pb-5">
            {ranking.length === 0 ? (
              <AtlasEmpty
                reason="no-activity"
                title="Nenhuma campanha com leads na janela"
                description="Assim que leads chegarem com campaign_id preenchido (portais, Meta ou importação), o ranking de qualidade aparece aqui. Amplie o período para 90 dias ou confira as integrações."
                action={<Link href="/integrations" className="atlas-button-secondary inline-flex min-h-11 items-center">Ver integrações</Link>}
              />
            ) : (
              <table className="w-full min-w-[1080px] text-left text-sm text-slate-300">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">Campanha</th>
                    <th className="pr-4">Plataforma</th>
                    <th className="pr-4">Leads</th>
                    <th className="pr-4">Qualificadas</th>
                    <th className="pr-4">Score médio</th>
                    <th className="pr-4">Descartes</th>
                    <th className="pr-4">Vendas</th>
                    <th className="pr-4">Investimento</th>
                    <th className="pr-4">CPL</th>
                    <th className="pr-4">CPL qualificado</th>
                    <th>Qualidade</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row) => (
                    <tr key={row.id} className="border-t border-white/[.06] align-top">
                      <td className="py-4 pr-4">
                        <div className="font-medium text-white">{row.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.status}</div>
                      </td>
                      <td className="py-4 pr-4">{row.platform}</td>
                      <td className="py-4 pr-4">{row.leads}</td>
                      <td className="py-4 pr-4">
                        <span className="text-white">{row.qualifiedLeads}</span>
                        <span className="text-xs text-slate-500"> ({row.qualificationRate}%)</span>
                      </td>
                      <td className="py-4 pr-4">{row.avgScore ?? "—"}</td>
                      <td className="py-4 pr-4">
                        <span className="text-white">{row.discarded}</span>
                        {row.discardRate !== null && row.discarded > 0 ? (
                          <span className="text-xs text-slate-500"> ({row.discardRate}%)</span>
                        ) : null}
                        {row.topDiscardReason ? (
                          <div className="mt-1 text-xs text-slate-500">Principal: {row.topDiscardReason.label}</div>
                        ) : null}
                        {row.discardsByMetaCategory.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {row.discardsByMetaCategory.slice(0, 3).map((item) => (
                              <AtlasBadge key={item.category} tone="neutral">
                                {metaCategoryLabels[item.category] ?? item.category} · {item.count}
                              </AtlasBadge>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4">
                        <span className="text-white">{row.sales}</span>
                        <span className="text-xs text-slate-500"> ({row.conversionRate}%)</span>
                      </td>
                      <td className="py-4 pr-4">{row.spend > 0 ? brl(row.spend) : "—"}</td>
                      <td className="py-4 pr-4">{row.costPerLead === null ? "—" : brl(row.costPerLead)}</td>
                      <td className="py-4 pr-4">{row.costPerQualifiedLead === null ? "—" : brl(row.costPerQualifiedLead)}</td>
                      <td className="py-4">
                        {row.sampleSufficient && row.qualityGrade ? (
                          <AtlasBadge tone={gradeTone(row.qualityGrade)}>NOTA {row.qualityGrade}</AtlasBadge>
                        ) : (
                          <AtlasBadge tone="warning">AMOSTRA INSUFICIENTE</AtlasBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </AtlasCard>
      ) : null}
    </div>
  );
}
