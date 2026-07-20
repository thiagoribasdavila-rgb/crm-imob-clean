"use client";
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Payload = { summary: Record<string, number | string | boolean | null>; platforms: Array<Record<string, number | string | boolean | null>>; ranking: Array<Record<string, number | string | boolean | null>> };
const brl = (value: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value || 0));

/*
 * CC-6 · Inteligência de campanhas — consolidação do redesign: a página vivia
 * em cards brancos claros dentro do shell escuro, com um <main> aninhado no
 * <main> do AppShell e um hero gradiente que repetia os canais duas vezes.
 * Agora o resumo é uma linha de métricas mono, canais e ranking são painéis da
 * identidade e a página aponta para a central de campanhas. Fetch, período e
 * regra de amostra mínima preservados.
 */

export default function CampaignIntelligencePage() {
  const [days, setDays] = useState(30); const [data, setData] = useState<Payload | null>(null); const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch(`/api/v1/campaign-intelligence?days=${days}`, { cache: "no-store" }).then(async (response) => { const json = await response.json(); if (!response.ok) throw new Error(json?.error?.message || "Painel indisponível"); return json.data as Payload; }).then((value) => active && setData(value)).catch((reason) => active && setError(reason.message)); return () => { active = false; }; }, [days]);
  const summary = data?.summary || {};
  const loading = !data && !error;

  return (
    <div data-phase="91-multichannel-campaign-intelligence" className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Marketing · Meta · Google · TikTok · YouTube · Portais"
        title="Inteligência de campanhas"
        description="Custos comparáveis, funil imobiliário real e decisões com origem auditável."
        action={{ href: "/marketing/campaigns", label: "Central de campanhas", priority: "secondary" }}
      />

      {error ? (
        <p
          role="status"
          className="cc6-sev-band cc6-panel-quiet cc6-reveal py-3 pl-5 pr-4 text-sm text-[#f5b544]"
          style={{ "--cc6-sev": "#f5b544" } as CSSProperties}
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Resumo do período">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Resumo do período</p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="cc6-chip">CRM é a verdade da conversão</span>
              <select
                aria-label="Período"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                className="rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3 py-1.5 text-xs text-[#e8eef8] outline-none transition-colors focus:border-[color:var(--atlas-accent)]"
              >
                <option value={7}>7 dias</option>
                <option value={30}>30 dias</option>
                <option value={90}>90 dias</option>
              </select>
              <Link href="/integrations/meta/andromeda" className="cc6-ghost-btn">
                Loop Andromeda
              </Link>
            </div>
          </div>
          <div className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-4 pt-4" aria-busy={loading}>
            {[
              ["Investimento", brl(summary.spend)],
              ["Leads CRM", String(summary.crmLeads || 0)],
              ["Vendas", String(summary.wins || 0)],
              ["ROAS", summary.roas == null ? "—" : `${summary.roas}x`],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="cc6-metric-value text-3xl leading-none">{loading ? "—" : value}</p>
                <p className="cc6-metric-label mt-1.5">{label}</p>
              </div>
            ))}
          </div>
        </TiltShell>
      </section>

      <section
        aria-labelledby="ci-platforms-title"
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "120ms" }}
      >
        <header className="px-5 pt-5 pb-4">
          <p className="cc6-eyebrow">Comparativo por canal</p>
          <h2 id="ci-platforms-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">
            Custo e resultado confirmado
          </h2>
        </header>
        {(data?.platforms || []).length === 0 ? (
          <p className="cc6-hairline px-5 py-6 text-sm text-[#6b7890]" aria-busy={loading}>
            {loading ? "Carregando canais…" : "Nenhum snapshot de canal no período."}
          </p>
        ) : (
          (data?.platforms || []).map((item) => (
            <article
              key={String(item.platform)}
              className="cc6-hairline flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-5 py-3.5"
            >
              <div className="min-w-[120px]">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#e8eef8]">
                  {String(item.platform).replace("_ads", "")}
                </p>
                <p className="cc6-num mt-0.5 text-[11px] text-[#6b7890]">
                  {Number(item.crmLeads || 0)} leads · {Number(item.wins || 0)} vendas
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="cc6-chip">{brl(item.spend)}</span>
                <span className="cc6-chip">CPL {item.cpl == null ? "—" : brl(item.cpl)}</span>
                <span className="cc6-chip">ROAS {item.roas == null ? "—" : `${item.roas}x`}</span>
              </div>
            </article>
          ))
        )}
      </section>

      <section
        aria-labelledby="ci-ranking-title"
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "200ms" }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5 pb-4">
          <div>
            <p className="cc6-eyebrow">Ranking de performance</p>
            <h2 id="ci-ranking-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">
              Campanhas por resultado no CRM
            </h2>
          </div>
          <p className="cc6-num text-[11px] text-[#6b7890]">Amostra mínima: 30 leads confirmadas</p>
        </header>
        <div className="cc6-hairline overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="cc6-eyebrow text-[10px]!">
                <th className="px-5 py-3 font-medium">Campanha</th>
                <th className="py-3 font-medium">Canal</th>
                <th className="py-3 font-medium">Leads</th>
                <th className="py-3 font-medium">Qualificadas</th>
                <th className="py-3 font-medium">Visitas</th>
                <th className="py-3 font-medium">Vendas</th>
                <th className="py-3 font-medium">CPL</th>
                <th className="py-3 font-medium">ROAS</th>
                <th className="py-3 pr-5 font-medium">Confiança</th>
              </tr>
            </thead>
            <tbody>
              {(data?.ranking || []).map((item) => (
                <tr key={`${item.platform}-${item.campaignKey}`} className="cc6-hairline">
                  <td className="px-5 py-3.5 font-medium text-[#e8eef8]">{String(item.campaignName)}</td>
                  <td className="py-3.5 text-[#aab6ca]">{String(item.platform)}</td>
                  <td className="cc6-num py-3.5 text-[#aab6ca]">{Number(item.crmLeads || 0)}</td>
                  <td className="cc6-num py-3.5 text-[#aab6ca]">{Number(item.qualifiedLeads || 0)}</td>
                  <td className="cc6-num py-3.5 text-[#aab6ca]">{Number(item.visits || 0)}</td>
                  <td className="cc6-num py-3.5 text-[#aab6ca]">{Number(item.wins || 0)}</td>
                  <td className="cc6-num py-3.5 text-[#aab6ca]">{item.cpl == null ? "—" : brl(item.cpl)}</td>
                  <td className="cc6-num py-3.5 text-[#aab6ca]">{item.roas == null ? "—" : `${item.roas}x`}</td>
                  <td className="py-3.5 pr-5">
                    <StatusBadge tone={item.sampleSufficient ? "success" : "neutral"}>
                      {item.sampleSufficient ? String(item.confidence) : "aguardar amostra"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.ranking?.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#6b7890]">
              Conectores prontos para receber os primeiros snapshots homologados.
            </p>
          ) : null}
          {loading ? (
            <p className="py-8 text-center text-sm text-[#6b7890]" aria-busy="true">
              Carregando ranking…
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
