"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { LIVE_LEAD_SELECT, leadAsOpportunity, mapLegacyLead } from "@/lib/compat/legacy-v2";
import { AtlasEmpty } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Period = "day" | "week" | "month" | "all";
type Lead = { id: string; status: string | null; source: string | null; score: number | null; created_at: string };
type Opportunity = { id: string; stage: string; value: number | null; probability: number; created_at: string; won_at: string | null };
type Briefing = { status: string; signals: Array<{ id: string; severity: string; title: string; evidence: string; action: string; href: string }> };
type WeeklyReport = { totals: { leads: number; spend: number; cpl: number | null; campaigns: number; developers: number }; campaigns: Array<{ campaignId: string; campaignName: string; leads: number; qualified: number; spend: number | null; cpl: number | null; costSource: string }>; developers: Array<{ developer: string; leads: number; spend: number; cpl: number | null; campaigns: number; allocation: string }>; warnings: string[]; period: { start: string; end: string } };
type WeeklyReview = { outcomes:{completedTasks:number;completedVisits:number;interactions:number;newLeads:number};backlog:{openTasks:number;overdueTasks:number;leadsWithoutNextAction:number;hotLeadsWithoutNextAction:number;noShows:number};quality:{completionRate:number|null;sampleSize:number;minimumSample:number;sufficientSample:boolean};plan:Array<{key:string;title:string;evidence:string;action:string;href:string}>;method:{llmCost:number;peopleRanking:boolean;humanDecisionRequired:boolean} };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const TH_CLASS = "px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#6b7890]";
const PERIOD_LABEL: Record<Period, string> = { day: "Hoje", week: "7 dias", month: "30 dias", all: "Histórico" };

