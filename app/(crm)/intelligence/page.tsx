"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { isMissingRelation } from "@/lib/compat/legacy-v2";

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

  const load = useCallback(async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("ai_insights")
        .select("id, title, summary, recommendation, score, confidence, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error && !isMissingRelation(error)) setError("Módulo temporariamente indisponível. O Atlas registrou o problema.");
      setItems((data as Insight[]) ?? []);
      setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div><AtlasBadge tone="violet">ATLAS INTELLIGENCE</AtlasBadge><h1 className="mt-4 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Central de inteligência</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Sinais, previsões e recomendações explicáveis para a operação imobiliária, sem decisões automáticas sobre pessoas.</p></div>

      {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"><span>{error}</span><button type="button" onClick={() => void load()} className="atlas-button-secondary">Tentar novamente</button></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {loading ? (
          [1,2,3,4].map((item) => <AtlasSkeleton key={item} className="h-48" />)
        ) : items.length === 0 ? (
          <AtlasCard className="lg:col-span-2"><AtlasCardHeader eyebrow="Motor preparado" title="A inteligência será ativada sobre dados consolidados" description="Assim que os insights forem persistidos, o Atlas exibirá score, resumo e próxima melhor ação sem poluir a rotina comercial."/><div className="p-5"><AtlasEmpty title="Nenhum insight disponível agora" description="Os leads continuam acessíveis e a operação segue funcionando normalmente." /></div></AtlasCard>
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
