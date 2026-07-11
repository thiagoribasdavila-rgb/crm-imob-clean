"use client";

import Link from "next/link";
import { DragEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

const stages = [
  { key: "novo", label: "Novos", probability: 5 },
  { key: "contato", label: "Contato", probability: 15 },
  { key: "qualificacao", label: "Qualificação", probability: 30 },
  { key: "visita", label: "Visita", probability: 50 },
  { key: "proposta", label: "Proposta", probability: 70 },
  { key: "contrato", label: "Contrato", probability: 90 },
  { key: "ganho", label: "Ganhos", probability: 100 },
] as const;

type StageKey = (typeof stages)[number]["key"];
type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  score: number | null;
  temperature: string | null;
  budget_max: number | null;
  next_action_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function leadRisk(lead: Lead) {
  const score = Number(lead.score ?? 0);
  const overdue = lead.next_action_at ? new Date(lead.next_action_at).getTime() < Date.now() : false;
  const stale = lead.updated_at ? Date.now() - new Date(lead.updated_at).getTime() > 3 * 86_400_000 : false;
  if (overdue || (stale && score >= 60)) return "alto";
  if (stale || score < 35) return "medio";
  return "baixo";
}

function riskTone(risk: string): "success" | "warning" | "danger" {
  if (risk === "alto") return "danger";
  if (risk === "medio") return "warning";
  return "success";
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  async function authenticatedFetch(input: RequestInfo, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente.");
    return fetch(input, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/pipeline");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar pipeline.");
      setLeads((payload.leads ?? []) as Lead[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar pipeline.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function moveLead(id: string, stage: StageKey) {
    const previous = leads;
    setSavingId(id);
    setError("");
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, status: stage, updated_at: new Date().toISOString() } : lead)));
    try {
      const response = await authenticatedFetch("/api/v1/pipeline", { method: "PATCH", body: JSON.stringify({ leadId: id, stage }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao mover lead.");
    } catch (moveError) {
      setLeads(previous);
      setError(moveError instanceof Error ? moveError.message : "Falha ao mover lead.");
    } finally {
      setSavingId(null);
      setDraggedId(null);
    }
  }

  function onDrop(event: DragEvent<HTMLElement>, stage: StageKey) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/lead-id") || draggedId;
    if (id) void moveLead(id, stage);
  }

  const visibleLeads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return leads;
    return leads.filter((lead) => [lead.name, lead.email, lead.phone, lead.temperature].some((value) => value?.toLowerCase().includes(normalized)));
  }, [leads, query]);

  const metrics = useMemo(() => {
    const open = leads.filter((lead) => !["ganho", "perdido"].includes(lead.status ?? "novo"));
    const pipeline = open.reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0);
    const forecast = open.reduce((sum, lead) => {
      const stage = stages.find((item) => item.key === (lead.status ?? "novo"));
      return sum + Number(lead.budget_max ?? 0) * ((stage?.probability ?? 5) / 100);
    }, 0);
    const hot = open.filter((lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70).length;
    const highRisk = open.filter((lead) => leadRisk(lead) === "alto").length;
    const won = leads.filter((lead) => lead.status === "ganho").reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0);
    return { open: open.length, pipeline, forecast, hot, highRisk, won };
  }, [leads]);

  const stageData = useMemo(() => stages.map((stage) => {
    const items = visibleLeads.filter((lead) => (lead.status ?? "novo") === stage.key);
    return { ...stage, items, value: items.reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0) };
  }), [visibleLeads]);

  return (
    <div className="space-y-6 pb-8">
      <section className="atlas-grid-glow overflow-hidden rounded-[28px] border border-sky-400/10 bg-gradient-to-br from-sky-500/[.12] via-blue-500/[.05] to-violet-500/[.1] p-6 shadow-[0_30px_100px_rgba(2,8,23,.35)] sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2"><AtlasBadge tone="info">SALES ENGINE</AtlasBadge><AtlasBadge tone="violet">PIPELINE INTELLIGENCE</AtlasBadge><AtlasBadge tone="success">LIVE</AtlasBadge></div>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Venda com <span className="atlas-gradient-text">prioridade, risco e forecast.</span></h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">Movimente leads, identifique negócios parados e concentre o time nas oportunidades com maior probabilidade de conversão.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead..." className="min-w-56 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30" />
            <Link href="/leads/new" className="atlas-button-primary">+ Novo lead</Link>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AtlasMetric label="Negócios abertos" value={loading ? "—" : metrics.open} detail="Oportunidades em andamento" trend="LIVE" tone="blue" />
        <AtlasMetric label="Pipeline bruto" value={loading ? "—" : brl.format(metrics.pipeline)} detail="Potencial comercial total" trend="VGV" tone="violet" />
        <AtlasMetric label="Forecast" value={loading ? "—" : brl.format(metrics.forecast)} detail="Ponderado por etapa" trend="AI" tone="green" />
        <AtlasMetric label="Leads quentes" value={loading ? "—" : metrics.hot} detail="Prioridade imediata" trend="HOT" tone="rose" />
        <AtlasMetric label="Risco alto" value={loading ? "—" : metrics.highRisk} detail="Negócios exigindo ação" trend="RISK" tone="amber" />
        <AtlasMetric label="VGV ganho" value={loading ? "—" : brl.format(metrics.won)} detail="Conversões concluídas" trend="WON" tone="green" />
      </section>

      <AtlasCard>
        <AtlasCardHeader eyebrow="Conversion system" title="Fluxo comercial" description="Arraste os cards entre as etapas ou use o seletor. Cada movimentação gera histórico e evento no Atlas." />
        <div className="overflow-x-auto p-4 sm:p-6">
          <div className="grid min-w-[1500px] grid-cols-7 gap-4">
            {stageData.map((stage) => (
              <section key={stage.key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, stage.key)} className="min-h-[520px] rounded-2xl border border-white/[0.07] bg-white/[0.018] p-3 transition hover:border-sky-400/15">
                <div className="mb-4 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">{stage.label}</h3><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-300">{stage.items.length}</span></div>
                  <p className="mt-2 text-xs text-slate-500">{brl.format(stage.value)}</p>
                  <div className="mt-3"><AtlasProgress value={stage.probability} /></div>
                </div>

                {loading ? <div className="space-y-3">{[1,2,3].map((item) => <AtlasSkeleton key={item} className="h-36 w-full" />)}</div> : stage.items.length === 0 ? <AtlasEmpty title="Etapa vazia" description="Arraste uma oportunidade para esta etapa." /> : <div className="space-y-3">
                  {stage.items.map((lead) => {
                    const risk = leadRisk(lead);
                    return (
                      <article key={lead.id} draggable onDragStart={(event) => { setDraggedId(lead.id); event.dataTransfer.setData("text/lead-id", lead.id); }} className={`group cursor-grab rounded-2xl border border-white/[0.07] bg-[#070d1b]/90 p-4 shadow-lg transition hover:-translate-y-0.5 hover:border-sky-400/20 ${savingId === lead.id ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><Link href={`/leads/${lead.id}`} className="block truncate text-sm font-semibold text-white transition hover:text-sky-300">{lead.name || "Lead sem nome"}</Link><p className="mt-1 truncate text-[11px] text-slate-500">{lead.phone || lead.email || "Sem contato"}</p></div>
                          <AtlasBadge tone={riskTone(risk)}>Risco {risk}</AtlasBadge>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-2"><p className="text-[9px] uppercase tracking-wider text-slate-600">Score</p><p className="mt-1 text-sm font-semibold text-white">{lead.score ?? 0}</p></div>
                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-2"><p className="text-[9px] uppercase tracking-wider text-slate-600">Temperatura</p><p className="mt-1 text-sm font-semibold capitalize text-white">{lead.temperature || "frio"}</p></div>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-200">{lead.budget_max ? brl.format(lead.budget_max) : "Valor não informado"}</p>
                        <select value={lead.status ?? "novo"} disabled={savingId === lead.id} onChange={(event) => void moveLead(lead.id, event.target.value as StageKey)} className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300 outline-none focus:border-sky-400/30">
                          {stages.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                        </select>
                      </article>
                    );
                  })}
                </div>}
              </section>
            ))}
          </div>
        </div>
      </AtlasCard>
    </div>
  );
}