export default function ReportsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [referenceTime, setReferenceTime] = useState(0);
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);

  useEffect(() => {
    async function load() {
      // Custo/receita por campanha vem SOMENTE do relatório semanal (API com
      // dado oficial da Meta quando conectado). A tabela local de campanhas
      // com spend/revenue zerados foi removida: zero hardcoded exibido como
      // ROI/CPL "medido" é dado fabricado — mesma classe de problema das
      // antigas páginas de analytics.
      const leadResult = await supabase.from("leads").select(LIVE_LEAD_SELECT).not("status", "in", "(arquivado,ARQUIVADO,archived,ARCHIVED)").limit(5000);
      const mappedLeads = ((leadResult.data ?? []) as unknown as Record<string, unknown>[]).map(mapLegacyLead);
      if (leadResult.error) setError("Parte dos relatórios está temporariamente indisponível.");
      setLeads(mappedLeads as Lead[]);
      setOpportunities(mappedLeads.map(leadAsOpportunity) as Opportunity[]);
      setReferenceTime(Date.now());
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.access_token) {
        const headers = { Authorization: `Bearer ${session.session.access_token}` };
        const [response, weeklyResponse, reviewResponse] = await Promise.all([fetch("/api/ai/briefing", { headers, cache: "no-store" }), fetch("/api/v1/analytics/weekly-acquisition", { headers, cache: "no-store" }), fetch("/api/v1/productivity/weekly", { headers, cache: "no-store" })]);
        if (response.ok) setBriefing(await response.json() as Briefing);
        if (weeklyResponse.ok) setWeekly(await weeklyResponse.json() as WeeklyReport);
        if (reviewResponse.ok) { const payload = await reviewResponse.json(); setWeeklyReview((payload.data || payload) as WeeklyReview); }
      }
      setLoading(false);
    }
    void load();
  }, []);

  const periodData = useMemo(() => {
    const days = period === "day" ? 1 : period === "week" ? 7 : period === "month" ? 30 : null;
    const since = days ? referenceTime - days * 86_400_000 : 0;
    const recent = (date: string | null) => !days || Boolean(date && new Date(date).getTime() >= since);
    return { leads: leads.filter((item) => recent(item.created_at)), opportunities: opportunities.filter((item) => recent(item.created_at)) };
  }, [leads, opportunities, period, referenceTime]);

  const metrics = useMemo(() => {
    const vgv = periodData.opportunities.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
    const forecast = periodData.opportunities.reduce((sum, item) => sum + Number(item.value ?? 0) * Number(item.probability ?? 0) / 100, 0);
    const won = periodData.opportunities.filter((item) => ["ganho", "won", "fechado"].includes(item.stage)).length;
    return {
      vgv,
      forecast,
      won,
      conversion: periodData.leads.length ? (won / periodData.leads.length) * 100 : 0,
      averageScore: periodData.leads.length ? periodData.leads.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / periodData.leads.length : 0,
    };
  }, [periodData]);

  const funnel = ["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho"].map((status) => ({
    status,
    total: periodData.leads.filter((lead) => lead.status === status).length,
  }));

  const sources = Array.from(new Set(periodData.leads.map((lead) => lead.source || "não informada"))).map((source) => ({
    source,
    total: periodData.leads.filter((lead) => (lead.source || "não informada") === source).length,
  })).sort((a, b) => b.total - a.total);

  /* Sem leads no recorte não há denominador: conversão e score exibem "—" em
     vez de um 0 que pareceria medido. */
  const decisive = [
    { label: "VGV em oportunidades", value: money(metrics.vgv) },
    { label: "forecast ponderado", value: money(metrics.forecast) },
    { label: "conversão", value: periodData.leads.length ? `${metrics.conversion.toFixed(1)}%` : "—" },
    { label: "score médio", value: periodData.leads.length ? metrics.averageScore.toFixed(0) : "—" },
  ];

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        eyebrow="Analytics · Executivo"
        title="Relatórios executivos"
        description="VGV, forecast, conversão, marketing e qualidade da base — números para decidir, não coleção de gráficos."
        action={{ href: "/decision-center", label: "Abrir decisões", priority: "secondary" }}
      />

      {/* Números decisivos primeiro, com o recorte de período na mesma régua.
          Única superfície com 3D da página. */}
      <section aria-label="Números decisivos do período">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Números decisivos</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período do relatório">
              {(["day", "week", "month", "all"] as Period[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={period === key}
                  onClick={() => setPeriod(key)}
                  className={`cc6-chip cursor-pointer transition-colors ${period === key ? "border-[color:var(--atlas-accent)]! text-[#e8eef8]!" : "hover:border-[rgba(148,163,184,0.35)]! hover:text-[#e8eef8]!"} ${focusRing}`}
                >
                  {PERIOD_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4" aria-busy={loading}>
            {decisive.map((metric) => (
              <div key={metric.label}>
                <p className="cc6-metric-value text-2xl leading-none sm:text-3xl">{loading ? "—" : metric.value}</p>
                <p className="cc6-metric-label mt-1.5">{metric.label}</p>
              </div>
            ))}
          </div>
        </TiltShell>
      </section>

      {error ? (
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 text-sm leading-6 text-[#fb7185]" role="alert" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>{error}</div>
      ) : null}

      {weeklyReview ? (
        <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "60ms" }} data-phase="49-weekly-review" aria-labelledby="weekly-review-title">
          <header>
            <p className="cc6-eyebrow">Fase 49 · Revisão semanal pessoal</p>
            <h2 id="weekly-review-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">O que avançou e o que merece foco</h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">Últimos 7 dias, somente sua operação.</p>
          </header>
          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
            {([["tarefas concluídas", weeklyReview.outcomes.completedTasks], ["visitas realizadas", weeklyReview.outcomes.completedVisits], ["interações registradas", weeklyReview.outcomes.interactions], ["novas leads", weeklyReview.outcomes.newLeads]] as const).map(([label, value]) => (
              <div key={label}>
                <p className="cc6-metric-value text-xl leading-none">{value}</p>
                <p className="cc6-metric-label mt-1.5">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[.8fr_1.2fr]">
            <article className="cc6-panel-quiet p-4">
              <h3 className="text-sm font-semibold tracking-tight text-[#e8eef8]">Pendências reais</h3>
              <div className="mt-3 space-y-1.5 text-xs leading-5 text-[#aab6ca]">
                <p><strong className="cc6-num cc6-crit font-semibold">{weeklyReview.backlog.overdueTasks}</strong> tarefas vencidas</p>
                <p><strong className="cc6-num cc6-warn font-semibold">{weeklyReview.backlog.leadsWithoutNextAction}</strong> leads sem próxima ação</p>
                <p><strong className="cc6-num cc6-warn font-semibold">{weeklyReview.backlog.hotLeadsWithoutNextAction}</strong> quentes sem agenda</p>
                <p><strong className="cc6-num font-semibold text-[#e8eef8]">{weeklyReview.backlog.noShows}</strong> ausências em visitas</p>
              </div>
              <p className="cc6-hairline mt-3 pt-3 text-[11px] leading-5 text-[#6b7890]">
                {weeklyReview.quality.sufficientSample ? `Cumprimento observado: ${weeklyReview.quality.completionRate}% em ${weeklyReview.quality.sampleSize} tarefas.` : `Amostra pequena (${weeklyReview.quality.sampleSize}/${weeklyReview.quality.minimumSample}); sem percentual para evitar conclusão frágil.`}
              </p>
            </article>
            <article className="cc6-panel-quiet p-4">
              <h3 className="text-sm font-semibold tracking-tight text-[#e8eef8]">Plano da próxima semana</h3>
              <div className="mt-3 space-y-2">
                {weeklyReview.plan.map((item, index) => (
                  <a key={item.key} href={item.href} className={`flex gap-3 rounded-xl border border-[rgba(148,163,184,0.12)] p-3 transition-colors hover:border-[color:var(--atlas-accent)] ${focusRing}`}>
                    <span className="cc6-num text-xs text-[#6b7890]" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <strong className="block text-[13px] font-semibold text-[#e8eef8]">{item.title}</strong>
                      <span className="mt-0.5 block text-xs leading-5 text-[#6b7890]">{item.evidence}</span>
                      <span className="mt-0.5 block text-xs font-medium text-[color:var(--atlas-accent-hover)]">{item.action} →</span>
                    </span>
                  </a>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {weekly ? (
        <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "120ms" }} aria-labelledby="weekly-acquisition-title">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="cc6-eyebrow">Aquisição · Últimos 7 dias</p>
              <h2 id="weekly-acquisition-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Leads e custo por campanha e incorporadora</h2>
              <p className="mt-1 text-xs leading-5 text-[#6b7890]">Custo oficial da Meta quando conectado.</p>
            </div>
            <button type="button" onClick={() => window.print()} className="cc6-ghost-btn min-h-11 shrink-0">Imprimir relatório</button>
          </header>
          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
            {([["leads", String(weekly.totals.leads)], ["investimento", money(weekly.totals.spend)], ["CPL", weekly.totals.cpl === null ? "—" : money(weekly.totals.cpl)], ["campanhas", String(weekly.totals.campaigns)], ["incorporadoras", String(weekly.totals.developers)]] as const).map(([label, value]) => (
              <div key={label}>
                <p className="cc6-metric-value text-xl leading-none">{value}</p>
                <p className="cc6-metric-label mt-1.5">{label}</p>
              </div>
            ))}
          </div>
          {weekly.warnings?.length ? (
            <div className="mt-4 grid gap-2">
              {weekly.warnings.map((warning) => (
                <p key={warning} className="cc6-sev-band cc6-panel-quiet py-2.5 pl-4 pr-3 text-xs leading-5 text-[#f5b544]" style={{ "--cc6-sev": "#f5b544" } as CSSProperties}>{warning}</p>
              ))}
            </div>
          ) : null}
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="overflow-x-auto">
              <h3 className="text-sm font-semibold tracking-tight text-[#e8eef8]">Por campanha</h3>
              <table className="mt-2 w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-b-[rgba(148,163,184,0.12)]">
                    <th scope="col" className={TH_CLASS}>Campanha</th>
                    <th scope="col" className={TH_CLASS}>Leads</th>
                    <th scope="col" className={TH_CLASS}>Qualificadas</th>
                    <th scope="col" className={TH_CLASS}>Custo</th>
                    <th scope="col" className={TH_CLASS}>CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {weekly.campaigns.map((row) => (
                    <tr key={row.campaignId} className="border-t border-[rgba(148,163,184,0.12)] first:border-t-0 hover:bg-white/[0.015]">
                      <td className="px-3 py-3 font-semibold text-[#e8eef8]">{row.campaignName}</td>
                      <td className="cc6-num px-3 py-3 text-[#aab6ca]">{row.leads}</td>
                      <td className="cc6-num px-3 py-3 text-[#aab6ca]">{row.qualified}</td>
                      <td className="cc6-num px-3 py-3 text-[#aab6ca]">{row.spend === null ? "Não conectado" : money(row.spend)}</td>
                      <td className="cc6-num px-3 py-3 text-[#aab6ca]">{row.cpl === null ? "—" : money(row.cpl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <h3 className="text-sm font-semibold tracking-tight text-[#e8eef8]">Por incorporadora</h3>
              <table className="mt-2 w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-b-[rgba(148,163,184,0.12)]">
                    <th scope="col" className={TH_CLASS}>Incorporadora</th>
                    <th scope="col" className={TH_CLASS}>Leads</th>
                    <th scope="col" className={TH_CLASS}>Campanhas</th>
                    <th scope="col" className={TH_CLASS}>Custo</th>
                    <th scope="col" className={TH_CLASS}>CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {weekly.developers.map((row) => (
                    <tr key={row.developer} className="border-t border-[rgba(148,163,184,0.12)] first:border-t-0 hover:bg-white/[0.015]">
                      <td className="px-3 py-3">
                        <span className="font-semibold text-[#e8eef8]">{row.developer}</span>
                        {row.allocation !== "direct" ? <span className="mt-0.5 block text-[10px] text-[#f5b544]">rateio proporcional por leads</span> : null}
                      </td>
                      <td className="cc6-num px-3 py-3 text-[#aab6ca]">{row.leads}</td>
                      <td className="cc6-num px-3 py-3 text-[#aab6ca]">{row.campaigns}</td>
                      <td className="cc6-num px-3 py-3 text-[#aab6ca]">{money(row.spend)}</td>
                      <td className="cc6-num px-3 py-3 text-[#aab6ca]">{row.cpl === null ? "—" : money(row.cpl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "180ms" }} aria-labelledby="briefing-title">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <p className="cc6-eyebrow">IA preditiva explicável</p>
          <span className="cc6-chip">{briefing?.status?.toUpperCase() || "ANÁLISE"}</span>
        </header>
        <h2 id="briefing-title" className="mt-2 text-lg font-semibold tracking-tight text-[#e8eef8]">{briefing?.signals[0]?.title || "Consolidando tendências"}</h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#aab6ca]">{briefing?.signals[0]?.evidence || "O Atlas está reunindo sinais suficientes para calcular risco, oportunidade e próxima ação."}</p>
        {briefing?.signals[0]?.action ? <p className="mt-2 max-w-3xl text-[13px] font-medium leading-6 text-[#e8eef8]">{briefing.signals[0].action}</p> : null}
        {briefing?.signals[0] ? (
          <a href={briefing.signals[0].href} className="cc6-ghost-btn mt-3 min-h-11">Abrir ação recomendada →</a>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "240ms" }} aria-labelledby="funnel-title">
          <p className="cc6-eyebrow">Distribuição do período</p>
          <h2 id="funnel-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Funil comercial</h2>
          <div className="mt-4 space-y-3">
            {funnel.map((item) => {
              const width = periodData.leads.length ? Math.max(3, (item.total / periodData.leads.length) * 100) : 3;
              return (
                <div key={item.status}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="capitalize text-[#aab6ca]">{item.status}</span>
                    <strong className="cc6-num font-semibold text-[#e8eef8]">{item.total}</strong>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-[color:var(--atlas-accent)] transition-[width]" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
        <article className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "300ms" }} aria-labelledby="sources-title">
          <p className="cc6-eyebrow">Qualidade da base</p>
          <h2 id="sources-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Origem dos leads</h2>
          <div className="cc6-hairline mt-4">
            {sources.length === 0 ? (
              <AtlasEmpty
                reason="no-activity"
                eyebrow="Base sem origem"
                title="Sem dados de origem no período"
                description="As origens dos leads aparecem quando houver registros no recorte selecionado."
              />
            ) : null}
            {sources.slice(0, 10).map((item) => (
              <div key={item.source} className="flex items-center justify-between border-t border-[rgba(148,163,184,0.12)] py-3 first:border-t-0">
                <span className="capitalize text-[13px] text-[#aab6ca]">{item.source}</span>
                <strong className="cc6-num text-[13px] font-semibold text-[#e8eef8]">{item.total}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      {/* Governança consolidada (antes repetida no cabeçalho da revisão semanal,
          no semanal de aquisição e no cartão "Leitura do período"). */}
      <p className="cc6-reveal text-[11px] leading-5 text-[#6b7890]" style={{ animationDelay: "360ms" }}>
        Somente dados do seu escopo, sem ranking de pessoas e sem decisões automáticas — forecast, campanhas e registros só mudam com revisão humana; o plano semanal é explicável e tem custo LLM zero.
      </p>
    </div>
  );
}
