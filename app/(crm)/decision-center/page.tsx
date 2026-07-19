"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LIVE_LEAD_SELECT, mapLegacyLead } from "@/lib/compat/legacy-v2";

type Insight = { id: string; title: string; summary: string | null; recommendation: string | null; score: number | null; confidence: number | null; status: string; entity_type: string; created_at: string };
type Lead = { id: string; name: string | null; score: number | null; temperature: string | null; status: string | null; next_action_at: string | null };

type Decision = { id: string; priority: number; title: string; reason: string; action: string; type: string };
type BriefingResponse = {
  signals?: Array<{ id: string; severity: "critical" | "attention" | "opportunity" | "healthy"; title: string; evidence: string; action: string }>;
  model?: { generativeReady?: boolean };
};

export default function DecisionCenterPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadError(false);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const [briefingResponse, leadResult] = await Promise.all([
          token
            ? fetch("/api/ai/briefing", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
            : Promise.resolve(null),
          supabase.from("leads").select(LIVE_LEAD_SELECT).order("created_at", { ascending: false }).limit(100),
        ]);
        const briefing = briefingResponse?.ok ? ((await briefingResponse.json()) as BriefingResponse) : null;
        if (leadResult.error) throw leadResult.error;
        if (!active) return;
        const confidence = briefing?.model?.generativeReady ? 0.9 : 0.74;
        const scoreBySeverity = { critical: 96, attention: 84, opportunity: 76, healthy: 60 };
        setInsights((briefing?.signals ?? []).map((signal) => ({
          id: signal.id,
          title: signal.title,
          summary: signal.evidence,
          recommendation: signal.action,
          score: scoreBySeverity[signal.severity],
          confidence,
          status: "active",
          entity_type: signal.severity === "opportunity" ? "Oportunidade" : "Operação",
          created_at: new Date().toISOString(),
        })));
        setLeads((leadResult.data ?? []).map((row) => {
          const lead = mapLegacyLead(row as unknown as Record<string, unknown>);
          return {
            id: String(lead.id),
            name: typeof lead.name === "string" ? lead.name : null,
            score: Number.isFinite(Number(lead.score)) ? Number(lead.score) : null,
            temperature: typeof lead.temperature === "string" ? lead.temperature : null,
            status: typeof lead.status === "string" ? lead.status : null,
            next_action_at: typeof lead.next_action_at === "string" ? lead.next_action_at : null,
          };
        }));
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
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

      {loadError ? <div role="status" className="rounded-2xl border border-amber-400/20 bg-amber-400/[.08] px-5 py-4 text-sm text-amber-100">O Atlas não conseguiu atualizar todos os sinais agora. Seus dados permanecem protegidos; tente novamente ao recarregar esta página.</div> : null}

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
