"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/*
 * CC-6 · Hub de marketing — índice de decisão.
 * Consolidações do redesign (mesmo fetch de sempre, zero fetch novo):
 * - a descrição do header pré-anunciava CPL/ROI e listava as áreas que já
 *   apareciam logo abaixo — reduzida a uma linha sem repetir métrica;
 * - "Campanhas" aparecia 3× (card de métrica, h2 da seção e as linhas da
 *   própria tabela) — a contagem vive uma única vez, no card primário;
 * - a tabela de campanhas duplicava inteira a central de campanhas
 *   (satélite já redesenhado), recomputando CPL/ROI linha a linha —
 *   removida: o hub aponta, a central responde;
 * - CPL sem leads e ROI sem investimento exibem "—" em vez de fingir
 *   R$ 0,00 / 0,0%.
 */

type Campaign = {
  id: string;
  name: string;
  channel: string;
  status: string;
  budget: number | null;
  spend: number;
  leads_count: number;
  sales_count: number;
  revenue: number;
  starts_at: string | null;
  ends_at: string | null;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

// Satélites do hub: uma linha por área — a pergunta que cada página responde.
type Satellite = { href: string; label: string; answers: string; state?: string };
const SATELLITES: Satellite[] = [
  {
    href: "/marketing/budget",
    label: "Orçamento",
    answers: "Onde a próxima verba rende mais — cenários explicáveis por projeto e canal.",
  },
  {
    href: "/marketing/experiments",
    label: "Experimentos",
    answers: "Qual variável muda o resultado — teste com controle, teto e parada antecipada.",
  },
  {
    href: "/marketing/creatives",
    label: "Criativos",
    answers: "Qual mensagem sustenta o funil de cada projeto — medida pelo CRM.",
  },
  {
    href: "/marketing/campaign-intelligence",
    label: "Inteligência multicanal",
    answers: "Custos comparáveis entre Meta, Google, TikTok e portais — decisões auditáveis.",
  },
  {
    href: "/marketing/ads",
    label: "Meta Ads",
    answers: "Controle operacional dos anúncios pagos.",
    state: "Em preparação",
  },
];

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: queryError } = await supabase
        .from("campaigns")
        .select("id,name,channel,status,budget,spend,leads_count,sales_count,revenue,starts_at,ends_at")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setCampaigns((data ?? []) as Campaign[]);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => {
    const spend = campaigns.reduce((sum, item) => sum + Number(item.spend || 0), 0);
    const revenue = campaigns.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
    const leads = campaigns.reduce((sum, item) => sum + Number(item.leads_count || 0), 0);
    const sales = campaigns.reduce((sum, item) => sum + Number(item.sales_count || 0), 0);
    return {
      spend,
      revenue,
      leads,
      sales,
      cpl: leads ? spend / leads : 0,
      roi: spend ? ((revenue - spend) / spend) * 100 : 0,
      active: campaigns.filter((item) => item.status === "active").length,
    };
  }, [campaigns]);

  // Números decisivos do card primário — cada um aparece uma única vez na página.
  const decisive: Array<{ label: string; value: string; tone?: string }> = [
    { label: "Investimento", value: money.format(metrics.spend) },
    { label: "Leads", value: String(metrics.leads) },
    { label: "CPL", value: metrics.leads ? money.format(metrics.cpl) : "—" },
    { label: "Vendas", value: String(metrics.sales) },
    {
      label: "ROI",
      value: metrics.spend ? `${metrics.roi.toFixed(1)}%` : "—",
      tone: metrics.spend ? (metrics.roi >= 0 ? "cc6-ok" : "cc6-crit") : undefined,
    },
  ];

  return (
    <div className="space-y-4 pb-10" data-marketing-layout="cc6-decision-index">
      <PageHeader
        eyebrow="Marketing · Andromeda"
        title="Marketing e atribuição"
        description="Cada módulo responde uma pergunta de verba — e a conversão é sempre medida no CRM."
      />

      {error ? (
        <div
          role="alert"
          className="cc6-panel cc6-sev-band cc6-reveal p-4 pl-5 text-sm leading-6 text-[#fb7185]"
          style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
        >
          {error}
        </div>
      ) : null}

      {/* Destino primário em destaque: a central de campanhas concentra a decisão
          de verba, então os agregados do fetch vivem dentro do próprio card. */}
      <section aria-label="Destino primário do hub">
        <TiltShell className="cc6-reveal" delayMs={0}>
          <Link
            href="/marketing/campaigns"
            className={`group cc6-panel block border-[rgba(75,141,248,.3)]! p-5 transition-colors hover:border-[rgba(75,141,248,.5)]! sm:p-6 ${focusRing}`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="cc6-eyebrow">Destino primário</p>
              {!loading ? (
                <span className="cc6-chip">
                  {metrics.active
                    ? `${campaigns.length} campanhas · ${metrics.active} ativas`
                    : `${campaigns.length} campanhas`}
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className="cc6-num ml-auto text-[12px] text-[var(--atlas-accent)] transition-transform group-hover:translate-x-0.5"
              >
                Abrir central →
              </span>
            </div>
            <h2 className="mt-2.5 text-xl font-semibold tracking-tight text-[#e8eef8]">
              Central de campanhas
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#aab6ca]">
              Quais campanhas trazem leads que qualificam — e quais consomem verba sem retorno.
            </p>
            <div className="cc6-hairline mt-4 pt-4" aria-busy={loading}>
              {!loading && campaigns.length === 0 ? (
                <p className="text-sm leading-6 text-[#6b7890]">Nenhuma campanha cadastrada.</p>
              ) : (
                <div className="flex flex-wrap gap-x-10 gap-y-4">
                  {decisive.map((metric) => (
                    <div key={metric.label}>
                      <p className={`cc6-metric-value text-2xl leading-none sm:text-3xl ${metric.tone ?? ""}`}>
                        {loading ? "—" : metric.value}
                      </p>
                      <p className="cc6-metric-label mt-1.5">{metric.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Link>
        </TiltShell>
      </section>

      {/* Índice de decisão: uma linha por satélite, estado só quando é real. */}
      <section aria-label="Módulos satélites do marketing" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SATELLITES.map((area, index) => (
          <Link
            key={area.href}
            href={area.href}
            className={`group cc6-panel cc6-reveal flex flex-col p-5 transition-colors hover:border-[rgba(148,163,184,.28)]! ${focusRing}`}
            style={{ animationDelay: `${80 + index * 40}ms` }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="cc6-eyebrow">{area.label}</h2>
              {area.state ? <StatusBadge tone="neutral">{area.state}</StatusBadge> : null}
            </div>
            <p className="mt-2.5 text-sm leading-6 text-[#aab6ca]">{area.answers}</p>
            <span
              aria-hidden="true"
              className="cc6-num mt-auto pt-4 text-[12px] text-[#6b7890] transition-colors group-hover:text-[var(--atlas-accent)]"
            >
              Abrir →
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
