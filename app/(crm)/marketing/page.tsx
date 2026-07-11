"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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
    };
  }, [campaigns]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-fuchsia-400">Andromeda Marketing AI</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Marketing e atribuição</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Central de campanhas, CPL, ROI, receita atribuída e preparação para Meta Ads, Google Ads e automações criativas.</p>
      </header>

      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Campanhas", campaigns.length],
          ["Investimento", money.format(metrics.spend)],
          ["Leads", metrics.leads],
          ["CPL", money.format(metrics.cpl)],
          ["Vendas", metrics.sales],
          ["ROI", `${metrics.roi.toFixed(1)}%`],
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-sm text-zinc-400">{label}</p>
            <p className="mt-3 text-2xl font-black">{loading ? "—" : value}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 p-5"><h2 className="font-bold">Campanhas</h2></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-500"><tr>{["Campanha","Canal","Status","Investimento","Leads","CPL","Receita","ROI"].map(h => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-800">
              {!loading && campaigns.length === 0 ? <tr><td colSpan={8} className="px-5 py-10 text-center text-zinc-500">Nenhuma campanha cadastrada.</td></tr> : null}
              {campaigns.map((campaign) => {
                const spend = Number(campaign.spend || 0);
                const revenue = Number(campaign.revenue || 0);
                const leads = Number(campaign.leads_count || 0);
                const roi = spend ? ((revenue - spend) / spend) * 100 : 0;
                return <tr key={campaign.id} className="text-zinc-300">
                  <td className="px-5 py-4 font-semibold text-white">{campaign.name}</td>
                  <td className="px-5 py-4 capitalize">{campaign.channel}</td>
                  <td className="px-5 py-4 capitalize">{campaign.status}</td>
                  <td className="px-5 py-4">{money.format(spend)}</td>
                  <td className="px-5 py-4">{leads}</td>
                  <td className="px-5 py-4">{money.format(leads ? spend / leads : 0)}</td>
                  <td className="px-5 py-4">{money.format(revenue)}</td>
                  <td className="px-5 py-4">{roi.toFixed(1)}%</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
