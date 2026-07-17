"use client";

import Link from "next/link";
import Image from "next/image";
import { DragEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
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

type StageKey = (typeof stages)[number]["key"] | "perdido" | "comprou_outro";
type FocusKey = "prioridade" | "sla" | "atrasadas" | "sem_acao" | "quentes" | "todas";
type SortKey = "prioridade" | "score" | "valor" | "recente";
const destinationOptions: Array<{ key: StageKey; label: string }> = [...stages, { key: "perdido", label: "Perdido" }, { key: "comprou_outro", label: "Comprou em outro lugar" }];
type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  score: number | null;
  temperature: string | null;
  budget_min: number | null;
  budget_max: number | null;
  source: string | null;
  campaign_id: string | null;
  preferred_regions: string[] | null;
  bedrooms: number | null;
  purpose: string | null;
  last_interaction_at: string | null;
  next_action_at: string | null;
  first_contact_due_at: string | null;
  first_contacted_at: string | null;
  first_contact_sla_minutes: number | null;
  created_at: string | null;
  updated_at: string | null;
  assigned_to: string | null;
  metadata: Record<string, unknown> | null;
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

function metaCampaign(lead: Lead) {
  const meta = lead.metadata?.meta;
  if (!meta || typeof meta !== "object") return lead.campaign_id;
  const record = meta as Record<string, unknown>;
  return String(record.campaignName || record.campaignId || lead.campaign_id || "");
}

function relativeTime(value: string | null) {
  if (!value) return "Sem contato";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  if (hours < 1) return "Agora";
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

function dateLabel(value: string | null) {
  if (!value) return "Não agendado";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function firstContactSla(lead: Lead) {
  if (lead.first_contacted_at) {
    const minutes = lead.created_at ? Math.max(0, Math.round((new Date(lead.first_contacted_at).getTime() - new Date(lead.created_at).getTime()) / 60_000)) : null;
    return { label: minutes === null ? "Contato realizado" : `Contato em ${minutes} min`, tone: "success" as const, overdue: false };
  }
  if (!lead.first_contact_due_at) return null;
  const remaining = Math.ceil((new Date(lead.first_contact_due_at).getTime() - Date.now()) / 60_000);
  if (remaining < 0) return { label: `SLA vencido há ${Math.abs(remaining)} min`, tone: "danger" as const, overdue: true };
  return { label: `1º contato em até ${remaining} min`, tone: remaining <= 2 ? "warning" as const : "info" as const, overdue: false };
}

function isOpenLead(lead: Lead) {
  return !["ganho", "perdido", "comprou_outro"].includes(lead.status ?? "novo");
}

function isNextActionOverdue(lead: Lead) {
  return Boolean(lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now());
}

function priorityWeight(lead: Lead) {
  const sla = firstContactSla(lead);
  let weight = Number(lead.score ?? 0);
  if (sla?.overdue) weight += 300;
  if (isNextActionOverdue(lead)) weight += 220;
  if (!lead.next_action_at) weight += 80;
  if (lead.temperature === "quente") weight += 100;
  if (leadRisk(lead) === "alto") weight += 120;
  return weight;
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<FocusKey>("prioridade");
  const [sort, setSort] = useState<SortKey>("prioridade");
  const [compact, setCompact] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);
  const [lastMove, setLastMove] = useState<{ leadId: string; leadName: string; from: StageKey; to: StageKey } | null>(null);

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
    const currentLead = leads.find((lead) => lead.id === id);
    const previousStage = (currentLead?.status || "novo") as StageKey;
    if (previousStage === stage) { setDraggedId(null); setDragOverStage(null); return; }
    let followUpDescription = "";
    if (stage === "comprou_outro") {
      followUpDescription = window.prompt("Descreva o que pesou na compra: projeto, região, preço, prazo, financiamento ou atendimento. Essa descrição ficará protegida no CRM.")?.trim() || "";
      if (followUpDescription.length < 10) { setError("Registre um acompanhamento com pelo menos 10 caracteres para preservar o aprendizado comercial."); return; }
    }
    const previous = leads;
    setSavingId(id);
    setError("");
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, status: stage, updated_at: new Date().toISOString() } : lead)));
    try {
      const response = await authenticatedFetch("/api/v1/pipeline", { method: "PATCH", body: JSON.stringify({ leadId: id, stage, followUpDescription }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao mover lead.");
      setLastMove({ leadId: id, leadName: currentLead?.name || "Lead", from: previousStage, to: stage });
    } catch (moveError) {
      setLeads(previous);
      setError(moveError instanceof Error ? moveError.message : "Falha ao mover lead.");
    } finally {
      setSavingId(null);
      setDraggedId(null);
      setDragOverStage(null);
    }
  }

  function onDrop(event: DragEvent<HTMLElement>, stage: StageKey) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/lead-id") || draggedId;
    if (id) void moveLead(id, stage);
  }

  async function undoLastMove() {
    if (!lastMove) return;
    const move = lastMove;
    setLastMove(null);
    await moveLead(move.leadId, move.from);
    setLastMove(null);
  }

  const visibleLeads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const searched = normalized ? leads.filter((lead) => [lead.name, lead.email, lead.phone, lead.temperature, lead.source, lead.purpose, metaCampaign(lead), ...(lead.preferred_regions ?? [])].some((value) => value?.toLowerCase().includes(normalized))) : leads;
    const filtered = searched.filter((lead) => {
      if (focus === "todas") return true;
      if (!isOpenLead(lead)) return false;
      if (focus === "sla") return Boolean(firstContactSla(lead)?.overdue);
      if (focus === "atrasadas") return isNextActionOverdue(lead);
      if (focus === "sem_acao") return !lead.next_action_at;
      if (focus === "quentes") return lead.temperature === "quente" || Number(lead.score ?? 0) >= 70;
      return Boolean(firstContactSla(lead)?.overdue) || isNextActionOverdue(lead) || !lead.next_action_at || lead.temperature === "quente" || Number(lead.score ?? 0) >= 70 || leadRisk(lead) === "alto";
    });
    return [...filtered].sort((a, b) => {
      if (sort === "score") return Number(b.score ?? 0) - Number(a.score ?? 0);
      if (sort === "valor") return Number(b.budget_max ?? 0) - Number(a.budget_max ?? 0);
      if (sort === "recente") return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
      return priorityWeight(b) - priorityWeight(a);
    });
  }, [focus, leads, query, sort]);

  const metrics = useMemo(() => {
    const open = leads.filter((lead) => !["ganho", "perdido", "comprou_outro"].includes(lead.status ?? "novo"));
    const pipeline = open.reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0);
    const forecast = open.reduce((sum, lead) => {
      const stage = stages.find((item) => item.key === (lead.status ?? "novo"));
      return sum + Number(lead.budget_max ?? 0) * ((stage?.probability ?? 5) / 100);
    }, 0);
    const hot = open.filter((lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70).length;
    const highRisk = open.filter((lead) => leadRisk(lead) === "alto").length;
    const won = leads.filter((lead) => lead.status === "ganho").reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0);
    const buyerProfiles = leads.filter((lead) => lead.status === "comprou_outro").length;
    const firstContactOverdue = open.filter((lead) => firstContactSla(lead)?.overdue).length;
    return { open: open.length, pipeline, forecast, hot, highRisk, won, buyerProfiles, firstContactOverdue };
  }, [leads]);

  const stageData = useMemo(() => stages.map((stage) => {
    const items = visibleLeads.filter((lead) => (lead.status ?? "novo") === stage.key);
    return { ...stage, items, value: items.reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0) };
  }), [visibleLeads]);
  const boardStages = useMemo(() => hideEmpty ? stageData.filter((stage) => stage.items.length > 0) : stageData, [hideEmpty, stageData]);

  const focusOptions = useMemo(() => {
    const open = leads.filter(isOpenLead);
    return [
      { key: "prioridade" as const, label: "Minha prioridade", count: open.filter((lead) => firstContactSla(lead)?.overdue || isNextActionOverdue(lead) || !lead.next_action_at || lead.temperature === "quente" || Number(lead.score ?? 0) >= 70 || leadRisk(lead) === "alto").length },
      { key: "sla" as const, label: "SLA vencido", count: open.filter((lead) => firstContactSla(lead)?.overdue).length },
      { key: "atrasadas" as const, label: "Ações atrasadas", count: open.filter(isNextActionOverdue).length },
      { key: "sem_acao" as const, label: "Sem próxima ação", count: open.filter((lead) => !lead.next_action_at).length },
      { key: "quentes" as const, label: "Leads quentes", count: open.filter((lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70).length },
      { key: "todas" as const, label: "Todos", count: leads.length },
    ];
  }, [leads]);

  return (
    <div className="space-y-6 pb-8">
      <section className="atlas-pipeline-hero atlas-grid-glow">
        <Image className="atlas-pipeline-robot" src="/brand/atlas-robot-broker.png" alt="Robô-corretor Atlas acompanhando o pipeline comercial" width={210} height={315} priority />
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2"><AtlasBadge tone="info">SALES ENGINE</AtlasBadge><AtlasBadge tone="violet">PIPELINE INTELLIGENCE</AtlasBadge><AtlasBadge tone="success">LIVE</AtlasBadge></div>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-.05em] text-white sm:text-5xl">Seu funil. <span className="atlas-gradient-text">Mais claro, mais inteligente.</span></h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">Uma visão limpa para avançar negócios, antecipar riscos e manter cada próximo passo visível para o time.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead, região, origem ou campanha..." className="min-w-72 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30" />
            <Link href="/leads/new" className="atlas-button-primary">+ Novo lead</Link>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
      {lastMove ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] px-4 py-3 text-sm text-sky-100" role="status"><span><strong>{lastMove.leadName}</strong> avançou para {destinationOptions.find((item) => item.key === lastMove.to)?.label}.</span><button type="button" onClick={() => void undoLastMove()} disabled={Boolean(savingId)} className="rounded-xl border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold hover:bg-sky-300/15 disabled:opacity-50">Desfazer movimentação</button></div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AtlasMetric label="Negócios abertos" value={loading ? "—" : metrics.open} detail="Oportunidades em andamento" trend="LIVE" tone="blue" />
        <AtlasMetric label="Pipeline bruto" value={loading ? "—" : brl.format(metrics.pipeline)} detail="Potencial comercial total" trend="VGV" tone="violet" />
        <AtlasMetric label="Forecast" value={loading ? "—" : brl.format(metrics.forecast)} detail="Ponderado por etapa" trend="AI" tone="green" />
        <AtlasMetric label="Leads quentes" value={loading ? "—" : metrics.hot} detail="Prioridade imediata" trend="HOT" tone="rose" />
        <AtlasMetric label="Risco alto" value={loading ? "—" : metrics.highRisk} detail={`${metrics.firstContactOverdue} SLA inicial vencido(s)`} trend="RISK" tone="amber" />
        <AtlasMetric label="Perfis compradores" value={loading ? "—" : metrics.buyerProfiles} detail="Compraram em outro lugar" trend="LEARN" tone="green" />
      </section>

      <section className="rounded-[24px] border border-white/[0.07] bg-white/[0.018] p-4 sm:p-5" aria-label="Fila de foco comercial">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-sky-300">Fila inteligente</p><h3 className="mt-1 text-lg font-semibold text-white">O que precisa de ação agora</h3><p className="mt-1 text-xs text-slate-500">Ordenado automaticamente por SLA, atraso, temperatura, risco e score.</p></div>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar oportunidades do pipeline">
            {focusOptions.map((option) => <button key={option.key} type="button" onClick={() => setFocus(option.key)} aria-pressed={focus === option.key} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${focus === option.key ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:text-white"}`}><span>{option.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[9px] ${focus === option.key ? "bg-sky-300/15 text-sky-100" : "bg-white/[0.05] text-slate-500"}`}>{option.count}</span></button>)}
          </div>
        </div>
      </section>

      <section className="atlas-pipeline-flow" aria-label="Resumo visual das etapas do pipeline">
        {stageData.map((stage, index) => (
          <div key={stage.key} style={{ "--flow": `${stage.probability}%` } as CSSProperties}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p><strong>{stage.label}</strong><small>{stage.items.length} leads · {brl.format(stage.value)}</small></p>
            <i><b /></i>
          </div>
        ))}
      </section>

      <AtlasCard>
        <AtlasCardHeader eyebrow="Conversion system" title="Fluxo comercial" description="Arraste os cards entre as etapas ou use o seletor. Cada movimentação gera histórico e evento no Atlas." />
        <div className="flex flex-col gap-3 border-t border-white/[0.06] px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between" aria-label="Controles do Kanban">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500" htmlFor="pipeline-sort">Ordenar</label>
            <select id="pipeline-sort" value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-400/30">
              <option value="prioridade">Prioridade inteligente</option><option value="score">Maior score</option><option value="valor">Maior valor</option><option value="recente">Atualização recente</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCompact((value) => !value)} aria-pressed={compact} className={`atlas-kanban-toggle ${compact ? "is-active" : ""}`}>{compact ? "Visão compacta" : "Visão confortável"}</button>
            <button type="button" onClick={() => setHideEmpty((value) => !value)} aria-pressed={hideEmpty} className={`atlas-kanban-toggle ${hideEmpty ? "is-active" : ""}`}>{hideEmpty ? "Mostrando etapas ativas" : "Mostrar todas as etapas"}</button>
          </div>
        </div>
        <div className="overflow-x-auto p-4 sm:p-6">
          <div className={`atlas-kanban-board ${compact ? "is-compact" : ""}`} style={{ "--kanban-columns": boardStages.length } as CSSProperties}>
            {boardStages.map((stage) => (
              <section key={stage.key} onDragEnter={() => setDragOverStage(stage.key)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverStage(null); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, stage.key)} className={`atlas-pipeline-column ${dragOverStage === stage.key ? "is-drop-target" : ""}`}>
                <div className="mb-4 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">{stage.label}</h3><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-300">{stage.items.length}</span></div>
                  <p className="mt-2 text-xs text-slate-500">{brl.format(stage.value)}</p>
                  <div className="mt-3"><AtlasProgress value={stage.probability} /></div>
                </div>

                {loading ? <div className="space-y-3">{[1,2,3].map((item) => <AtlasSkeleton key={item} className="h-36 w-full" />)}</div> : stage.items.length === 0 ? <AtlasEmpty title="Etapa vazia" description="Arraste uma oportunidade para esta etapa." /> : <div className="space-y-3">
                  {stage.items.map((lead) => {
                    const risk = leadRisk(lead);
                    const contactSla = firstContactSla(lead);
                    return (
                      <article key={lead.id} draggable onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }} onDragStart={(event) => { setDraggedId(lead.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/lead-id", lead.id); }} className={`atlas-pipeline-lead group ${savingId === lead.id ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><Link href={`/leads/${lead.id}`} className="block truncate text-sm font-semibold text-white transition hover:text-sky-300">{lead.name || "Lead sem nome"}</Link><p className="mt-1 truncate text-[11px] text-slate-500">{lead.phone || lead.email || "Sem contato"}</p></div>
                          <AtlasBadge tone={riskTone(risk)}>Risco {risk}</AtlasBadge>
                        </div>
                        <div className="atlas-lead-origin"><span>{lead.source || "Origem não informada"}</span>{metaCampaign(lead) ? <small>{metaCampaign(lead)}</small> : null}</div>
                        {contactSla ? <div className="mt-3"><AtlasBadge tone={contactSla.tone}>{contactSla.label}</AtlasBadge></div> : null}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-2"><p className="text-[9px] uppercase tracking-wider text-slate-600">Score</p><p className="mt-1 text-sm font-semibold text-white">{lead.score ?? 0}</p></div>
                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-2"><p className="text-[9px] uppercase tracking-wider text-slate-600">Temperatura</p><p className="mt-1 text-sm font-semibold capitalize text-white">{lead.temperature || "frio"}</p></div>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-200">{lead.budget_max ? brl.format(lead.budget_max) : "Valor não informado"}</p>
                        <div className="atlas-lead-details">
                          <p><span>Interesse</span><strong>{lead.purpose || "A definir"}{lead.bedrooms ? ` · ${lead.bedrooms} dorm.` : ""}</strong></p>
                          <p><span>Região</span><strong>{lead.preferred_regions?.join(", ") || "Não informada"}</strong></p>
                          <p><span>Último contato</span><strong>{relativeTime(lead.last_interaction_at)}</strong></p>
                          <p><span>Próxima ação</span><strong>{dateLabel(lead.next_action_at)}</strong></p>
                        </div>
                        <Link href={`/leads/${lead.id}`} className="mt-4 flex w-full items-center justify-between rounded-xl border border-sky-400/15 bg-sky-400/[0.06] px-3 py-2.5 text-xs font-semibold text-sky-200 transition hover:border-sky-400/30 hover:bg-sky-400/10"><span>{contactSla?.overdue ? "Resolver SLA agora" : isNextActionOverdue(lead) ? "Executar ação atrasada" : lead.next_action_at ? "Abrir próxima ação" : "Definir próxima ação"}</span><span aria-hidden="true">→</span></Link>
                        <select value={lead.status ?? "novo"} disabled={savingId === lead.id} onChange={(event) => void moveLead(lead.id, event.target.value as StageKey)} className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300 outline-none focus:border-sky-400/30">
                          {destinationOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
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
      <AtlasCard>
        <AtlasCardHeader eyebrow="Inteligência de compradores" title="Compraram em outro lugar" description="Base separada do funil ativo: compradores reais que ajudam a entender público, produto, preço e concorrência sem contar como venda da empresa." />
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">{leads.filter((lead) => lead.status === "comprou_outro").length ? leads.filter((lead) => lead.status === "comprou_outro").map((lead) => <article key={lead.id} className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[.035] p-4"><div className="flex items-start justify-between gap-3"><div><Link href={`/leads/${lead.id}`} className="font-semibold text-white hover:text-emerald-300">{lead.name || "Cliente comprador"}</Link><p className="mt-1 text-xs text-slate-500">{lead.phone || lead.email || "Contato protegido"}</p></div><AtlasBadge tone="success">COMPRADOR</AtlasBadge></div><p className="mt-3 text-xs leading-5 text-slate-400">Perfil preservado para inteligência comercial e futuras estratégias de público.</p><select value={lead.status ?? "comprou_outro"} disabled={savingId === lead.id} onChange={(event) => void moveLead(lead.id, event.target.value as StageKey)} className="mt-4 w-full rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-xs text-slate-300">{destinationOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></article>) : <div className="sm:col-span-2 xl:col-span-3"><AtlasEmpty title="Nenhum perfil comprador separado" description="Ao registrar uma compra em outro lugar, o cliente aparecerá aqui com seu aprendizado preservado." /></div>}</div>
      </AtlasCard>
    </div>
  );
}
