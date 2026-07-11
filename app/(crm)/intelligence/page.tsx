"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Insight = {
  id: string;
  title: string;
  summary: string | null;
  recommendation: string | null;
  score: number | null;
  confidence: number | null;
  status: string;
  created_at: string;
};

export default function IntelligencePage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("ai_insights")
        .select("id, title, summary, recommendation, score, confidence, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) setError(error.message);
      setItems((data as Insight[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-300">Atlas Intelligence Layer</p>
        <h1 className="mt-2 text-3xl font-black">Central de inteligência</h1>
        <p className="mt-2 text-zinc-400">Insights, previsões e recomendações explicáveis para a operação imobiliária.</p>
      </div>

      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {loading ? (
          <div className="rounded-2xl border border-zinc-800 p-8 text-zinc-400">Carregando inteligência...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
            <h2 className="text-lg font-bold">Motor preparado</h2>
            <p className="mt-2 text-zinc-400">Ainda não existem insights persistidos. O Atlas já possui estrutura para score de leads, matching e recomendações.</p>
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-bold">{item.title}</h2>
                <span className="rounded-full bg-fuchsia-500/10 px-3 py-1 text-xs text-fuchsia-300">{item.status}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{item.summary || "Insight sem resumo."}</p>
              {item.recommendation && <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">{item.recommendation}</div>}
              <div className="mt-4 flex gap-4 text-xs text-zinc-500"><span>Score: {item.score ?? "—"}</span><span>Confiança: {item.confidence ?? "—"}</span></div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
