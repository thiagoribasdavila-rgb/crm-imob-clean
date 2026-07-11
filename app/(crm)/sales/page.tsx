"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Opportunity = {
  id: string;
  stage: string;
  value: number | null;
  probability: number;
  expected_close_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  leads: { name: string | null } | null;
  properties: { title: string | null } | null;
};

export default function SalesPage() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id,stage,value,probability,expected_close_at,won_at,lost_at,leads(name),properties(title)")
        .order("created_at", { ascending: false });
      if (error) setError(error.message);
      setItems((data ?? []) as unknown as Opportunity[]);
      setLoading(false);
    }
    void load();
  }, []);

  const metrics = useMemo(() => {
    const open = items.filter((item) => !item.won_at && !item.lost_at);
    return {
      total: items.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
      weighted: open.reduce((sum, item) => sum + Number(item.value ?? 0) * (item.probability / 100), 0),
      won: items.filter((item) => item.won_at).reduce((sum, item) => sum + Number(item.value ?? 0), 0),
      open: open.length,
    };
  }, [items]);

  const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Revenue engine</p>
        <h1 className="mt-2 text-3xl font-black">Vendas e oportunidades</h1>
        <p className="mt-2 text-zinc-400">Visão consolidada do VGV, previsão ponderada e negócios em andamento.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[["VGV total", money(metrics.total)], ["Forecast ponderado", money(metrics.weighted)], ["Vendas ganhas", money(metrics.won)], ["Oportunidades abertas", String(metrics.open)]].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}
      {loading ? <p className="text-zinc-400">Carregando oportunidades...</p> : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400"><tr><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Imóvel</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Probabilidade</th><th className="px-4 py-3">Fechamento</th></tr></thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 font-medium">{item.leads?.name || "Sem lead"}</td>
                  <td className="px-4 py-4 text-zinc-400">{item.properties?.title || "Sem imóvel"}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">{item.stage}</span></td>
                  <td className="px-4 py-4">{money(Number(item.value ?? 0))}</td>
                  <td className="px-4 py-4">{item.probability}%</td>
                  <td className="px-4 py-4 text-zinc-400">{item.expected_close_at ? new Date(item.expected_close_at).toLocaleDateString("pt-BR") : "—"}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500">Nenhuma oportunidade registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
