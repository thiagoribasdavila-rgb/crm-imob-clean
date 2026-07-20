"use client";
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
