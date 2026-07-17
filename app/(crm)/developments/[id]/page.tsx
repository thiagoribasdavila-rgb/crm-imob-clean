"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Metrics = {
  inventoryTotal: number; available: number; sold: number; reserved: number;
  totalVgv: number; soldVgv: number; absorption: number; pipeline: number;
  forecast: number; opportunities: number; campaignSpend: number;
  campaignRevenue: number; campaignLeads: number; cpl: number; roi: number;
  activeReservations: number;
};

type Development = {
  id: string; name: string; developer_name: string | null; neighborhood: string | null;
  city: string | null; state: string | null; status: string; delivery_date: string | null;
  launch_date?: string | null; metrics: Metrics;
  intelligence?: { onboarding_status: string; readiness_percent: number; missing_information: string[] } | null;
};

type Payload = { developments: Development[]; generatedAt: string };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function DevelopmentCommandPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Development | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { setError("Sessão expirada."); setLoading(false); return; }
      const response = await fetch("/api/v1/launch-os", { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as Payload & { error?: string };
      if (!response.ok) setError(payload.error || "Falha ao carregar empreendimento.");
      else setItem(payload.developments.find((development) => development.id === id) ?? null);
      setLoading(false);
    }
    void load();
  }, [id]);

  const signal = useMemo(() => {
    if (!item) return { label: "Aguardando dados", tone: "neutral" as const, recommendation: "Conecte estoque, oportunidades e campanhas para ativar a inteligência do lançamento." };
    if (item.metrics.absorption < 15 && item.metrics.inventoryTotal > 0) return { label: "Atenção comercial", tone: "danger" as const, recommendation: "Revisar posicionamento, distribuição de leads e verba de aquisição nas próximas 24 horas." };
    if (item.metrics.roi < 0 && item.metrics.campaignSpend > 0) return { label: "Marketing ineficiente", tone: "warning" as const, recommendation: "Reduzir campanhas com baixo retorno e concentrar investimento nos públicos de maior conversão." };
    if (item.metrics.absorption >= 60) return { label: "Alta tração", tone: "success" as const, recommendation: "Preservar preço, priorizar unidades estratégicas e acelerar fechamento das oportunidades abertas." };
    return { label: "Operação saudável", tone: "info" as const, recommendation: "Manter cadência comercial e usar o forecast para direcionar esforços por tipologia e canal." };
  }, [item]);

  if (loading) return <div className="space-y-5"><AtlasSkeleton className="h-64 w-full" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((value) => <AtlasSkeleton key={value} className="h-32 w-full" />)}</div></div>;
  if (error) return <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-rose-200">{error}</div>;
  if (!item) return <AtlasEmpty title="Empreendimento não encontrado" description="O projeto pode ter sido removido ou não pertence à organização atual." action={<Link href="/developments" className="atlas-button-secondary">Voltar ao portfólio</Link>} />;

  const m = item.metrics;
  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.1] via-blue-500/[.07] to-violet-500/[.12] p-6 sm:p-8">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href="/developments" className="text-sm font-semibold text-sky-300">← Voltar ao portfólio</Link>
            <div className="mt-5 flex flex-wrap gap-2"><AtlasBadge tone="violet">LAUNCH COMMAND</AtlasBadge><AtlasBadge tone={signal.tone}>{signal.label}</AtlasBadge><AtlasBadge tone="info">{item.status}</AtlasBadge></div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">{item.name}</h1>
            <p className="mt-3 text-sm text-slate-400 sm:text-base">{item.developer_name || "Incorporadora não informada"} · {[item.neighborhood, item.city, item.state].filter(Boolean).join(" · ") || "Localização não informada"}</p>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300">{signal.recommendation}</p>
            <div className="mt-6 flex flex-wrap gap-3"><Link href={`/developments/materials?project=${id}`} className="atlas-button-primary">Book, tabela e espelho</Link><Link href={`/developments/${id}/catalog`} className="atlas-button-secondary">Tipologias e diferenciais</Link><Link href={`/developments/${id}/inventory`} className="atlas-button-secondary">Abrir estoque</Link></div>
          </div>
          <div className="min-w-72 rounded-3xl border border-white/[0.08] bg-[#070d1b]/70 p-5 backdrop-blur-xl"><div className="flex items-center justify-between"><span className="text-sm text-slate-400">Absorção</span><span className="text-3xl font-semibold text-emerald-300">{m.absorption}%</span></div><div className="mt-5"><AtlasProgress value={m.absorption} /></div><p className="mt-4 text-xs text-slate-500">Entrega: {item.delivery_date ? new Date(item.delivery_date).toLocaleDateString("pt-BR") : "a definir"}</p></div>
        </div>
      </section>

      <AtlasCard>
        <AtlasCardHeader eyebrow="Project intelligence" title="Dossiê do projeto e da região" description="Nasce junto com cada novo empreendimento e fica preparado para as IAs, sem transformar informação pendente em fato." />
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[.7fr_1.3fr]">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5"><div className="flex items-end justify-between"><span className="text-sm text-slate-400">Prontidão do estudo</span><strong className="text-3xl text-cyan-300">{item.intelligence?.readiness_percent ?? 0}%</strong></div><div className="mt-4"><AtlasProgress value={item.intelligence?.readiness_percent ?? 0} /></div><p className="mt-3 text-xs text-slate-500">{item.intelligence ? "Conteúdo separado entre fatos, fontes e pendências." : "Aguardando criação automática do dossiê."}</p></div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Antes de liberar para a IA</p><div className="mt-3 flex flex-wrap gap-2">{(item.intelligence?.missing_information?.length ? item.intelligence.missing_information : ["Nenhuma pendência registrada"]).map((value) => <AtlasBadge key={value} tone={item.intelligence?.missing_information?.length ? "warning" : "success"}>{value}</AtlasBadge>)}</div></div>
        </div>
      </AtlasCard>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AtlasMetric label="VGV total" value={brl.format(m.totalVgv)} detail={`${m.inventoryTotal} unidades no estoque`} trend="PORTFÓLIO" tone="violet" />
        <AtlasMetric label="VGV vendido" value={brl.format(m.soldVgv)} detail={`${m.sold} unidades concluídas`} trend="SELL-OUT" tone="green" />
        <AtlasMetric label="Forecast" value={brl.format(m.forecast)} detail={`${m.opportunities} oportunidades`} trend="ATLAS AI" tone="blue" />
        <AtlasMetric label="ROI marketing" value={m.campaignSpend ? `${m.roi.toFixed(0)}%` : "—"} detail={`${m.campaignLeads} leads atribuídos`} trend="GROWTH" tone="amber" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <AtlasCard>
          <AtlasCardHeader eyebrow="Inventory intelligence" title="Saúde do estoque" description="Distribuição das unidades e velocidade de absorção do empreendimento." action={<Link href={`/developments/${id}/inventory`} className="text-xs font-semibold text-sky-300">Abrir controle de unidades →</Link>} />
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
            {[{ label: "Disponíveis", value: m.available, tone: "text-sky-300" }, { label: "Reservadas", value: m.reserved + m.activeReservations, tone: "text-amber-300" }, { label: "Vendidas", value: m.sold, tone: "text-emerald-300" }, { label: "Total", value: m.inventoryTotal, tone: "text-white" }].map((metric) => <div key={metric.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 text-center"><p className={`text-3xl font-semibold ${metric.tone}`}>{metric.value}</p><p className="mt-2 text-xs uppercase tracking-wider text-slate-500">{metric.label}</p></div>)}
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader eyebrow="Commercial engine" title="Conversão e demanda" description="Leitura rápida do potencial comercial e eficiência de aquisição." />
          <div className="space-y-4 p-5 sm:p-6">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4"><div className="flex justify-between text-sm"><span className="text-slate-400">Pipeline bruto</span><span className="font-semibold text-white">{brl.format(m.pipeline)}</span></div></div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4"><div className="flex justify-between text-sm"><span className="text-slate-400">Investimento em mídia</span><span className="font-semibold text-white">{brl.format(m.campaignSpend)}</span></div></div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4"><div className="flex justify-between text-sm"><span className="text-slate-400">CPL atribuído</span><span className="font-semibold text-white">{m.cpl ? brl.format(m.cpl) : "—"}</span></div></div>
            <div className="grid grid-cols-2 gap-3"><Link href="/pipeline" className="atlas-button-secondary text-center">Pipeline</Link><Link href="/marketing" className="atlas-button-secondary text-center">Campanhas</Link></div>
          </div>
        </AtlasCard>
      </section>
    </div>
  );
}
