"use client";

import Link from "next/link";
import Image from "next/image";
import { DragEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { DEFAULT_PIPELINE_STAGES, type PipelineStageDefinition, type PipelineStageKey } from "@/lib/atlas/pipeline-stages";

const defaultStages = DEFAULT_PIPELINE_STAGES.filter((stage) => stage.visible && stage.outcome !== "lost" && stage.outcome !== "buyer_profile");
type StageKey = PipelineStageKey;
type FocusKey = "prioridade" | "sla" | "atrasadas" | "sem_acao" | "quentes" | "todas";
type SortKey = "prioridade" | "score" | "valor" | "recente";
type PipelinePreferences = {
  focus?: FocusKey;
  sort?: SortKey;
  compact?: boolean;
  focusMode?: boolean;
  hideEmpty?: boolean;
  mobileStage?: StageKey;
};
type PipelineScope = {
  loaded: number;
  totalOperational: number;
  archivedMemoryExcluded: boolean;
  limit: number;
};
type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  project: string | null;
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
  first_response_minutes: number | null;
  first_contact_sla_met: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  assigned_to: string | null;
  metadata: Record<string, unknown> | null;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const PIPELINE_PREFERENCES_KEY = "atlas:pipeline-preferences:v1";

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
    const minutes = lead.first_response_minutes ?? (lead.created_at ? Math.max(0, Math.round((new Date(lead.first_contacted_at).getTime() - new Date(lead.created_at).getTime()) / 60_000)) : null);
    return { label: minutes === null ? "Contato realizado" : `${lead.first_contact_sla_met === false ? "Fora do SLA" : "No SLA"} · ${minutes} min`, tone: lead.first_contact_sla_met === false ? "warning" as const : "success" as const, overdue: false };
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

function brokerGuidance(lead: Lead) {
  const sla = firstContactSla(lead);
  if (sla?.overdue) return { action: "Fazer o primeiro contato agora", reason: "O SLA venceu e a chance de resposta cai com o tempo.", tone: "danger" as const };
  if (isNextActionOverdue(lead)) return { action: "Retomar o combinado", reason: `A próxima ação estava prevista para ${dateLabel(lead.next_action_at)}.`, tone: "warning" as const };
  if (!lead.next_action_at) return { action: "Definir a próxima ação", reason: "A oportunidade está sem compromisso futuro registrado.", tone: "warning" as const };
  if ((lead.status ?? "novo") === "proposta") return { action: "Validar proposta e objeções", reason: "Confirme preço, fluxo, prazo e quem participa da decisão.", tone: "info" as const };
  if ((lead.status ?? "novo") === "visita") return { action: "Preparar a visita", reason: "Reconfirme horário, interesse principal e unidade disponível.", tone: "info" as const };
  if (lead.temperature === "quente" || Number(lead.score ?? 0) >= 70) return { action: "Avançar a oportunidade", reason: "A lead combina intenção e sinais comerciais fortes.", tone: "success" as const };
  return { action: "Manter o acompanhamento", reason: `Próxima ação em ${dateLabel(lead.next_action_at)}.`, tone: "info" as const };
}

function phoneLinks(phone: string | null) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const international = digits.startsWith("55") ? digits : `55${digits}`;
  return { call: `tel:+${international}`, whatsapp: `https://wa.me/${international}` };
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStageDefinition[]>(defaultStages);
  const [canConfigureStages, setCanConfigureStages] = useState(false);
  const [pipelineScope, setPipelineScope] = useState<PipelineScope>({ loaded: 0, totalOperational: 0, archivedMemoryExcluded: true, limit: 500 });
  const [mobileStage, setMobileStage] = useState<StageKey>(defaultStages[0]?.key || "novo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<FocusKey>("prioridade");
  const [sort, setSort] = useState<SortKey>("prioridade");
  const [compact, setCompact] = useState(true);
  const [focusMode, setFocusMode] = useState(true);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);
  const [lastMove, setLastMove] = useState<{ moveId: string; leadId: string; leadName: string; from: StageKey; to: StageKey } | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(PIPELINE_PREFERENCES_KEY);
      if (saved) {
        const preferences = JSON.parse(saved) as PipelinePreferences;
        if (preferences.focus) setFocus(preferences.focus);
        if (preferences.sort) setSort(preferences.sort);
        if (typeof preferences.compact === "boolean") setCompact(preferences.compact);
        if (typeof preferences.focusMode === "boolean") setFocusMode(preferences.focusMode);
        if (typeof preferences.hideEmpty === "boolean") setHideEmpty(preferences.hideEmpty);
        if (preferences.mobileStage) setMobileStage(preferences.mobileStage);
      }
    } catch {
      window.sessionStorage.removeItem(PIPELINE_PREFERENCES_KEY);
    } finally {
      setPreferencesHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;
    window.sessionStorage.setItem(
      PIPELINE_PREFERENCES_KEY,
      JSON.stringify({ focus, sort, compact, focusMode, hideEmpty, mobileStage }),
    );
  }, [compact, focus, focusMode, hideEmpty, mobileStage, preferencesHydrated, sort]);

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
      if (!response.ok) throw new Error("O pipeline não pôde ser carregado agora. Tente novamente em instantes.");
      setLeads((payload.leads ?? []) as Lead[]);
      if (Array.isArray(payload.stages)) setStages((payload.stages as PipelineStageDefinition[]).filter((stage) => stage.visible && stage.outcome !== "lost" && stage.outcome !== "buyer_profile"));
      setCanConfigureStages(payload.canConfigureStages === true);
      if (payload.pagination && typeof payload.pagination === "object") {
        setPipelineScope({
          loaded: Number(payload.pagination.loaded || 0),
          totalOperational: Number(payload.pagination.totalOperational || 0),
          archivedMemoryExcluded: payload.pagination.archivedMemoryExcluded !== false,
          limit: Number(payload.pagination.limit || 500),
        });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "O pipeline não pôde ser carregado agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function moveLead(id: string, stage: StageKey, reversalOf?: string) {
    if (savingId) {
      setError("Aguarde a movimentação atual ser confirmada antes de mover outra lead.");
      return;
    }
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
      const response = await authenticatedFetch("/api/v1/pipeline", { method: "PATCH", body: JSON.stringify({ leadId: id, stage, expectedFromStage: previousStage, followUpDescription, reversalOf: reversalOf || null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error("A movimentação não foi confirmada. A lead permaneceu na etapa anterior.");
      if (!reversalOf && payload.move?.moveId) setLastMove({ moveId: payload.move.moveId, leadId: id, leadName: currentLead?.name || "Lead", from: previousStage, to: stage });
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

  function moveByKeyboard(lead: Lead, direction: -1 | 1) {
    const current = stages.findIndex((stage) => stage.key === (lead.status || "novo"));
    const destination = stages[current + direction];
    if (destination) void moveLead(lead.id, destination.key);
  }

  async function undoLastMove() {
    if (!lastMove) return;
    const move = lastMove;
    setLastMove(null);
    await moveLead(move.leadId, move.from, move.moveId);
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

  const destinationOptions = useMemo<Array<{ key: StageKey; label: string }>>(() => {
    const configured = new Map(stages.map((stage) => [stage.key, stage.label]));
    return DEFAULT_PIPELINE_STAGES.map((stage) => ({ key: stage.key, label: configured.get(stage.key) || stage.label }));
  }, [stages]);

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
  }, [leads, stages]);

  const stageData = useMemo(() => stages.map((stage) => {
    const items = visibleLeads.filter((lead) => (lead.status ?? "novo") === stage.key);
    return { ...stage, items, value: items.reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0) };
  }), [stages, visibleLeads]);
  const boardStages = useMemo(() => hideEmpty ? stageData.filter((stage) => stage.items.length > 0) : stageData, [hideEmpty, stageData]);
  const activeMobileStage = boardStages.some((stage) => stage.key === mobileStage) ? mobileStage : boardStages[0]?.key;
  const dailyFocus = useMemo(() => visibleLeads.filter(isOpenLead).slice(0, 3), [visibleLeads]);

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
    <div className="space-y-5 pb-8" data-phase="37-pipeline-movement-workspace" data-pipeline-layout="movement-first">
      <section className={`atlas-pipeline-hero atlas-grid-glow ${focusMode ? "is-focus-mode" : ""}`}>
        <Image className="atlas-pipeline-robot" src="/brand/atlas-robot-broker.png" alt="Robô-corretor Atlas acompanhando o pipeline comercial" width={210} height={315} priority />
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2"><AtlasBadge tone="success">PIPELINE AO VIVO</AtlasBadge><AtlasBadge tone="info">{metrics.open} NEGÓCIOS</AtlasBadge>{pipelineScope.totalOperational > 0 ? <AtlasBadge tone="info">{pipelineScope.loaded}/{pipelineScope.totalOperational} CARREGADOS</AtlasBadge> : null}</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.05em] text-white sm:text-5xl">Pipeline comercial</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Decida o próximo movimento, proteja SLAs e mantenha cada avanço registrado.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead, região, origem ou campanha..." className="min-w-72 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30" />
            <button type="button" onClick={() => setFocusMode((value) => !value)} aria-pressed={focusMode} className={`atlas-button-secondary ${focusMode ? "border-sky-400/20 !text-sky-200" : ""}`}>{focusMode ? "Expandir inteligência" : "✦ Ativar modo foco"}</button>
            {canConfigureStages ? <Link href="/pipeline/settings" className="atlas-button-secondary">Configurar etapas</Link> : null}
            <Link href="/leads/new" className="atlas-button-primary">+ Novo lead</Link>
          </div>
        </div>
      </section>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
      {!loading && pipelineScope.totalOperational > pipelineScope.loaded ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100" role="status"><span>Este quadro mostra {pipelineScope.loaded} de {pipelineScope.totalOperational} oportunidades operacionais. A memória arquivada continua isolada.</span><Link href="/leads" className="font-semibold text-amber-50 underline decoration-amber-300/40 underline-offset-4">Pesquisar a base completa</Link></div> : null}
      {savingId ? <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100" role="status" aria-live="polite">Confirmando movimentação e registrando o histórico…</div> : null}
      {lastMove ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] px-4 py-3 text-sm text-sky-100" role="status"><span><strong>{lastMove.leadName}</strong> avançou para {destinationOptions.find((item) => item.key === lastMove.to)?.label}.</span><button type="button" onClick={() => void undoLastMove()} disabled={Boolean(savingId)} className="rounded-xl border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold hover:bg-sky-300/15 disabled:opacity-50">Desfazer movimentação</button></div> : null}

      {!focusMode ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AtlasMetric label="Negócios abertos" value={loading ? "—" : metrics.open} detail="Oportunidades em andamento" trend="LIVE" tone="blue" />
        <AtlasMetric label="Pipeline bruto" value={loading ? "—" : brl.format(metrics.pipeline)} detail="Potencial comercial total" trend="VGV" tone="violet" />
        <AtlasMetric label="Forecast" value={loading ? "—" : brl.format(metrics.forecast)} detail="Ponderado por etapa" trend="AI" tone="green" />
        <AtlasMetric label="Leads quentes" value={loading ? "—" : metrics.hot} detail="Prioridade imediata" trend="HOT" tone="rose" />
        <AtlasMetric label="Risco alto" value={loading ? "—" : metrics.highRisk} detail={`${metrics.firstContactOverdue} SLA inicial vencido(s)`} trend="RISK" tone="amber" />
        <AtlasMetric label="Perfis compradores" value={loading ? "—" : metrics.buyerProfiles} detail="Compraram em outro lugar" trend="LEARN" tone="green" />
      </section> : null}

      <section className="atlas-pipeline-priority-queue" aria-labelledby="atlas-pipeline-priority-title" aria-live="polite" data-priority-source="authorized-loaded-pipeline">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-sky-300">Movimentação prioritária</p><h3 id="atlas-pipeline-priority-title" className="mt-1 text-lg font-semibold text-white">Comece por aqui</h3><p className="mt-1 text-xs text-slate-500">As três ações com maior impacto operacional aparente no recorte atual; filtros e ordenação também organizam esta fila.</p></div>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar oportunidades do pipeline">
            {focusOptions.map((option) => <button key={option.key} type="button" onClick={() => setFocus(option.key)} aria-pressed={focus === option.key} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${focus === option.key ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:text-white"}`}><span>{option.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[9px] ${focus === option.key ? "bg-sky-300/15 text-sky-100" : "bg-white/[0.05] text-slate-500"}`}>{option.count}</span></button>)}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {dailyFocus.map((lead, index) => {
            const guidance = brokerGuidance(lead);
            const contact = phoneLinks(lead.phone);
            const risk = leadRisk(lead);
            const currentStageIndex = stages.findIndex((stage) => stage.key === (lead.status || "novo"));
            const currentStage = stages[currentStageIndex];
            const nextStage = currentStageIndex >= 0 ? stages[currentStageIndex + 1] : undefined;
            return <article key={lead.id} className="atlas-broker-action">
              <div className="flex items-start justify-between gap-3"><span className="atlas-broker-rank">{String(index + 1).padStart(2, "0")}</span><AtlasBadge tone={riskTone(risk)}>Risco {risk}</AtlasBadge></div>
              <Link href={`/leads/${lead.id}`} className="mt-3 block truncate text-sm font-semibold text-white hover:text-sky-300">{lead.name || "Lead sem nome"}</Link>
              <div className="atlas-broker-stage"><span>{currentStage?.label || "Etapa atual"}</span><i aria-hidden="true">→</i><strong>{nextStage?.label || "Revisar fechamento"}</strong></div>
              <p className="mt-3 text-sm font-semibold text-sky-200">{guidance.action}</p><p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{guidance.reason}</p>
              <label className="atlas-broker-move-label" htmlFor={`priority-stage-${lead.id}`}>Movimentar após validar</label>
              <select id={`priority-stage-${lead.id}`} value={lead.status ?? "novo"} disabled={savingId === lead.id} onChange={(event) => void moveLead(lead.id, event.target.value as StageKey)} className="atlas-broker-move-select">
                {destinationOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              <div className="mt-3 grid grid-cols-3 gap-2"><Link href={`/leads/${lead.id}`} className="atlas-broker-shortcut">Abrir Lead 360</Link><Link href={`/leads/${lead.id}/messages`} className="atlas-broker-shortcut">Preparar com IA</Link>{contact ? <a href={contact.call} className="atlas-broker-shortcut">Ligar</a> : <span className="atlas-broker-shortcut is-disabled">Sem telefone</span>}</div>
            </article>;
          })}
          {!loading && dailyFocus.length === 0 ? <div className="lg:col-span-3"><AtlasEmpty reason="completed" eyebrow="Fila prioritária concluída" title="Tudo em dia" description="Nenhuma oportunidade aberta exige ação neste momento." action={<Link href="/tasks" className="atlas-button-secondary">Revisar tarefas</Link>} /></div> : null}
        </div>
      </section>

      {!focusMode ? <section className="atlas-pipeline-flow" aria-label="Resumo visual das etapas do pipeline">
        {stageData.map((stage, index) => (
          <div key={stage.key} style={{ "--flow": `${stage.probability}%` } as CSSProperties}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p><strong>{stage.label}</strong><small>{stage.items.length} leads · {brl.format(stage.value)}</small></p>
            <i><b /></i>
          </div>
        ))}
      </section> : null}

      <AtlasCard>
        <AtlasCardHeader eyebrow="Fluxo comercial" title="Oportunidades por etapa" description="Arraste os cards ou use o seletor. Toda movimentação permanece registrada." action={<div className="flex gap-2"><AtlasBadge tone="info">{visibleLeads.length} VISÍVEIS</AtlasBadge><AtlasBadge tone="violet">{brl.format(metrics.forecast)} FORECAST</AtlasBadge></div>} />
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
        <div className="atlas-kanban-mobile-nav" role="tablist" aria-label="Escolher etapa no celular">{boardStages.map((stage) => <button key={stage.key} type="button" role="tab" aria-selected={activeMobileStage === stage.key} onClick={() => setMobileStage(stage.key)} className={activeMobileStage === stage.key ? "is-active" : ""}><span>{stage.label}</span><b>{stage.items.length}</b></button>)}</div>
        <div className="atlas-kanban-scroll p-4 sm:p-6" tabIndex={0} aria-label="Quadro Kanban com rolagem horizontal" aria-busy={loading}>
          <div className={`atlas-kanban-board ${compact ? "is-compact" : ""}`} style={{ "--kanban-columns": boardStages.length } as CSSProperties} aria-busy={loading || Boolean(savingId)}>
            {boardStages.map((stage) => (
              <section key={stage.key} role="tabpanel" aria-label={`${stage.label}: ${stage.items.length} leads`} onDragEnter={() => setDragOverStage(stage.key)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverStage(null); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, stage.key)} className={`atlas-pipeline-column ${dragOverStage === stage.key ? "is-drop-target" : ""} ${activeMobileStage !== stage.key ? "is-mobile-hidden" : ""}`}>
                <div className="atlas-pipeline-column-header mb-4 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">{stage.label}</h3><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-300">{stage.items.length}</span></div>
                  <p className="mt-2 text-xs text-slate-500">{brl.format(stage.value)}</p>
                  <div className="mt-3"><AtlasProgress value={stage.probability} /></div>
                </div>

                {loading ? <div className="space-y-3">{[1,2,3].map((item) => <AtlasSkeleton key={item} className="h-36 w-full" />)}</div> : stage.items.length === 0 ? <AtlasEmpty reason="no-activity" eyebrow="Etapa disponível" title="Etapa vazia" description="Arraste uma oportunidade para esta etapa quando ela avançar no atendimento." /> : <div className="space-y-3">
                  {stage.items.map((lead) => {
                    const risk = leadRisk(lead);
                    const contactSla = firstContactSla(lead);
                    const guidance = brokerGuidance(lead);
                    const contact = phoneLinks(lead.phone);
                    return (
                      <article key={lead.id} draggable={!savingId} tabIndex={0} aria-disabled={Boolean(savingId)} aria-label={`${lead.name || "Lead sem nome"}, etapa ${stage.label}. Alt mais seta move entre etapas.`} onKeyDown={(event) => { if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); moveByKeyboard(lead, -1); } if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); moveByKeyboard(lead, 1); } }} onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }} onDragStart={(event) => { if (savingId) { event.preventDefault(); return; } setDraggedId(lead.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/lead-id", lead.id); }} className={`atlas-pipeline-lead group ${savingId === lead.id ? "opacity-60" : ""} ${draggedId === lead.id ? "is-dragging" : ""}`} data-risk={risk}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="atlas-lead-avatar" aria-hidden="true">{(lead.name || "??").slice(0, 2).toUpperCase()}</span>
                            <div className="min-w-0"><Link href={`/leads/${lead.id}`} className="block truncate text-sm font-semibold text-white transition hover:text-sky-300">{lead.temperature === "quente" ? "🔥 " : ""}{lead.name || "Lead sem nome"}</Link><p className="mt-0.5 truncate text-[11px] text-slate-500">{lead.phone || lead.email || "Sem contato"}</p></div>
                          </div>
                          {risk !== "baixo" ? <AtlasBadge tone={riskTone(risk)}>{risk === "alto" ? "⚠️" : "•"} {risk}</AtlasBadge> : null}
                        </div>
                        <div className="atlas-lead-origin"><span>{lead.project || lead.source || "Projeto não informado"}</span>{metaCampaign(lead) ? <small>{metaCampaign(lead)}</small> : null}</div>
                        <div className="atlas-kanban-signal-row">
                          <span className={`atlas-temperature is-${String(lead.temperature || "frio").toLowerCase()}`}>{lead.temperature || "frio"}</span>
                          <span>Score <strong>{lead.score ?? 0}</strong></span>
                          <span>{lead.budget_max ? brl.format(lead.budget_max) : "Sem valor"}</span>
                        </div>
                        {contactSla ? <div className="mt-3"><AtlasBadge tone={contactSla.tone}>{contactSla.label}</AtlasBadge></div> : null}
                        <div className="atlas-card-guidance"><span>Próxima melhor ação</span><strong>{guidance.action}</strong></div>
                        <div className="atlas-kanban-primary-actions" role="group" aria-label="Ações rápidas">
                          <Link href={`/leads/${lead.id}`} title="Abrir Lead 360" aria-label="Abrir Lead 360">👁️</Link>
                          {contact ? <a href={contact.call} title="Ligar" aria-label="Ligar para a lead">📞</a> : null}
                          {contact ? <a href={contact.whatsapp} target="_blank" rel="noreferrer" title="WhatsApp" aria-label="Abrir WhatsApp">💬</a> : null}
                          <Link href={`/leads/${lead.id}/messages`} title="Abordagem com IA" aria-label="Preparar abordagem com IA">✦</Link>
                        </div>
                        <details className="atlas-kanban-card-details">
                          <summary>Ver contexto</summary>
                          <div className="atlas-lead-details">
                            <p><span>Origem</span><strong>{lead.source || "Não informada"}</strong></p>
                            <p><span>Interesse</span><strong>{lead.purpose || "A definir"}{lead.bedrooms ? ` · ${lead.bedrooms} dorm.` : ""}</strong></p>
                            <p><span>Região</span><strong>{lead.preferred_regions?.join(", ") || "Não informada"}</strong></p>
                            <p><span>Último contato</span><strong>{relativeTime(lead.last_interaction_at)}</strong></p>
                            <p><span>Próxima ação</span><strong>{dateLabel(lead.next_action_at)}</strong></p>
                          </div>
                          <p className="atlas-kanban-guidance-reason">{guidance.reason}</p>
                          <div className="atlas-card-shortcuts"><Link href={`/leads/${lead.id}/messages`} title="Criar abordagem com IA">✦ Mensagem</Link>{contact ? <><a href={contact.call} title="Ligar para a lead">Ligar</a><a href={contact.whatsapp} target="_blank" rel="noreferrer" title="Abrir WhatsApp">WhatsApp</a></> : null}</div>
                        </details>
                        <div className="atlas-kanban-move-row">
                          <button type="button" onClick={() => moveByKeyboard(lead, -1)} disabled={savingId === lead.id || stages.findIndex((item) => item.key === (lead.status || "novo")) <= 0} aria-label="Mover para a etapa anterior">←</button>
                          <select aria-label={`Mover ${lead.name || "lead"} para outra etapa`} value={lead.status ?? "novo"} disabled={savingId === lead.id} onChange={(event) => void moveLead(lead.id, event.target.value as StageKey)}>
                          {destinationOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                          </select>
                          <button type="button" onClick={() => moveByKeyboard(lead, 1)} disabled={savingId === lead.id || stages.findIndex((item) => item.key === (lead.status || "novo")) >= stages.length - 1} aria-label="Mover para a próxima etapa">→</button>
                        </div>
                      </article>
                    );
                  })}
                </div>}
              </section>
            ))}
          </div>
        </div>
        <div className="border-t border-white/[.06] px-5 py-3 text-[10px] text-slate-500 sm:px-6">Arraste, use o seletor ou pressione <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-slate-300">Alt + ←/→</kbd> com o card em foco. A movimentação continua registrada na timeline.</div>
      </AtlasCard>
      {!focusMode ? <AtlasCard>
        <AtlasCardHeader eyebrow="Inteligência de compradores" title="Compraram em outro lugar" description="Base separada do funil ativo: compradores reais que ajudam a entender público, produto, preço e concorrência sem contar como venda da empresa." />
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">{leads.filter((lead) => lead.status === "comprou_outro").length ? leads.filter((lead) => lead.status === "comprou_outro").map((lead) => <article key={lead.id} className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[.035] p-4"><div className="flex items-start justify-between gap-3"><div><Link href={`/leads/${lead.id}`} className="font-semibold text-white hover:text-emerald-300">{lead.name || "Cliente comprador"}</Link><p className="mt-1 text-xs text-slate-500">{lead.phone || lead.email || "Contato protegido"}</p></div><AtlasBadge tone="success">COMPRADOR</AtlasBadge></div><p className="mt-3 text-xs leading-5 text-slate-400">Perfil preservado para inteligência comercial e futuras estratégias de público.</p><select value={lead.status ?? "comprou_outro"} disabled={savingId === lead.id} onChange={(event) => void moveLead(lead.id, event.target.value as StageKey)} className="mt-4 w-full rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-xs text-slate-300">{destinationOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></article>) : <div className="sm:col-span-2 xl:col-span-3"><AtlasEmpty reason="no-activity" eyebrow="Aprendizado comprador" title="Nenhum perfil comprador separado" description="Ao registrar uma compra em outro lugar, o cliente aparecerá aqui com seu aprendizado preservado." action={<Link href="/external-sales" className="atlas-button-secondary">Registrar compra externa</Link>} /></div>}</div>
      </AtlasCard> : null}
    </div>
  );
}
