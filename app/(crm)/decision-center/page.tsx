"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Insight = { id: string; title: string; summary: string | null; recommendation: string | null; score: number | null; confidence: number | null; status: string; entity_type: string; created_at: string };
type Lead = { id: string; name: string | null; score: number | null; temperature: string | null; status: string | null; next_action_at: string | null };

type Decision = { id: string; priority: number; title: string; reason: string; action: string; type: string };

export default function DecisionCenterPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: insightData }, { data: leadData }] = await Promise.all([
        supabase.from("ai_insights").select("id,title,summary,recommendation,score,confidence,status,entity_type,created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("leads").select("id,name,score,temperature,status,next_action_at").order("score", { ascending: false }).limit(30),
      ]);
      setInsights((insightData ?? []) as Insight[]);
      setLeads((leadData ?? []) as Lead[]);
      setLoading(false);
    }
    load();
  }, []);

  const decisions = useMemo<Decision[]>(() => {
    const items: Decision[] = [];
    leads.forEach(lead => {
      const score = Number(lead.score || 0);
      if (score >= 75) items.push({ id: `lead-${lead.id}`, priority: score, title: `Priorizar ${lead.name || "lead sem nome"}`, reason: `Score ${score} e temperatura ${lead.temperature || "não informada"}.`, action: "Contato imediato e oferta compatível", type: "Lead" });
      if (lead.next_action_at && new Date(lead.next_action_at) < new Date()) items.push({ id: `follow-${lead.id}`, priority: 90, title: `Follow-up atrasado: ${lead.name || "lead"}`, reason: "Próxima ação já venceu.", action: "Executar contato e registrar atividade", type: "Follow-up" });
    });
    insights.filter(i => i.status === "active" || i.status === "novo").forEach(insight => items.push({ id: `insight-${insight.id}`, priority: Number(insight.score || 60), title: insight.title, reason: insight.summary || "Insight gerado pelo Atlas.", action: insight.recommendation || "Revisar recomendação", type: insight.entity_type }));
    return items.sort((a, b) => b.priority - a.priority).slice(0, 20);
  }, [insights, leads]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">Atlas Decision Engine</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Centro de decisão</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Fila priorizada de decisões comerciais, operacionais e estratégicas com justificativa, confiança e ação recomendada.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        {[["Decisões", decisions.length], ["Leads analisados", leads.length], ["Insights ativos", insights.length], ["Críticas", decisions.filter(d => d.priority >= 85).length]].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-3 text-3xl font-black">{loading ? "—" : value}</p></article>)}
      </section>

      <section className="space-y-4">
        {!loading && decisions.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-10 text-center text-zinc-500">Nenhuma decisão pendente.</div> : null}
        {decisions.map(decision => <article key={decision.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="flex items-center gap-2"><span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300">{decision.type}</span><span className={`rounded-full px-2.5 py-1 text-xs ${decision.priority >= 85 ? "bg-red-500/10 text-red-300" : decision.priority >= 70 ? "bg-amber-500/10 text-amber-300" : "bg-zinc-800 text-zinc-400"}`}>Prioridade {decision.priority}</span></div><h2 className="mt-3 text-lg font-bold">{decision.title}</h2><p className="mt-2 text-sm leading-6 text-zinc-400">{decision.reason}</p></div>
            <div className="min-w-[260px] rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">Ação recomendada</p><p className="mt-2 text-sm font-semibold text-zinc-200">{decision.action}</p></div>
          </div>
        </article>)}
      </section>
    </div>
  );
}
