"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { isMissingRelation, mapLegacyLead, mapLegacyTask } from "@/lib/compat/legacy-v2";

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

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value : "";
const date = (value: unknown) => { const parsed = new Date(text(value)); return Number.isNaN(parsed.getTime()) ? null : parsed; };

function localInsights(leads: Row[], tasks: Row[]): Insight[] {
  const now = Date.now();
  const active = leads.filter((lead) => !["ganho", "perdido", "arquivado", "comprou_outro"].includes(text(lead.status).toLowerCase()));
  const withoutContact = active.filter((lead) => !lead.last_interaction_at);
  const hot = active.filter((lead) => Number(lead.score || 0) >= 70 || ["quente", "hot"].includes(text(lead.temperature).toLowerCase()));
  const overdue = tasks.filter((task) => !["done", "concluido", "concluida", "completed", "cancelado"].includes(text(task.status).toLowerCase()) && Boolean(date(task.due_at) && date(task.due_at)!.getTime() < now));
  return [
    { id: "local-no-contact", title: `${withoutContact.length} leads sem contato registrado`, summary: "Carteira ativa sem interação identificada na base atual.", recommendation: withoutContact.length ? "Priorize primeiro contato e registre o resultado no Lead 360." : "A carteira ativa possui contato registrado.", score: withoutContact.length, confidence: 100, status: withoutContact.length ? "atenção" : "saudável", created_at: new Date(now).toISOString() },
    { id: "local-hot", title: `${hot.length} oportunidades quentes`, summary: "Leads com score igual ou superior a 70 ou temperatura quente.", recommendation: hot.length ? "Revise a próxima ação e o prazo de retorno dessas oportunidades." : "Continue qualificando para identificar intenção de compra.", score: hot.length, confidence: 100, status: hot.length ? "oportunidade" : "monitorando", created_at: new Date(now).toISOString() },
    { id: "local-overdue", title: `${overdue.length} tarefas atrasadas`, summary: "Compromissos abertos cujo prazo já venceu.", recommendation: overdue.length ? "Recupere os atrasos antes de iniciar ações de menor prioridade." : "A agenda comercial está em dia.", score: overdue.length, confidence: 100, status: overdue.length ? "atenção" : "saudável", created_at: new Date(now).toISOString() },
  ];
}

export default function IntelligencePage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("ai_insights")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error && isMissingRelation(error)) {
        const [leadResult, taskResult] = await Promise.all([
          supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(2000),
          supabase.from("tasks").select("*").limit(2000),
        ]);
        if (leadResult.error || taskResult.error) setError("Inteligência temporariamente indisponível. Tente novamente.");
        else setItems(localInsights(((leadResult.data ?? []) as Row[]).map(mapLegacyLead), ((taskResult.data ?? []) as Row[]).map(mapLegacyTask)));
      } else {
        if (error) setError("Módulo temporariamente indisponível. O Atlas registrou o problema.");
        setItems(((data ?? []) as Row[]).map((item) => ({ id: text(item.id), title: text(item.title || item.type) || "Insight operacional", summary: text(item.summary || item.content) || null, recommendation: text(item.recommendation) || null, score: Number.isFinite(Number(item.score)) ? Number(item.score) : null, confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null, status: text(item.status) || "ativo", created_at: text(item.created_at) || new Date().toISOString() })));
      }
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
          <AtlasCard className="lg:col-span-2"><AtlasCardHeader eyebrow="Motor preparado" title="Nenhum sinal exige atenção agora" description="A inteligência local analisou os dados visíveis e continuará pronta para novos eventos."/><div className="p-5"><AtlasEmpty title="Operação sem alertas" description="Novos sinais aparecerão aqui sem depender de uma IA externa." /></div></AtlasCard>
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
