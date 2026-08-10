"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LIVE_LEAD_SELECT,
  leadAsOpportunity,
  mapLegacyLead,
} from "@/lib/compat/legacy-v2";
import {
  WeeklyDeveloperPerformance,
  type WeeklyAcquisitionReport,
} from "@/components/reports/WeeklyDeveloperPerformance";

type Period = "day" | "week" | "month" | "all";
type Lead = {
  id: string;
  status: string | null;
  source: string | null;
  score: number | null;
  created_at: string;
};
type Opportunity = {
  id: string;
  stage: string;
  value: number | null;
  probability: number;
  created_at: string;
  won_at: string | null;
};
type Campaign = {
  id: string;
  name: string;
  status: string | null;
  spend: number | null;
  revenue: number | null;
  leads_count: number | null;
  sales_count: number | null;
  created_at: string;
};
type Briefing = {
  status: string;
  signals: Array<{
    id: string;
    severity: string;
    title: string;
    evidence: string;
    action: string;
    href: string;
  }>;
};
type WeeklyReview = {
  outcomes: {
    completedTasks: number;
    completedVisits: number;
    interactions: number;
    newLeads: number;
  };
  backlog: {
    openTasks: number;
    overdueTasks: number;
    leadsWithoutNextAction: number;
    hotLeadsWithoutNextAction: number;
    noShows: number;
  };
  quality: {
    completionRate: number | null;
    sampleSize: number;
    minimumSample: number;
    sufficientSample: boolean;
  };
  plan: Array<{
    key: string;
    title: string;
    evidence: string;
    action: string;
    href: string;
  }>;
  method: {
    llmCost: number;
    peopleRanking: boolean;
    humanDecisionRequired: boolean;
  };
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

const moneyOrUnavailable = (value: number | null) =>
  value === null ? "Não informado" : money(value);

const metricOrUnavailable = (value: number | null, suffix = "") =>
  value === null ? "Não informado" : `${value.toFixed(1)}${suffix}`;

const periodLabel = (period: Period) =>
  ({
    day: "hoje",
    week: "os últimos 7 dias",
    month: "os últimos 30 dias",
    all: "todo o histórico visível",
  })[period];

const campaignStatusLabel = (status: string | null) => {
  if (!status) return "Não informado";

  return status
    .trim()
    .replaceAll("_", " ")
    .toLocaleLowerCase("pt-BR")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("pt-BR"));
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNullableFiniteNumber = (value: unknown): value is number | null =>
  value === null || isFiniteNumber(value);

const hasStringFields = (value: unknown, fields: string[]) =>
  isRecord(value) && fields.every((field) => typeof value[field] === "string");

const hasNumberFields = (value: unknown, fields: string[]) =>
  isRecord(value) && fields.every((field) => isFiniteNumber(value[field]));

const hasNullableNumberFields = (value: unknown, fields: string[]) =>
  isRecord(value) &&
  fields.every((field) => isNullableFiniteNumber(value[field]));

const isStageBreakdown = (value: unknown) =>
  hasNumberFields(value, [
    "novo",
    "contato",
    "qualificacao",
    "visita",
    "proposta",
    "contrato",
    "ganho",
    "outros",
  ]);

const isBriefing = (value: unknown): value is Briefing =>
  isRecord(value) &&
  typeof value.status === "string" &&
  Array.isArray(value.signals) &&
  value.signals.every((signal) =>
    hasStringFields(signal, [
      "id",
      "severity",
      "title",
      "evidence",
      "action",
      "href",
    ]),
  );

const isWeeklyReview = (value: unknown): value is WeeklyReview => {
  if (
    !isRecord(value) ||
    !isRecord(value.outcomes) ||
    !isRecord(value.backlog)
  ) {
    return false;
  }

  return (
    hasNumberFields(value.outcomes, [
      "completedTasks",
      "completedVisits",
      "interactions",
      "newLeads",
    ]) &&
    hasNumberFields(value.backlog, [
      "openTasks",
      "overdueTasks",
      "leadsWithoutNextAction",
      "hotLeadsWithoutNextAction",
      "noShows",
    ]) &&
    isRecord(value.quality) &&
    hasNullableNumberFields(value.quality, ["completionRate"]) &&
    hasNumberFields(value.quality, ["sampleSize", "minimumSample"]) &&
    typeof value.quality.sufficientSample === "boolean" &&
    Array.isArray(value.plan) &&
    value.plan.every((item) =>
      hasStringFields(item, ["key", "title", "evidence", "action", "href"]),
    ) &&
    isRecord(value.method) &&
    isFiniteNumber(value.method.llmCost) &&
    typeof value.method.peopleRanking === "boolean" &&
    typeof value.method.humanDecisionRequired === "boolean"
  );
};

const isWeeklyAcquisitionReport = (
  value: unknown,
): value is WeeklyAcquisitionReport => {
  if (
    !isRecord(value) ||
    !isRecord(value.totals) ||
    !isRecord(value.period) ||
    !isRecord(value.service) ||
    !isRecord(value.dataQuality) ||
    !Array.isArray(value.campaigns) ||
    !Array.isArray(value.developers) ||
    !Array.isArray(value.brokerResults) ||
    !Array.isArray(value.projectResults) ||
    !Array.isArray(value.projectBrokerResults) ||
    !Array.isArray(value.dailyDistribution) ||
    !Array.isArray(value.warnings)
  ) {
    return false;
  }

  const stageRowsAreValid = (rows: unknown[]) =>
    rows.every((row) => isRecord(row) && isStageBreakdown(row.stages));
  const projectRowsAreValid = (rows: unknown[]) =>
    rows.every(
      (row) =>
        isRecord(row) &&
        isStageBreakdown(row.stages) &&
        isRecord(row.service) &&
        hasNumberFields(row.service, [
          "measured",
          "within5Minutes",
          "within15Minutes",
          "within30Minutes",
        ]) &&
        hasNullableNumberFields(row.service, [
          "averageFirstContactMinutes",
          "within15Rate",
          "within30Rate",
          "coverageRate",
        ]),
    );
  const dailyDistributionRowsAreValid = (rows: unknown[]) =>
    rows.every(
      (row) =>
        isRecord(row) &&
        hasStringFields(row, [
          "date",
          "developer",
          "projectName",
          "brokerName",
        ]) &&
        (row.developerId === null || typeof row.developerId === "string") &&
        (row.developmentId === null || typeof row.developmentId === "string") &&
        (row.brokerId === null || typeof row.brokerId === "string") &&
        hasNumberFields(row, ["leads", "assigned", "contacted"]),
    );

  return (
    hasNumberFields(value.totals, [
      "leads",
      "assigned",
      "contacted",
      "qualified",
      "visits",
      "proposals",
      "wins",
      "unassigned",
      "interactions",
      "campaigns",
      "developers",
    ]) &&
    hasNullableNumberFields(value.totals, [
      "spend",
      "cpl",
      "costPerQualified",
      "costPerWin",
      "contactRate",
      "leadToWinRate",
    ]) &&
    hasStringFields(value.period, ["start", "end"]) &&
    hasNumberFields(value.service, [
      "measured",
      "within5Minutes",
      "within15Minutes",
      "within30Minutes",
    ]) &&
    hasNullableNumberFields(value.service, [
      "averageFirstContactMinutes",
      "within15Rate",
      "within30Rate",
      "coverageRate",
    ]) &&
    hasNumberFields(value.dataQuality, [
      "completeAttribution",
      "missingProject",
      "missingDeveloper",
      "missingCampaign",
      "missingSource",
      "unassigned",
    ]) &&
    hasNullableNumberFields(value.dataQuality, [
      "projectCoverageRate",
      "developerCoverageRate",
      "campaignCoverageRate",
      "sourceCoverageRate",
    ]) &&
    value.warnings.every((warning) => typeof warning === "string") &&
    value.campaigns.every(
      (row) =>
        isRecord(row) &&
        hasStringFields(row, [
          "campaignId",
          "campaignName",
          "responsibleDeveloper",
          "costSource",
        ]) &&
        (row.responsibleDeveloperId === null ||
          typeof row.responsibleDeveloperId === "string") &&
        hasNumberFields(row, [
          "leads",
          "contacted",
          "qualified",
          "visits",
          "proposals",
          "wins",
        ]) &&
        hasNullableNumberFields(row, [
          "spend",
          "cpl",
          "costPerQualified",
          "costPerWin",
          "leadToWinRate",
        ]),
    ) &&
    value.developers.every(
      (row) =>
        hasStringFields(row, ["developer", "allocation"]) &&
        hasNumberFields(row, [
          "leads",
          "contacted",
          "qualified",
          "visits",
          "proposals",
          "wins",
          "campaigns",
          "brokers",
          "projects",
        ]) &&
        hasNullableNumberFields(row, [
          "spend",
          "cpl",
          "costPerQualified",
          "costPerWin",
          "leadToWinRate",
        ]),
    ) &&
    stageRowsAreValid(value.brokerResults) &&
    projectRowsAreValid(value.projectResults) &&
    stageRowsAreValid(value.projectBrokerResults) &&
    dailyDistributionRowsAreValid(value.dailyDistribution)
  );
};

export default function ReportsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [referenceTime, setReferenceTime] = useState(0);
  const [weekly, setWeekly] = useState<WeeklyAcquisitionReport | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);
  const latestLoad = useRef(0);
  const isMounted = useRef(false);

  const load = useCallback(async () => {
    const loadId = ++latestLoad.current;
    const isCurrentLoad = () =>
      isMounted.current && latestLoad.current === loadId;

    if (isCurrentLoad()) {
      setLoading(true);
      setError(null);
    }

    try {
      const [leadResult, campaignResult] = await Promise.all([
        supabase
          .from("leads")
          .select(LIVE_LEAD_SELECT)
          .not("status", "in", "(arquivado,ARQUIVADO,archived,ARCHIVED)")
          .limit(5000),
        supabase
          .from("marketing_campaigns")
          .select("id,name,status,created_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (!isCurrentLoad()) return;
      const firstError = leadResult.error ?? campaignResult.error;
      if (firstError) {
        setError("Parte dos relatórios está temporariamente indisponível.");
      }
      if (!leadResult.error) {
        const mappedLeads = (
          (leadResult.data ?? []) as unknown as Record<string, unknown>[]
        ).map(mapLegacyLead);
        setLeads(mappedLeads as Lead[]);
        setOpportunities(mappedLeads.map(leadAsOpportunity) as Opportunity[]);
        setReferenceTime(Date.now());
      }
      if (!campaignResult.error) {
        setCampaigns(
          (
            (campaignResult.data ?? []) as unknown as Array<
              Record<string, unknown>
            >
          ).map((campaign) => ({
            id: String(campaign.id),
            name: String(campaign.name || "Campanha"),
            status:
              typeof campaign.status === "string" ? campaign.status : null,
            // A lista de campanhas não traz custo ou receita. Nunca trate ausência
            // de integração como resultado financeiro igual a zero.
            spend: null,
            revenue: null,
            leads_count: null,
            sales_count: null,
            created_at: String(
              campaign.created_at || new Date(0).toISOString(),
            ),
          })),
        );
      }
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.access_token) {
        const headers = {
          Authorization: `Bearer ${session.session.access_token}`,
        };
        const [response, weeklyResponse, reviewResponse] = await Promise.all([
          fetch("/api/ai/briefing", { headers, cache: "no-store" }),
          fetch("/api/v1/analytics/weekly-acquisition", {
            headers,
            cache: "no-store",
          }),
          fetch("/api/v1/productivity/weekly", { headers, cache: "no-store" }),
        ]);
        if (!isCurrentLoad()) return;
        if (response.ok) {
          const payload: unknown = await response.json();
          if (isBriefing(payload)) {
            setBriefing(payload);
          } else {
            setError(
              "Parte dos relatórios recebeu uma resposta incompleta. Os últimos dados válidos foram preservados.",
            );
          }
        }
        if (weeklyResponse.ok) {
          const payload: unknown = await weeklyResponse.json();
          if (isWeeklyAcquisitionReport(payload)) {
            setWeekly(payload);
          } else {
            setError(
              "Parte dos relatórios recebeu uma resposta incompleta. Os últimos dados válidos foram preservados.",
            );
          }
        }
        if (reviewResponse.ok) {
          const payload: unknown = await reviewResponse.json();
          if (!isCurrentLoad()) return;
          const report =
            isRecord(payload) && "data" in payload ? payload.data : payload;
          if (isWeeklyReview(report)) {
            setWeeklyReview(report);
          } else {
            setError(
              "Parte dos relatórios recebeu uma resposta incompleta. Os últimos dados válidos foram preservados.",
            );
          }
        }
      }
    } catch {
      if (!isCurrentLoad()) return;
      setError(
        "Não foi possível atualizar os relatórios agora. Seus dados não foram alterados.",
      );
    } finally {
      if (isCurrentLoad()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void load();
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  const periodData = useMemo(() => {
    const days =
      period === "day"
        ? 1
        : period === "week"
          ? 7
          : period === "month"
            ? 30
            : null;
    const since = days ? referenceTime - days * 86_400_000 : 0;
    const recent = (date: string | null) =>
      !days || Boolean(date && new Date(date).getTime() >= since);
    return {
      leads: leads.filter((item) => recent(item.created_at)),
      opportunities: opportunities.filter((item) => recent(item.created_at)),
      campaigns: campaigns.filter((item) => recent(item.created_at)),
    };
  }, [campaigns, leads, opportunities, period, referenceTime]);

  const metrics = useMemo(() => {
    const vgv = periodData.opportunities.reduce(
      (sum, item) => sum + Number(item.value ?? 0),
      0,
    );
    const forecast = periodData.opportunities.reduce(
      (sum, item) =>
        sum + (Number(item.value ?? 0) * Number(item.probability ?? 0)) / 100,
      0,
    );
    const won = periodData.opportunities.filter((item) =>
      ["ganho", "won", "fechado"].includes(item.stage),
    ).length;
    const campaignsWithSpend = periodData.campaigns.filter(
      (item) => item.spend !== null,
    );
    const campaignsWithRevenue = periodData.campaigns.filter(
      (item) => item.revenue !== null,
    );
    const campaignsWithLeadCount = periodData.campaigns.filter(
      (item) => item.leads_count !== null,
    );
    const spend = campaignsWithSpend.length
      ? campaignsWithSpend.reduce((sum, item) => sum + (item.spend ?? 0), 0)
      : null;
    const revenue = campaignsWithRevenue.length
      ? campaignsWithRevenue.reduce((sum, item) => sum + (item.revenue ?? 0), 0)
      : null;
    const campaignLeads = campaignsWithLeadCount.length
      ? campaignsWithLeadCount.reduce(
          (sum, item) => sum + (item.leads_count ?? 0),
          0,
        )
      : null;
    return {
      vgv,
      forecast,
      won,
      conversion: periodData.leads.length
        ? (won / periodData.leads.length) * 100
        : 0,
      spend,
      revenue,
      roi:
        spend !== null && revenue !== null && spend > 0
          ? ((revenue - spend) / spend) * 100
          : null,
      cpl:
        spend !== null && campaignLeads !== null && campaignLeads > 0
          ? spend / campaignLeads
          : null,
      averageScore: periodData.leads.length
        ? periodData.leads.reduce(
            (sum, item) => sum + Number(item.score ?? 0),
            0,
          ) / periodData.leads.length
        : 0,
    };
  }, [periodData]);

  const funnel = [
    "novo",
    "contato",
    "qualificacao",
    "visita",
    "proposta",
    "contrato",
    "ganho",
  ].map((status) => ({
    status,
    total: periodData.leads.filter((lead) => lead.status === status).length,
  }));

  const sources = Array.from(
    new Set(periodData.leads.map((lead) => lead.source || "não informada")),
  )
    .map((source) => ({
      source,
      total: periodData.leads.filter(
        (lead) => (lead.source || "não informada") === source,
      ).length,
    }))
    .sort((a, b) => b.total - a.total);

  const reportStart = (() => {
    const days = period === "day" ? 1 : period === "week" ? 7 : period === "month" ? 30 : null;
    return days ? new Date(referenceTime - days * 86_400_000).toISOString() : null;
  })();

  const leadsBySourceHref = (source: string) => {
    const params = new URLSearchParams({ source });
    if (reportStart) params.set("created_after", reportStart);
    return `/leads?${params.toString()}`;
  };

  const leadsMissingSourceHref = () => {
    const params = new URLSearchParams({ quality: "missing_source" });
    if (reportStart) params.set("created_after", reportStart);
    return `/leads?${params.toString()}`;
  };

  const leadsByCampaignHref = (campaignId: string) => {
    const params = new URLSearchParams({ campaign: campaignId });
    if (reportStart) params.set("created_after", reportStart);
    return `/leads?${params.toString()}`;
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
            Analytics
          </p>
          <h1 className="mt-2 text-3xl font-black">Relatórios executivos</h1>
          <p className="mt-2 text-sm text-zinc-400">
            VGV, forecast, conversão, marketing e qualidade da base comercial.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">
            Os indicadores gerais abaixo consideram {periodLabel(period)}. O
            relatório por incorporadora informa a própria janela de medição para
            não misturar recortes.
          </p>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Período do relatório"
        >
          {(["day", "week", "month", "all"] as Period[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={period === key}
              onClick={() => setPeriod(key)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${period === key ? "bg-white text-zinc-950" : "border border-zinc-800 text-zinc-400 hover:text-white"}`}
            >
              {key === "day"
                ? "Hoje"
                : key === "week"
                  ? "7 dias"
                  : key === "month"
                    ? "30 dias"
                    : "Histórico"}
            </button>
          ))}
        </div>
      </header>
      {error ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
          role="status"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-red-200/30 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Atualizando…" : "Tentar novamente"}
          </button>
        </div>
      ) : null}
      {weeklyReview ? (
        <section
          className="space-y-5 rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[.07] to-violet-500/[.04] p-5 sm:p-7"
          data-phase="49-weekly-review"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">
              Fase 49 · Revisão semanal pessoal
            </p>
            <h2 className="mt-2 text-2xl font-black">
              O que avançou e o que merece foco
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Últimos 7 dias, somente sua operação. Sem ranking de pessoas e sem
              decisões automáticas.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Tarefas concluídas", weeklyReview.outcomes.completedTasks],
              ["Visitas realizadas", weeklyReview.outcomes.completedVisits],
              ["Interações registradas", weeklyReview.outcomes.interactions],
              ["Novas leads", weeklyReview.outcomes.newLeads],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-white/[.07] bg-black/15 p-4"
              >
                <p className="text-xs text-zinc-500">{label}</p>
                <strong className="mt-2 block text-xl">{value}</strong>
              </div>
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <article className="rounded-2xl border border-white/[.07] bg-black/15 p-5">
              <h3 className="font-bold">Pendências reais</h3>
              <div className="mt-4 space-y-3 text-sm text-zinc-400">
                <p>
                  <strong className="text-rose-200">
                    {weeklyReview.backlog.overdueTasks}
                  </strong>{" "}
                  tarefas vencidas
                </p>
                <p>
                  <strong className="text-amber-200">
                    {weeklyReview.backlog.leadsWithoutNextAction}
                  </strong>{" "}
                  leads sem próxima ação
                </p>
                <p>
                  <strong className="text-violet-200">
                    {weeklyReview.backlog.hotLeadsWithoutNextAction}
                  </strong>{" "}
                  quentes sem agenda
                </p>
                <p>
                  <strong className="text-zinc-200">
                    {weeklyReview.backlog.noShows}
                  </strong>{" "}
                  ausências em visitas
                </p>
              </div>
              <p className="mt-5 text-[11px] leading-5 text-zinc-500">
                {weeklyReview.quality.sufficientSample
                  ? `Cumprimento observado: ${weeklyReview.quality.completionRate}% em ${weeklyReview.quality.sampleSize} tarefas.`
                  : `Amostra pequena (${weeklyReview.quality.sampleSize}/${weeklyReview.quality.minimumSample}); sem percentual para evitar conclusão frágil.`}
              </p>
            </article>
            <article className="rounded-2xl border border-white/[.07] bg-black/15 p-5">
              <h3 className="font-bold">Plano da próxima semana</h3>
              <div className="mt-4 space-y-3">
                {weeklyReview.plan.map((item, index) => (
                  <a
                    key={item.key}
                    href={item.href}
                    className="flex gap-3 rounded-xl border border-white/[.06] p-3 transition hover:border-cyan-300/20"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cyan-400/10 text-xs font-bold text-cyan-200">
                      {index + 1}
                    </span>
                    <span>
                      <strong className="text-sm text-white">
                        {item.title}
                      </strong>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {item.evidence}
                      </span>
                      <span className="mt-1 block text-xs text-cyan-200">
                        {item.action} →
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </article>
          </div>
          <p className="text-[10px] text-zinc-500">
            Plano explicável, custo LLM zero e aprovação humana obrigatória.
          </p>
        </section>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["VGV em oportunidades", money(metrics.vgv)],
          ["Forecast ponderado", money(metrics.forecast)],
          ["Conversão", `${metrics.conversion.toFixed(1)}%`],
          ["Score médio", metrics.averageScore.toFixed(0)],
          ["Investimento", moneyOrUnavailable(metrics.spend)],
          ["Receita atribuída", moneyOrUnavailable(metrics.revenue)],
          ["ROI", metricOrUnavailable(metrics.roi, "%")],
          ["CPL", moneyOrUnavailable(metrics.cpl)],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
          >
            <p className="text-sm text-zinc-400">{label}</p>
            <p className="mt-3 text-2xl font-black">{loading ? "—" : value}</p>
          </article>
        ))}
      </section>
      {weekly ? <WeeklyDeveloperPerformance report={weekly} /> : null}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-blue-500/5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-violet-300">
                IA preditiva explicável
              </p>
              <h2 className="mt-2 text-xl font-black">
                {briefing?.signals[0]?.title || "Consolidando tendências"}
              </h2>
            </div>
            <span className="rounded-full border border-violet-400/20 px-3 py-1 text-[10px] font-bold text-violet-200">
              {briefing?.status?.toUpperCase() || "ANÁLISE"}
            </span>
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-300">
            {briefing?.signals[0]?.evidence ||
              "O Atlas está reunindo sinais suficientes para calcular risco, oportunidade e próxima ação."}
          </p>
          <p className="mt-3 text-sm font-semibold text-violet-100">
            {briefing?.signals[0]?.action}
          </p>
          {briefing?.signals[0] ? (
            <a
              href={briefing.signals[0].href}
              className="mt-4 inline-flex text-xs font-bold text-blue-300"
            >
              Abrir ação recomendada →
            </a>
          ) : null}
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-300">
            Leitura do período
          </p>
          <h2 className="mt-2 text-xl font-black">
            Decisão, não excesso de gráficos
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            O painel usa somente dados visíveis no seu escopo. Tendências são
            recomendações; forecast, campanhas e registros não mudam sem revisão
            humana.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-5 rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-200"
          >
            Salvar ou imprimir relatório
          </button>
        </article>
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-black">Funil comercial</h2>
          <div className="mt-6 space-y-4">
            {funnel.map((item) => {
              const width = periodData.leads.length
                ? Math.max(3, (item.total / periodData.leads.length) * 100)
                : 3;
              return (
                <div key={item.status}>
                  <div className="flex justify-between text-sm">
                    <span className="capitalize text-zinc-300">
                      {item.status}
                    </span>
                    <strong>{item.total}</strong>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-black">Origem dos leads</h2>
          <div className="mt-6 divide-y divide-zinc-800">
            {sources.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem dados de origem.</p>
            ) : null}
            {sources.slice(0, 10).map((item) => (
              <div
                key={item.source}
                className="flex items-center justify-between py-4"
              >
                <span className="capitalize text-zinc-300">{item.source}</span>
                <div className="flex items-center gap-3">
                  <strong>{item.total}</strong>
                  <Link
                    className="text-xs font-semibold text-cyan-200 transition hover:text-cyan-100"
                    href={
                      item.source === "não informada"
                        ? leadsMissingSourceHref()
                        : leadsBySourceHref(item.source)
                    }
                  >
                    {item.source === "não informada"
                      ? "Revisar origem →"
                      : "Ver leads →"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-black">
              Campanhas cadastradas no período
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Esta lista mostra o cadastro e o status das campanhas criadas em{" "}
              {periodLabel(period)}. Investimento, receita, CPL e vendas só são
              exibidos quando a integração registra esses dados; use o relatório
              por incorporadora acima para a leitura operacional comprovada.
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">
              “Leads informadas” é o número registrado no cadastro da campanha.
              “Carteira CRM” abre apenas as leads realmente vinculadas à campanha
              dentro do período selecionado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold">
            <Link
              href="/marketing/campaigns"
              className="text-cyan-200 transition hover:text-cyan-100"
            >
              Gerenciar campanhas →
            </Link>
            {weekly ? (
              <a
                href="#relatorio-incorporadoras"
                className="text-cyan-200 transition hover:text-cyan-100"
              >
                Ver relatório por incorporadora ↑
              </a>
            ) : null}
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-3">Campanha</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Leads informadas</th>
                <th className="pb-3">Vendas</th>
                <th className="pb-3">Investimento</th>
                <th className="pb-3">Receita</th>
                <th className="pb-3">ROI</th>
                <th className="pb-3 text-right">Carteira CRM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {periodData.campaigns.length === 0 ? (
                <tr>
                  <td className="py-8 text-zinc-400" colSpan={8}>
                    Nenhuma campanha cadastrada neste recorte. {" "}
                    <Link
                      className="font-semibold text-cyan-200 underline-offset-4 hover:underline"
                      href="/marketing/campaigns"
                    >
                      Gerenciar campanhas
                    </Link>
                    .
                  </td>
                </tr>
              ) : null}
              {periodData.campaigns.map((campaign) => {
                const roi =
                  campaign.spend !== null &&
                  campaign.revenue !== null &&
                  campaign.spend > 0
                    ? ((campaign.revenue - campaign.spend) / campaign.spend) *
                      100
                    : null;
                return (
                  <tr key={campaign.id}>
                    <td className="py-4 font-semibold">{campaign.name}</td>
                    <td className="capitalize text-zinc-300">
                      {campaignStatusLabel(campaign.status)}
                    </td>
                    <td>{campaign.leads_count ?? "Não informado"}</td>
                    <td>{campaign.sales_count ?? "Não informado"}</td>
                    <td>{moneyOrUnavailable(campaign.spend)}</td>
                    <td>{moneyOrUnavailable(campaign.revenue)}</td>
                    <td>{metricOrUnavailable(roi, "%")}</td>
                    <td className="text-right">
                      <Link
                        className="text-xs font-semibold text-cyan-200 transition hover:text-cyan-100"
                        href={leadsByCampaignHref(campaign.id)}
                      >
                        Abrir carteira →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
