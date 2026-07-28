"use client";

import Link from "next/link";
import Image from "next/image";
import { DragEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { DEFAULT_PIPELINE_STAGES, type PipelineStageDefinition, type PipelineStageKey } from "@/lib/atlas/pipeline-stages";
import { DISCARD_REASONS } from "@/lib/atlas/discard-reasons";
import { conhecimentoDaEtapa, extrairRecusa } from "@/lib/crm/pipeline-guidance";

/**
 * ── AS ETAPAS DE FECHAMENTO VOLTAM A SER COLUNA ─────────────────────────────
 *
 * `perdido` e `comprou_outro` nascem com `visible: false` e eram removidas
 * aqui. Consequência medida: o corretor tinha 12 leads descartadas e NENHUMA
 * coluna onde elas aparecessem — o quadro mostrava 7 etapas de 9, e as leads
 * simplesmente sumiam ao serem descartadas.
 *
 * Elas ficam FORA por padrão (quadro de trabalho é sobre o que está em jogo),
 * mas passam a existir na lista para quem quiser marcá-las em "Escolher
 * colunas". É lá que se confere o que saiu do funil e se desfaz um descarte
 * errado — e sem a coluna, o desfazer não tinha de onde partir.
 */
const defaultStages = DEFAULT_PIPELINE_STAGES;
/** Fora do quadro por padrão; entram por escolha explícita da pessoa. */
const FECHAMENTO = new Set<StageKey>(["perdido", "comprou_outro"]);
type StageKey = PipelineStageKey;
type FocusKey = "prioridade" | "sla" | "atrasadas" | "sem_acao" | "quentes" | "todas";
type SortKey = "prioridade" | "score" | "valor" | "recente";
type PipelinePreferences = {
  focus?: FocusKey;
  sort?: SortKey;
  compact?: boolean;
  focusMode?: boolean;
  hideEmpty?: boolean;
  /**
   * Etapas que ESTA pessoa escolheu ver. Ausente = decide pelo `hideEmpty`.
   *
   * Escolha explícita vence "esconder vazias": quem marcou "Descartados" quer
   * a coluna mesmo no dia em que ela está zerada — é lá que se confere o que
   * foi descartado e se desfaz um descarte errado.
   */
  etapasVisiveis?: StageKey[];
  mobileStage?: StageKey;
};
type PipelineScope = {
  loaded: number;
  totalOperational: number;
  archivedMemoryExcluded: boolean;
  limit: number;
};
type DiscardDraft = {
  leadId: string;
  leadName: string;
  fromStage: StageKey;
  reasonKey: string;
  notes: string;
};
/**
 * "Comprou em outro lugar" também exige texto — e antes pedia por
 * `window.prompt`, uma caixa nativa ao lado de um painel desenhado.
 *
 * Três problemas concretos: o navegador pode bloquear a caixa (e aí a etapa
 * simplesmente não acontece, sem explicação); escrever menos de 10 caracteres
 * fechava a caixa, jogava o texto fora e mostrava o erro no topo da página; e
 * ninguém consegue consultar o CRM enquanto a caixa nativa está aberta.
 */
type FollowUpDraft = {
  leadId: string;
  leadName: string;
  fromStage: StageKey;
  description: string;
};
type DiscardReportSummary = {
  period: { start: string; end: string; days: number };
  totals: { lostMoves: number | null; discarded: number; uniqueLeads: number; classified: number; coveragePct: number | null };
  byReason: Array<{ key: string; label: string; metaCategory: string; count: number; share: number }>;
};
type DiscardReportStatus = "loading" | "ready" | "restricted" | "error";
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
/**
 * v2 porque o SIGNIFICADO do padrão mudou, não só o valor: na v1 o quadro
 * nascia escondendo etapas (vazias + fechamento) e a preferência gravada
 * perpetuava isso em qualquer aba já aberta — o novo padrão nunca chegaria a
 * quem mais sofreu o problema. Trocar a chave descarta a preferência antiga
 * UMA vez e todo mundo volta a nascer com o funil completo; escolhas feitas
 * daqui em diante são gravadas na v2 e respeitadas normalmente.
 */
const PIPELINE_PREFERENCES_KEY = "atlas:pipeline-preferences:v2";

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

type ProactiveSignal = {
  days: number;
  basis: "atividade" | "criacao";
  level: "amber" | "rose";
  hot: boolean;
};

// Sinal proativo 100% determinístico, derivado apenas dos campos já carregados
// (updated_at/last_interaction_at/created_at/score/temperature). Nenhum dado é
// inventado: sem timestamp válido, não há sinal. Como leadRisk/firstContactSla,
// lê o relógio internamente; a granularidade em dias torna o desvio irrelevante.
function proactiveSignal(lead: Lead): ProactiveSignal | null {
  if (!isOpenLead(lead)) return null;
  const activityTimes = [lead.updated_at, lead.last_interaction_at]
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time));
  const hasActivity = activityTimes.length > 0;
  const reference = hasActivity ? Math.max(...activityTimes) : lead.created_at ? new Date(lead.created_at).getTime() : Number.NaN;
  if (!Number.isFinite(reference)) return null;
  const days = Math.floor(Math.max(0, Date.now() - reference) / 86_400_000);
  if (days < 3) return null;
  return {
    days,
    basis: hasActivity ? "atividade" : "criacao",
    level: days >= 7 ? "rose" : "amber",
    hot: lead.temperature === "quente" || Number(lead.score ?? 0) >= 70,
  };
}

function proactiveSignalView(signal: ProactiveSignal, lead: Lead) {
  const fromCreation = signal.basis === "criacao";
  const baseTitle = fromCreation
    ? `Sem atualização registrada desde a criação, há ${signal.days} dia(s) — contagem baseada na data de criação, único registro disponível.`
    : `Sem atualização registrada há ${signal.days} dia(s) — base: atualização ou interação mais recente.`;
  return {
    critical: signal.hot || signal.level === "rose",
    label: signal.hot
      ? `quente sem toque · ${signal.days}d${fromCreation ? " desde a criação" : ""}`
      : fromCreation
        ? `${signal.days}d desde a criação`
        : `parado há ${signal.days}d`,
    title: signal.hot ? `Lead quente (score ${lead.score ?? 0}). ${baseTitle} Priorize o contato.` : baseTitle,
  };
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStageDefinition[]>(defaultStages);
  const [canConfigureStages, setCanConfigureStages] = useState(false);
  const [pipelineScope, setPipelineScope] = useState<PipelineScope>({ loaded: 0, totalOperational: 0, archivedMemoryExcluded: true, limit: 500 });
  const [mobileStage, setMobileStage] = useState<StageKey>(defaultStages[0]?.key || "novo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /**
   * O CAMINHO DE VOLTA da última recusa.
   *
   * A rota manda `caminho` junto do erro. Sem mostrá-lo, o corretor lê o que
   * deu errado e não o que fazer — e metade das recusas ("esta lead é de outra
   * pessoa") não muda por mais que ele atualize a tela.
   */
  const [caminho, setCaminho] = useState<{ texto: string; acao: string | null } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<FocusKey>("prioridade");
  const [sort, setSort] = useState<SortKey>("prioridade");
  const [compact, setCompact] = useState(true);
  const [focusMode, setFocusMode] = useState(true);
  /**
   * ESCONDER ETAPAS VAZIAS — ligado por padrão.
   *
   * Medido no banco vivo em 2026-07-27: 197 das 199 leads estão em "novo" e 2 em
   * "perdido". SETE das nove colunas estão vazias. Com o padrão anterior
   * (mostrar todas), a primeira tela que o corretor abre é uma coluna cheia e
   * sete faixas vazias dividindo a largura — cada uma tirando espaço da única
   * que tem trabalho dentro.
   *
   * Etapa vazia não informa nada que o corretor não saiba: ele sabe que ainda
   * não marcou visita nenhuma. O que ele precisa é de espaço para as leads que
   * existem.
   *
   * O botão continua ali, e a escolha dele é gravada nas preferências — quem
   * quiser ver o funil inteiro clica uma vez e não é perguntado de novo. À
   * medida que as etapas se preenchem, elas aparecem sozinhas.
   */
  // ── O QUADRO NASCE INTEIRO ────────────────────────────────────────────────
  //
  // Nascia `true`, escondendo toda etapa sem card. Somado ao corte de
  // FECHAMENTO abaixo, o corretor via 3 ou 4 de 9 colunas e relatou "não
  // visualizo todas as etapas".
  //
  // O erro de projeto: tratei coluna vazia como ruído. Ela é o oposto — o funil
  // é o MAPA do trabalho, e a etapa vazia é exatamente para onde a lead deveria
  // ir em seguida. Esconder o destino é esconder o próximo passo.
  //
  // Continua sendo um botão: quem quiser compactar, compacta. Só não é mais a
  // decisão tomada por quem nunca viu a carteira daquela pessoa.
  const [hideEmpty, setHideEmpty] = useState(false);
  /**
   * `null` = ninguém escolheu ainda; vale a regra automática de esconder vazias.
   * Um conjunto = escolha explícita da pessoa, e ela manda.
   */
  const [etapasVisiveis, setEtapasVisiveis] = useState<StageKey[] | null>(null);
  const [escolhendoEtapas, setEscolhendoEtapas] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);
  const [lastMove, setLastMove] = useState<{ moveId: string; leadId: string; leadName: string; from: StageKey; to: StageKey } | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [discardDraft, setDiscardDraft] = useState<DiscardDraft | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState<FollowUpDraft | null>(null);
  const [discardReport, setDiscardReport] = useState<DiscardReportSummary | null>(null);
  const [discardReportStatus, setDiscardReportStatus] = useState<DiscardReportStatus>("loading");
  const discardPanelRef = useRef<HTMLDivElement | null>(null);
  const discardOpenLeadId = discardDraft?.leadId ?? null;

  useEffect(() => {
    if (discardOpenLeadId) discardPanelRef.current?.focus();
  }, [discardOpenLeadId]);

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
        if (Array.isArray(preferences.etapasVisiveis)) setEtapasVisiveis(preferences.etapasVisiveis);
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
      JSON.stringify({ focus, sort, compact, focusMode, hideEmpty, etapasVisiveis, mobileStage }),
    );
  }, [compact, focus, focusMode, hideEmpty, etapasVisiveis, mobileStage, preferencesHydrated, sort]);

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
      if (Array.isArray(payload.stages)) setStages(payload.stages as PipelineStageDefinition[]);
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

  async function loadDiscardReport() {
    try {
      const response = await authenticatedFetch("/api/v1/analytics/discard-report?days=30");
      if (response.status === 401 || response.status === 403) { setDiscardReportStatus("restricted"); return; }
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) throw new Error("discard-report-unavailable");
      setDiscardReport(payload.data as DiscardReportSummary);
      setDiscardReportStatus("ready");
    } catch {
      setDiscardReportStatus("error");
    }
  }

  useEffect(() => { void loadDiscardReport(); }, []);

  async function moveLead(id: string, stage: StageKey, reversalOf?: string, discard?: { key: string; notes: string }, followUp?: string) {
    if (savingId) {
      setError("Aguarde a movimentação atual ser confirmada antes de mover outra lead.");
      return;
    }
    const currentLead = leads.find((lead) => lead.id === id);
    const previousStage = (currentLead?.status || "novo") as StageKey;
    if (previousStage === stage) { setDraggedId(null); setDragOverStage(null); return; }
    if (stage === "perdido" && !reversalOf && !discard) {
      // A movimentação para o estágio de perda só acontece após o motivo ser
      // confirmado no painel — cancelar deixa a lead exatamente onde estava.
      setError("");
      setDraggedId(null);
      setDragOverStage(null);
      setDiscardDraft({ leadId: id, leadName: currentLead?.name || "Lead sem nome", fromStage: previousStage, reasonKey: "", notes: "" });
      return;
    }
    // Mesmo caminho do descarte: o painel pergunta, a lead só sai da coluna
    // depois de confirmado. Cancelar não move nada.
    if (stage === "comprou_outro" && !reversalOf && !followUp) {
      setError("");
      setDraggedId(null);
      setDragOverStage(null);
      setFollowUpDraft({ leadId: id, leadName: currentLead?.name || "Lead sem nome", fromStage: previousStage, description: "" });
      return;
    }
    const followUpDescription = followUp?.trim() || "";
    const previous = leads;
    setSavingId(id);
    setError("");
    setCaminho(null);
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, status: stage, updated_at: new Date().toISOString() } : lead)));
    try {
      const response = await authenticatedFetch("/api/v1/pipeline", { method: "PATCH", body: JSON.stringify({ leadId: id, stage, expectedFromStage: previousStage, followUpDescription, reversalOf: reversalOf || null, discardReason: discard ? { key: discard.key, notes: discard.notes } : null }) });
      // `.json()` estoura se a resposta não for JSON (um 502 do proxy, por
      // exemplo). Nesse caso o corpo não existe e a frase padrão assume.
      const payload = await response.json().catch(() => ({} as Record<string, never>));
      if (!response.ok) {
        // A rota explica exatamente o que faltou: motivo de descarte fora da
        // taxonomia, lead já movida por outra pessoa, confirmação humana
        // pendente. Trocar tudo isso por uma frase única obrigava o corretor a
        // adivinhar — e adivinhar errado é abandonar a lead.
        //
        // A leitura vive em `extrairRecusa` (lib) e não aqui: dentro da página,
        // o único teste possível era `grep` pelo texto — e um mutation test
        // provou que desligar a leitura deixava a suíte verde do mesmo jeito.
        const recusa = extrairRecusa(payload);
        if (recusa.caminho) setCaminho({ texto: recusa.caminho, acao: recusa.acao });
        throw new Error(recusa.erro);
      }
      // A rota devolve `move: { id, fromStage, toStage, reversalOf }` — nunca
      // `moveId`. Lendo a chave errada, `setLastMove` nunca disparava e o aviso
      // "Desfazer movimentação" jamais aparecia: a lead mudava de coluna e a tela
      // não confirmava nada. Aceita as duas para não depender de qual caminho da
      // rota respondeu (atômico ou compensatório).
      const moveIdRecebido = payload.move?.id ?? payload.move?.moveId ?? payload.moveId;
      if (!reversalOf && moveIdRecebido) setLastMove({ moveId: moveIdRecebido, leadId: id, leadName: currentLead?.name || "Lead", from: previousStage, to: stage });
      if (discard) void loadDiscardReport();
    } catch (moveError) {
      setLeads(previous);
      setError(moveError instanceof Error ? moveError.message : "Falha ao mover lead.");
    } finally {
      setSavingId(null);
      setDraggedId(null);
      setDragOverStage(null);
    }
  }

  function confirmDiscard() {
    if (!discardDraft || !discardDraft.reasonKey || savingId) return;
    const draft = discardDraft;
    setDiscardDraft(null);
    void moveLead(draft.leadId, "perdido", undefined, { key: draft.reasonKey, notes: draft.notes.trim() });
  }

  function confirmFollowUp() {
    // O mesmo mínimo de 10 caracteres que a rota exige — validado aqui para o
    // botão explicar antes, em vez de a lead voltar de coluna depois.
    if (!followUpDraft || followUpDraft.description.trim().length < 10 || savingId) return;
    const draft = followUpDraft;
    setFollowUpDraft(null);
    void moveLead(draft.leadId, "comprou_outro", undefined, undefined, draft.description.trim());
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

  /**
   * Leads que passam só pela BUSCA, sem o filtro de foco.
   *
   * O foco ("atrasadas", "quentes", "sem ação") é sobre priorizar trabalho em
   * ABERTO — e por isso descarta lead fechada. Aplicá-lo às colunas de
   * fechamento esvaziava justamente a coluna que a pessoa marcou para ver:
   * "Perdido 0" com 12 descartadas no banco. Coluna escolhida à mão não pode
   * ser esvaziada por um filtro que fala de outra coisa.
   */
  const leadsBuscadas = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? leads.filter((lead) => [lead.name, lead.email, lead.phone, lead.temperature, lead.source, lead.purpose, metaCampaign(lead), ...(lead.preferred_regions ?? [])].some((value) => value?.toLowerCase().includes(normalized)))
      : leads;
  }, [leads, query]);

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

  /**
   * Cobertura mínima de orçamento para publicar valor de pipeline.
   *
   * Na base real, 18 de 217 leads (8%) têm `budget_max`. "Pipeline bruto:
   * R$ 12 mi" somava esses 8% e era lido como a base inteira — número que
   * PARECE medido e não é. É o mesmo defeito que o CPL do marketing tinha, ao
   * contrário: lá zero fingia de medido; aqui uma amostra finge de total.
   *
   * Abaixo deste piso o valor não é publicado: aparece o que falta preencher,
   * que é acionável. Acima dele o valor sai com a cobertura declarada ao lado,
   * porque somar 60% da base e chamar de "pipeline" continua sendo meia
   * verdade se ninguém disser que são 60%.
   */
  const COBERTURA_MINIMA_DE_ORCAMENTO = 0.4;

  const metrics = useMemo(() => {
    const open = leads.filter((lead) => !["ganho", "perdido", "comprou_outro"].includes(lead.status ?? "novo"));
    const comOrcamento = open.filter((lead) => Number(lead.budget_max ?? 0) > 0);
    const cobertura = open.length ? comOrcamento.length / open.length : 0;
    const orcamentoConfiavel = cobertura >= COBERTURA_MINIMA_DE_ORCAMENTO;

    // `null` quando a cobertura não sustenta o número. Null vira "—" na tela e
    // a explicação vem junto; zero viraria "R$ 0" e ninguém pergunta nada.
    const pipeline = orcamentoConfiavel
      ? comOrcamento.reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0)
      : null;
    const forecast = orcamentoConfiavel
      ? comOrcamento.reduce((sum, lead) => {
          const stage = stages.find((item) => item.key === (lead.status ?? "novo"));
          return sum + Number(lead.budget_max ?? 0) * ((stage?.probability ?? 5) / 100);
        }, 0)
      : null;

    const hot = open.filter((lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70).length;
    const highRisk = open.filter((lead) => leadRisk(lead) === "alto").length;
    const won = leads.filter((lead) => lead.status === "ganho").reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0);
    const buyerProfiles = leads.filter((lead) => lead.status === "comprou_outro").length;
    const firstContactOverdue = open.filter((lead) => firstContactSla(lead)?.overdue).length;
    const overdueActions = open.filter(isNextActionOverdue).length;
    const noNextAction = open.filter((lead) => !lead.next_action_at).length;
    const stalled = open.filter((lead) => Boolean(proactiveSignal(lead))).length;
    return {
      open: open.length, pipeline, forecast, hot, highRisk, won, buyerProfiles,
      firstContactOverdue, overdueActions, noNextAction, stalled,
      semOrcamento: open.length - comOrcamento.length,
      coberturaDeOrcamento: cobertura,
      orcamentoConfiavel,
    };
  }, [leads, stages]);

  /**
   * Quantos cards uma coluna desenha antes de parar e dizer quantos faltam.
   *
   * A etapa "novo" tem 205 dos 217 negócios desta base — 94% num quadro de oito
   * colunas. Desenhar os 205 não é completude: é 205 cards arrastáveis, com
   * badge, telefone e sinal, empilhados numa coluna que ninguém rola até o fim.
   * A décima quinta lead já não é encontrada; a centésima nem existe na prática.
   *
   * A ordenação já é por prioridade, então os primeiros são os que importam. O
   * resto vira uma linha honesta com o caminho para a fila completa, que é a
   * tela feita para trabalhar volume.
   */
  /**
   * ── 25 ERA POUCO DEMAIS ─────────────────────────────────────────────────
   *
   * O raciocínio acima continua válido: 178 cards arrastáveis numa coluna não
   * é completude, é uma pilha que ninguém rola. Mas 25 de 178 produziu o
   * relato "as leads não estão aparecendo todas" — e produziu com razão: some
   * 86% da base sem que a pessoa perceba que existe um corte.
   *
   * 100 é o meio termo medido contra esta base: cobre a coluna inteira em
   * qualquer etapa que não seja a de entrada, e em "novo" mostra o suficiente
   * para uma semana de trabalho antes de a linha de "restantes" aparecer.
   *
   * A linha de restantes continua e aponta para a fila completa — é lá que se
   * trabalha volume, não aqui.
   */
  const LIMITE_DE_CARDS_POR_COLUNA = 100;

  const stageData = useMemo(() => stages.map((stage) => {
    // Fechamento vem da lista sem foco: a coluna existe para conferir o que
    // saiu do funil e desfazer descarte errado, não para priorizar trabalho.
    const fonte = FECHAMENTO.has(stage.key) ? leadsBuscadas : visibleLeads;
    const items = fonte.filter((lead) => (lead.status ?? "novo") === stage.key);
    const comOrcamento = items.filter((lead) => Number(lead.budget_max ?? 0) > 0);
    return {
      ...stage,
      items,
      visiveis: items.slice(0, LIMITE_DE_CARDS_POR_COLUNA),
      ocultos: Math.max(0, items.length - LIMITE_DE_CARDS_POR_COLUNA),
      // `null` quando nenhuma lead da etapa tem orçamento. Antes saía
      // "R$ 0,00" no topo de toda coluna, que lia como "esta etapa não vale
      // nada" em vez de "ninguém preencheu o orçamento".
      value: comOrcamento.length
        ? comOrcamento.reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0)
        : null,
      semOrcamento: items.length - comOrcamento.length,
    };
  }), [leadsBuscadas, stages, visibleLeads]);
  /**
   * Quais colunas o quadro desenha.
   *
   * Escolha explícita da pessoa vence tudo. Sem escolha, cai na regra
   * automática de esconder vazias — que é boa na largada (197 de 199 leads em
   * "novo", 7 colunas vazias) e ruim depois, quando alguém quer acompanhar uma
   * etapa que ainda não encheu.
   *
   * A trava do fim impede o quadro vazio: desmarcar tudo devolveria uma tela
   * sem nada e sem explicação.
   */
  const boardStages = useMemo(() => {
    if (etapasVisiveis) {
      const escolhidas = stageData.filter((stage) => etapasVisiveis.includes(stage.key));
      return escolhidas.length ? escolhidas : stageData;
    }
    // Sem escolha manual, o padrão é o funil COMPLETO — inclusive as etapas de
    // fechamento, que antes eu cortava daqui. Some coluna só se a pessoa pedir.
    return hideEmpty ? stageData.filter((stage) => stage.items.length > 0) : stageData;
  }, [etapasVisiveis, hideEmpty, stageData]);
  const activeMobileStage = boardStages.some((stage) => stage.key === mobileStage) ? mobileStage : boardStages[0]?.key;
  const dailyFocus = useMemo(() => visibleLeads.filter(isOpenLead).slice(0, 3), [visibleLeads]);

  const proactiveSignals = useMemo(() => {
    const map = new Map<string, ProactiveSignal>();
    for (const lead of leads) {
      const signal = proactiveSignal(lead);
      if (signal) map.set(lead.id, signal);
    }
    return map;
  }, [leads]);

  const nextBestAction = useMemo(() => {
    const lead = visibleLeads.find(isOpenLead);
    if (!lead) return null;
    const currentStageIndex = stages.findIndex((stage) => stage.key === (lead.status || "novo"));
    const signal = proactiveSignals.get(lead.id);
    return {
      lead,
      guidance: brokerGuidance(lead),
      risk: leadRisk(lead),
      contact: phoneLinks(lead.phone),
      contactSla: firstContactSla(lead),
      currentStage: stages[currentStageIndex],
      nextStage: currentStageIndex >= 0 ? stages[currentStageIndex + 1] : undefined,
      signalView: signal ? proactiveSignalView(signal, lead) : null,
    };
  }, [proactiveSignals, stages, visibleLeads]);

  const columnSignals = useMemo(() => {
    const map = new Map<StageKey, { stalled: number; rose: number; hot: number }>();
    for (const stage of stageData) {
      const summary = { stalled: 0, rose: 0, hot: 0 };
      for (const lead of stage.items) {
        const signal = proactiveSignals.get(lead.id);
        if (!signal) continue;
        summary.stalled += 1;
        if (signal.level === "rose") summary.rose += 1;
        if (signal.hot) summary.hot += 1;
      }
      map.set(stage.key, summary);
    }
    return map;
  }, [proactiveSignals, stageData]);

  // Sugestão única e determinística: quente parado > parado 7d+ > parado 3d+,
  // sempre contando apenas cards visíveis no quadro (números conferíveis).
  const aiSuggestion = useMemo(() => {
    let hot: { label: string; count: number } | null = null;
    let rose: { label: string; count: number } | null = null;
    let stalled: { label: string; count: number } | null = null;
    for (const stage of stageData) {
      const summary = columnSignals.get(stage.key);
      if (!summary || summary.stalled === 0) continue;
      if (summary.hot > (hot?.count ?? 0)) hot = { label: stage.label, count: summary.hot };
      if (summary.rose > (rose?.count ?? 0)) rose = { label: stage.label, count: summary.rose };
      if (summary.stalled > (stalled?.count ?? 0)) stalled = { label: stage.label, count: summary.stalled };
    }
    if (hot) return `${hot.count} ${hot.count === 1 ? "lead quente parado" : "leads quentes parados"} em ${hot.label} — revisar primeiro`;
    if (rose) return `${rose.count} ${rose.count === 1 ? "lead parado" : "leads parados"} há 7d+ em ${rose.label} — retomar contato`;
    if (stalled) return `${stalled.count} ${stalled.count === 1 ? "lead parado" : "leads parados"} há 3d+ em ${stalled.label} — definir a próxima ação`;
    return null;
  }, [columnSignals, stageData]);

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

  const executionLanes = useMemo(() => [
    { key: "sla", label: "Responder agora", value: metrics.firstContactOverdue, detail: "SLA inicial vencido", action: "Ver SLAs", tone: "danger", focus: "sla" as FocusKey, sort: "prioridade" as SortKey },
    { key: "sem_acao", label: "Agendar próximo passo", value: metrics.noNextAction, detail: "Sem compromisso futuro", action: "Organizar agenda", tone: "warning", focus: "sem_acao" as FocusKey, sort: "prioridade" as SortKey },
    { key: "quentes", label: "Atacar quentes", value: metrics.hot, detail: "Score ≥ 70 ou temperatura quente", action: "Avançar hoje", tone: "success", focus: "quentes" as FocusKey, sort: "score" as SortKey },
    { key: "risco", label: "Reduzir risco", value: metrics.highRisk + metrics.stalled, detail: "Parados, atrasados ou críticos", action: "Revisar gargalos", tone: "info", focus: "prioridade" as FocusKey, sort: "prioridade" as SortKey },
  ], [metrics.firstContactOverdue, metrics.highRisk, metrics.hot, metrics.noNextAction, metrics.stalled]);

  const kanbanReadiness = useMemo(() => {
    const blocked = metrics.firstContactOverdue + metrics.overdueActions + metrics.noNextAction;
    if (metrics.firstContactOverdue > 0) {
      return {
        status: "critical",
        title: "Responder SLAs antes de mover o funil",
        detail: `${metrics.firstContactOverdue} lead(s) precisam do primeiro contato para não esfriar a intenção.`,
      };
    }
    if (blocked > 0) {
      return {
        status: "attention",
        title: "Organizar próximas ações",
        detail: `${blocked} pendência(s) de agenda ou follow-up estão bloqueando a fluidez do pipeline.`,
      };
    }
    if (metrics.hot > 0) {
      return {
        status: "opportunity",
        title: "Atacar oportunidades quentes",
        detail: `${metrics.hot} lead(s) têm temperatura ou score alto. Priorize avanço para visita, proposta ou fechamento.`,
      };
    }
    return {
      status: "clear",
      title: "Pipeline em modo limpo",
      detail: "Sem gargalo crítico no recorte atual. Continue registrando próxima ação em cada oportunidade.",
    };
  }, [metrics.firstContactOverdue, metrics.hot, metrics.noNextAction, metrics.overdueActions]);

  return (
    <div className="atlas-pipeline-page space-y-5 pb-8" data-phase="37-pipeline-movement-workspace" data-pipeline-layout="movement-first">
      <section className={`atlas-pipeline-hero atlas-grid-glow ${focusMode ? "is-focus-mode" : ""}`}>
        <Image className="atlas-pipeline-robot" src="/brand/atlas-robot-broker.png" alt="Robô-corretor Atlas acompanhando o pipeline comercial" width={210} height={315} priority />
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2"><AtlasBadge tone="info">{metrics.open} negócios</AtlasBadge></div>
            <h2 className="atlas-pipeline-title mt-3 text-3xl font-semibold tracking-[-.05em] text-white sm:text-5xl">Pipeline comercial</h2>
            <p className="atlas-pipeline-subtitle mt-2 max-w-2xl text-sm leading-6 text-slate-400">Decida o próximo movimento, proteja SLAs e mantenha cada avanço registrado.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar lead, região, origem ou campanha..." className="atlas-kanban-search min-w-72 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30" />
            <button type="button" onClick={() => setFocusMode((value) => !value)} aria-pressed={focusMode} className={`atlas-button-secondary ${focusMode ? "border-sky-400/20 !text-sky-200" : ""}`}>{focusMode ? "Expandir inteligência" : "✦ Ativar modo foco"}</button>
            {canConfigureStages ? <Link href="/pipeline/settings" className="atlas-button-secondary">Configurar etapas</Link> : null}
            <Link href="/leads/new" className="atlas-button-primary">+ Novo lead</Link>
          </div>
        </div>
      </section>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
      {/* O caminho de volta, logo abaixo do que deu errado. Erro sem saída faz
          o corretor repetir a mesma tentativa até desistir da lead. */}
      {caminho ? <div className="mt-2 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3 text-xs leading-5 text-sky-100" role="status">
        <span className="font-semibold uppercase tracking-[.12em] text-sky-300">O que fazer</span>
        <span className="min-w-0 flex-1">{caminho.texto}</span>
        {caminho.acao === "atualizar" ? <button type="button" onClick={() => { setCaminho(null); setError(""); void load(); }} className="atlas-button-secondary shrink-0">Atualizar Kanban</button> : null}
        {caminho.acao === "tentar-de-novo" ? <button type="button" onClick={() => { setCaminho(null); setError(""); }} className="atlas-button-secondary shrink-0">Entendi</button> : null}
        {caminho.acao === "falar-com-gestor" ? <Link href="/leads" className="atlas-button-secondary shrink-0">Ver minha carteira</Link> : null}
      </div> : null}
      {!loading && pipelineScope.totalOperational > pipelineScope.loaded ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100" role="status"><span>Este quadro mostra {pipelineScope.loaded} de {pipelineScope.totalOperational} oportunidades operacionais. A memória arquivada continua isolada.</span><Link href="/leads" className="font-semibold text-amber-50 underline decoration-amber-300/40 underline-offset-4">Pesquisar a base completa</Link></div> : null}
      {savingId ? <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100" role="status" aria-live="polite">Confirmando movimentação e registrando o histórico…</div> : null}
      {lastMove ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] px-4 py-3 text-sm text-sky-100" role="status"><span><strong>{lastMove.leadName}</strong> avançou para {destinationOptions.find((item) => item.key === lastMove.to)?.label}.</span><button type="button" onClick={() => void undoLastMove()} disabled={Boolean(savingId)} className="rounded-xl border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold hover:bg-sky-300/15 disabled:opacity-50">Desfazer movimentação</button></div> : null}

      <section className="atlas-kanban-readiness" data-status={kanbanReadiness.status} aria-label="Resumo de prontidão do Kanban">
        <div>
          <span>Kanban de execução</span>
          <strong>{kanbanReadiness.title}</strong>
          <p>{kanbanReadiness.detail}</p>
        </div>
        <dl aria-label="Sinais rápidos do pipeline">
          <div><dt>SLA</dt><dd>{loading ? "—" : metrics.firstContactOverdue}</dd></div>
          <div><dt>Sem ação</dt><dd>{loading ? "—" : metrics.noNextAction}</dd></div>
          <div><dt>Quentes</dt><dd>{loading ? "—" : metrics.hot}</dd></div>
          <div><dt>Visíveis</dt><dd>{loading ? "—" : visibleLeads.length}</dd></div>
        </dl>
      </section>

      {/* Cinco métricas, não seis: "Perfis compradores" (comprou_outro) vale
          zero e não muda decisão nenhuma — quem quiser vê a lista logo abaixo.
          Dinheiro só aparece quando a base sustenta o número. */}
      {!focusMode ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <AtlasMetric icon="📊" label="Negócios abertos" value={loading ? "—" : metrics.open} tone="blue" />
        <AtlasMetric
          icon="💰"
          label="Pipeline"
          value={loading ? "—" : metrics.pipeline === null ? "—" : brl.format(metrics.pipeline)}
          detail={loading ? "" : metrics.pipeline === null
            ? `${metrics.semOrcamento} negócio(s) sem orçamento — some com a base atual seria chute`
            : `sobre ${Math.round(metrics.coberturaDeOrcamento * 100)}% da carteira com orçamento`}
          tone="violet"
        />
        <AtlasMetric
          icon="📈"
          label="Forecast"
          value={loading ? "—" : metrics.forecast === null ? "—" : brl.format(metrics.forecast)}
          detail={metrics.forecast === null ? "depende do orçamento preenchido" : "ponderado por etapa"}
          tone="green"
        />
        <AtlasMetric icon="🔥" label="Leads quentes" value={loading ? "—" : metrics.hot} tone="rose" />
        <AtlasMetric icon="⚠️" label="Risco alto" value={loading ? "—" : metrics.highRisk} detail={`${metrics.firstContactOverdue} SLA inicial vencido(s)`} tone="amber" />
      </section> : null}

      <section className="atlas-pipeline-priority-queue" aria-labelledby="atlas-pipeline-priority-title" aria-live="polite" data-priority-source="authorized-loaded-pipeline">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-sky-300">Fila de execução</p><h3 id="atlas-pipeline-priority-title" className="mt-1 text-lg font-semibold text-white">Comece por aqui</h3><p className="mt-1 text-xs text-slate-500">Ordem prática por SLA, atraso, temperatura, risco e score — menos procura, mais ação.</p></div>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar oportunidades do pipeline">
            {focusOptions.map((option) => <button key={option.key} type="button" onClick={() => setFocus(option.key)} aria-pressed={focus === option.key} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${focus === option.key ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:text-white"}`}><span>{option.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[9px] ${focus === option.key ? "bg-sky-300/15 text-sky-100" : "bg-white/[0.05] text-slate-500"}`}>{option.count}</span></button>)}
          </div>
        </div>
        {nextBestAction ? <article className="atlas-kanban-next-best-action" data-kanban-next-best-action data-risk={nextBestAction.risk}>
          <div className="atlas-kanban-next-best-action-copy">
            <span className="atlas-kanban-next-best-action-eyebrow">Próxima melhor ação</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link href={`/leads/${nextBestAction.lead.id}`} className="min-w-0 text-xl font-semibold tracking-[-.04em] text-white hover:text-sky-200">{nextBestAction.lead.name || "Lead sem nome"}</Link>
              {nextBestAction.contactSla ? <AtlasBadge tone={nextBestAction.contactSla.tone}>{nextBestAction.contactSla.label}</AtlasBadge> : null}
              {nextBestAction.signalView ? <AtlasBadge tone={nextBestAction.signalView.critical ? "danger" : "warning"}>{nextBestAction.signalView.label}</AtlasBadge> : null}
            </div>
            <p className="mt-2 text-sm font-semibold text-sky-100">Decisão recomendada: {nextBestAction.guidance.action}</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{nextBestAction.guidance.reason}</p>
          </div>
          <dl className="atlas-kanban-next-best-action-metrics" aria-label="Resumo da oportunidade priorizada">
            <div><dt>Etapa</dt><dd>{nextBestAction.currentStage?.label || "Atual"}</dd></div>
            <div><dt>Score</dt><dd>{nextBestAction.lead.score ?? 0}</dd></div>
            <div><dt>Valor</dt><dd>{nextBestAction.lead.budget_max ? brl.format(nextBestAction.lead.budget_max) : "A definir"}</dd></div>
            <div><dt>Avanço</dt><dd>{nextBestAction.nextStage?.label || "Revisar"}</dd></div>
          </dl>
          <div className="atlas-kanban-next-best-action-buttons" role="group" aria-label="Executar próxima melhor ação">
            <Link href={`/leads/${nextBestAction.lead.id}`} className="is-primary">Abrir Lead 360</Link>
            {nextBestAction.contact ? <a href={nextBestAction.contact.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a> : null}
            {nextBestAction.contact ? <a href={nextBestAction.contact.call}>Ligar</a> : null}
            <Link href={`/leads/${nextBestAction.lead.id}/messages`}>Abordagem IA</Link>
          </div>
          <div className="atlas-kanban-next-best-action-move">
            <label htmlFor={`next-best-stage-${nextBestAction.lead.id}`}>Avançar após executar</label>
            <select id={`next-best-stage-${nextBestAction.lead.id}`} value={nextBestAction.lead.status ?? "novo"} disabled={savingId === nextBestAction.lead.id} onChange={(event) => void moveLead(nextBestAction.lead.id, event.target.value as StageKey)}>
              {destinationOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </div>
        </article> : !loading ? <div className="atlas-kanban-next-best-action is-empty" data-kanban-next-best-action><span className="atlas-kanban-next-best-action-eyebrow">Próxima melhor ação</span><p className="mt-2 text-sm font-semibold text-white">Nenhuma ação crítica no filtro atual.</p><p className="mt-1 text-xs text-slate-500">Troque o filtro ou registre novas próximas ações para manter a carteira aquecida.</p></div> : null}
        <div className="atlas-kanban-execution-cockpit" data-kanban-execution-cockpit>
          {executionLanes.map((lane) => <button key={lane.key} type="button" data-tone={lane.tone} data-state={lane.value > 0 ? "attention" : "clear"} onClick={() => { setFocus(lane.focus); setSort(lane.sort); }} aria-label={`${lane.label}: ${lane.value}. ${lane.detail}. ${lane.action}.`} className="atlas-kanban-execution-lane">
            <span>{lane.label}</span>
            <strong>{loading ? "—" : lane.value}</strong>
            <small>{lane.detail}</small>
            <em>{lane.value > 0 ? lane.action : "Em dia"}</em>
          </button>)}
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
              <div className="flex items-start justify-between gap-3"><span className="atlas-broker-rank">{String(index + 1).padStart(2, "0")}</span>{risk !== "baixo" ? <AtlasBadge tone={riskTone(risk)}>{risk === "alto" ? "⚠️" : "•"} {risk}</AtlasBadge> : null}</div>
              <div className="mt-3 flex items-center gap-2.5">
                <span className="atlas-lead-avatar" aria-hidden="true">{Array.from(lead.name || "??").slice(0, 2).join("").toUpperCase()}</span>
                <Link href={`/leads/${lead.id}`} className="min-w-0 truncate text-sm font-semibold text-white hover:text-sky-300">{lead.name || "Lead sem nome"}</Link>
              </div>
              <div className="atlas-broker-stage"><span>{currentStage?.label || "Etapa atual"}</span><i aria-hidden="true">→</i><strong>{nextStage?.label || "Revisar fechamento"}</strong></div>
              <p className="mt-3 text-sm font-semibold text-sky-200">{guidance.action}</p><p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{guidance.reason}</p>
              <label className="atlas-broker-move-label" htmlFor={`priority-stage-${lead.id}`}>Movimentar após validar</label>
              <select id={`priority-stage-${lead.id}`} value={lead.status ?? "novo"} disabled={savingId === lead.id} onChange={(event) => void moveLead(lead.id, event.target.value as StageKey)} className="atlas-broker-move-select">
                {destinationOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
              <div className="mt-3 grid grid-cols-3 gap-2"><Link href={`/leads/${lead.id}`} className="atlas-broker-shortcut">👁️ Lead 360</Link><Link href={`/leads/${lead.id}/messages`} className="atlas-broker-shortcut">✦ IA</Link>{contact ? <a href={contact.call} className="atlas-broker-shortcut">📞 Ligar</a> : <span className="atlas-broker-shortcut is-disabled">Sem telefone</span>}</div>
            </article>;
          })}
          {!loading && dailyFocus.length === 0 ? <div className="lg:col-span-3"><AtlasEmpty reason="completed" eyebrow="Fila prioritária concluída" title="Tudo em dia" description="Nenhuma oportunidade aberta exige ação neste momento." action={<Link href="/tasks" className="atlas-button-secondary">Revisar tarefas</Link>} /></div> : null}
        </div>
      </section>

      {!focusMode ? <section className="atlas-pipeline-flow" style={{ "--kanban-columns": stageData.length } as CSSProperties} aria-label="Resumo visual das etapas do pipeline">
        {stageData.map((stage, index) => (
          <div key={stage.key} style={{ "--flow": `${stage.probability}%` } as CSSProperties}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p><strong>{stage.label}</strong><small>{stage.items.length} leads{stage.value !== null ? ` · ${brl.format(stage.value)}` : ""}</small></p>
            <i><b /></i>
          </div>
        ))}
      </section> : null}

      <AtlasCard>
        <AtlasCardHeader eyebrow="Fluxo comercial" title="Oportunidades por etapa" description="Arraste os cards ou use o seletor. Toda movimentação permanece registrada." action={<span className="text-xs text-slate-500">{visibleLeads.length} visíveis{metrics.forecast !== null ? ` · forecast ${brl.format(metrics.forecast)}` : ""}</span>} />
        <div className="flex flex-col gap-3 border-t border-white/[0.06] px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between" aria-label="Controles do Kanban">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500" htmlFor="pipeline-sort">Ordenar</label>
            <select id="pipeline-sort" value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-400/30">
              <option value="prioridade">Prioridade inteligente</option><option value="score">Maior score</option><option value="valor">Maior valor</option><option value="recente">Atualização recente</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCompact((value) => !value)} aria-pressed={compact} className={`atlas-kanban-toggle ${compact ? "is-active" : ""}`}>{compact ? "Visão compacta" : "Visão confortável"}</button>
            <button type="button" onClick={() => setHideEmpty((value) => !value)} aria-pressed={hideEmpty} disabled={Boolean(etapasVisiveis)} title={etapasVisiveis ? "Você escolheu as colunas à mão — limpe a escolha para voltar ao automático." : undefined} className={`atlas-kanban-toggle ${hideEmpty && !etapasVisiveis ? "is-active" : ""} disabled:cursor-not-allowed disabled:opacity-40`}>{hideEmpty ? "Mostrando etapas ativas" : "Mostrar todas as etapas"}</button>
            {/* ── ESCOLHER AS COLUNAS ────────────────────────────────────────
                "Esconder vazias" é tudo ou nada. Quem acompanha descarte quer a
                coluna Descartados mesmo no dia em que ela está zerada — é lá que
                se confere o que saiu do funil e se desfaz um descarte errado.
                A escolha é de cada pessoa e fica gravada nas preferências. */}
            <button type="button" onClick={() => setEscolhendoEtapas((v) => !v)} aria-expanded={escolhendoEtapas} className={`atlas-kanban-toggle ${etapasVisiveis ? "is-active" : ""}`}>
              {etapasVisiveis ? `Colunas: ${etapasVisiveis.length} escolhidas` : "Escolher colunas"}
            </button>
          </div>
        </div>
        {/* A origem-IA passa a ser dita por 1px no acento (.cc23-seam) em vez de uma
            caixa inteira: o mesmo significado sem competir com o quadro abaixo. */}
        {aiSuggestion ? <div className="cc23-seam mx-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 sm:mx-6" data-signal-source="deterministic-loaded-leads"><span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--atlas-accent)]">IA sugere</span><span className="min-w-0 font-mono text-[11px] leading-5 tabular-nums text-[color:var(--atlas-text-secondary)]" title="Sugestão determinística calculada apenas com os leads já carregados neste quadro.">{aiSuggestion}</span></div> : null}
        {escolhendoEtapas ? <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-3 sm:px-6" role="group" aria-label="Escolher quais colunas aparecem">
          <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">Colunas do quadro</span>
          {stageData.map((stage) => {
            const marcada = etapasVisiveis ? etapasVisiveis.includes(stage.key) : boardStages.some((s2) => s2.key === stage.key);
            return <button key={stage.key} type="button" role="switch" aria-checked={marcada} onClick={() => setEtapasVisiveis((atual) => {
              const base = atual ?? boardStages.map((s2) => s2.key);
              return base.includes(stage.key) ? base.filter((k) => k !== stage.key) : [...base, stage.key];
            })} className={`rounded-full border px-3 py-1.5 text-xs transition ${marcada ? "border-sky-400/40 bg-sky-400/10 text-sky-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20"}`}>
              {stage.label} <span className="font-mono text-[10px] opacity-70">{stage.items.length}</span>
            </button>;
          })}
          {etapasVisiveis ? <button type="button" onClick={() => setEtapasVisiveis(null)} className="text-[11px] text-slate-400 underline decoration-slate-600 underline-offset-4 hover:text-slate-200">voltar ao automático</button> : null}
          <p className="w-full text-[11px] leading-4 text-slate-500">Desmarcar tudo devolveria um quadro vazio; por isso a última coluna não sai.</p>
        </div> : null}
        <div className="atlas-kanban-mobile-nav" role="tablist" aria-label="Escolher etapa no celular">{boardStages.map((stage) => <button key={stage.key} type="button" role="tab" aria-selected={activeMobileStage === stage.key} onClick={() => setMobileStage(stage.key)} className={activeMobileStage === stage.key ? "is-active" : ""}><span>{stage.label}</span><b>{stage.items.length}</b></button>)}</div>
        <div className="atlas-kanban-scroll p-4 sm:p-6" tabIndex={0} aria-label="Quadro Kanban com rolagem horizontal" aria-busy={loading}>
          <div className={`atlas-kanban-board ${compact ? "is-compact" : ""}`} style={{ "--kanban-columns": boardStages.length } as CSSProperties} aria-busy={loading || Boolean(savingId)}>
            {boardStages.map((stage) => {
              const colSignals = columnSignals.get(stage.key);
              return (
              <section key={stage.key} role="tabpanel" aria-label={`${stage.label}: ${stage.items.length} leads${colSignals && colSignals.stalled > 0 ? `, ${colSignals.stalled} sem atualização há 3 ou mais dias` : ""}`} onDragEnter={() => setDragOverStage(stage.key)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverStage(null); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, stage.key)} className={`atlas-pipeline-column ${dragOverStage === stage.key ? "is-drop-target" : ""} ${activeMobileStage !== stage.key ? "is-mobile-hidden" : ""}`}>
                <div className="atlas-pipeline-column-header mb-4 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white" title={conhecimentoDaEtapa(stage.key)?.significa || undefined}>{stage.label}</h3><div className="flex shrink-0 items-center gap-1.5">{colSignals && colSignals.stalled > 0 ? <span className={`cc6-chip ${colSignals.rose > 0 || colSignals.hot > 0 ? "cc6-crit" : "cc6-warn"}`} title={`${colSignals.stalled} de ${stage.items.length} lead(s) desta etapa sem atualização registrada há 3 ou mais dias.`}>{colSignals.stalled} {colSignals.stalled === 1 ? "parado" : "parados"}</span> : null}<span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] font-semibold tabular-nums text-slate-300">{stage.items.length}</span></div></div>
                  <p className="mt-2 text-xs text-slate-500">{stage.value === null
                    ? `${stage.items.length ? "orçamento não informado" : "—"}`
                    : `${brl.format(stage.value)}${stage.semOrcamento ? ` · ${stage.semOrcamento} sem orçamento` : ""}`}</p>
                  {/* PONTO DE CONHECIMENTO: o que fazer para a lead sair daqui.
                      O corretor herdou 195 leads numa tela que nunca usou — sem
                      isto, cada um decide sozinho o que "Qualificação" quer
                      dizer e o funil deixa de medir a mesma coisa entre pessoas.
                      Só na visão confortável: em 9 colunas compactas viraria
                      parede de texto, e parede de texto ninguém lê. */}
                  {!compact && conhecimentoDaEtapa(stage.key) ? (
                    <p className="mt-2 text-[11px] leading-4 text-slate-500">
                      <span className="text-slate-400">Para avançar:</span> {conhecimentoDaEtapa(stage.key)?.paraAvancar}
                    </p>
                  ) : null}
                  <div className="mt-3"><AtlasProgress value={stage.probability} /></div>
                </div>

                {loading ? <div className="space-y-3">{[1,2,3].map((item) => <AtlasSkeleton key={item} className="h-36 w-full" />)}</div> : stage.items.length === 0 ? <AtlasEmpty reason="no-activity" eyebrow="Etapa disponível" title="Etapa vazia" description="Arraste uma oportunidade para esta etapa quando ela avançar no atendimento." /> : <div className="space-y-3">
                  {stage.visiveis.map((lead) => {
                    const risk = leadRisk(lead);
                    const contactSla = firstContactSla(lead);
                    const guidance = brokerGuidance(lead);
                    const contact = phoneLinks(lead.phone);
                    const signal = proactiveSignals.get(lead.id);
                    const signalView = signal ? proactiveSignalView(signal, lead) : null;
                    return (
                      <article key={lead.id} draggable={!savingId} tabIndex={0} aria-busy={Boolean(savingId)} aria-label={`${lead.name || "Lead sem nome"}, etapa ${stage.label}. Alt mais seta move entre etapas.`} onKeyDown={(event) => { if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); moveByKeyboard(lead, -1); } if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); moveByKeyboard(lead, 1); } }} onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }} onDragStart={(event) => { if (savingId) { event.preventDefault(); return; } setDraggedId(lead.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/lead-id", lead.id); }} className={`atlas-pipeline-lead group ${savingId === lead.id ? "opacity-60" : ""} ${draggedId === lead.id ? "is-dragging" : ""}`} data-risk={risk}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="atlas-lead-avatar" aria-hidden="true">{Array.from(lead.name || "??").slice(0, 2).join("").toUpperCase()}</span>
                            <div className="min-w-0"><Link href={`/leads/${lead.id}`} className="block truncate text-sm font-semibold text-white transition hover:text-sky-300">{lead.name || "Lead sem nome"}</Link><p className="mt-0.5 truncate text-[11px] text-slate-500">{lead.phone || lead.email || "Sem contato"}</p></div>
                          </div>
                          {risk !== "baixo" ? <AtlasBadge tone={riskTone(risk)}>{risk === "alto" ? "⚠️" : "•"} {risk}</AtlasBadge> : null}
                        </div>
                        <div className="atlas-lead-origin"><span>{lead.project || lead.source || "Projeto não informado"}</span>{metaCampaign(lead) ? <small>{metaCampaign(lead)}</small> : null}</div>
                        <div className="atlas-kanban-signal-row">
                          <span className={`atlas-temperature is-${String(lead.temperature || "frio").toLowerCase()}`}>{lead.temperature || "frio"}</span>
                          <span>Score <strong>{lead.score ?? 0}</strong></span>
                          <span>{lead.budget_max ? brl.format(lead.budget_max) : "Sem valor"}</span>
                        </div>
                        {/* Aqui o primitivo `cc6-chip` NÃO é aplicado de propósito: ele é
                            `inline-flex` e mataria o `text-ellipsis` deste rótulo, que precisa
                            truncar dentro da coluna. Só a face numérica e a cor migram para o
                            vocabulário do sistema. */}
                        {signalView ? <span className={`cc6-num mt-2.5 block w-fit max-w-full overflow-hidden rounded-full border border-[color:var(--atlas-border-strong)] px-2 py-1 text-[9px] leading-none text-ellipsis whitespace-nowrap ${signalView.critical ? "cc6-crit" : "cc6-warn"}`} title={signalView.title}>{signalView.label}</span> : null}
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
                        <div role="group" aria-label={`Abrir ou descartar ${lead.name || "lead sem nome"}`} className="pointer-events-none mt-2 flex gap-1.5 opacity-0 motion-safe:transition-opacity motion-safe:duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                          <Link href={`/leads/${lead.id}`} title="Abrir a visão completa da lead" className="flex-1 rounded-xl border border-[rgba(148,163,184,.12)] px-2 py-1.5 text-center font-mono text-[10px] leading-4 text-[#aab6ca] motion-safe:transition-colors hover:border-[rgba(148,163,184,.22)] hover:text-[#e8eef8] focus-visible:border-[rgba(148,163,184,.22)] focus-visible:text-[#e8eef8]">Abrir</Link>
                          <button type="button" title="Descartar com motivo classificado — abre o painel de descarte" disabled={Boolean(savingId)} onClick={() => void moveLead(lead.id, "perdido")} className="flex-1 rounded-xl border border-[rgba(148,163,184,.12)] px-2 py-1.5 text-center font-mono text-[10px] leading-4 text-[#aab6ca] motion-safe:transition-colors hover:border-[rgba(251,113,133,.22)] hover:text-[#fb7185] focus-visible:border-[rgba(251,113,133,.22)] focus-visible:text-[#fb7185] disabled:cursor-not-allowed disabled:opacity-40">Descartar</button>
                        </div>
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
                  {/* Corte declarado, nunca silencioso. Uma coluna que desenha
                      25 de 205 e não diz nada é pior que uma que desenha 205:
                      passa a impressão de que aquilo é tudo. */}
                  {stage.ocultos > 0 ? (
                    <p className="atlas-pipeline-column-resto">
                      Mostrando os {stage.visiveis.length} mais prioritários.
                      {" "}<strong>+{stage.ocultos}</strong> nesta etapa.{" "}
                      <Link href={`/leads?status=${encodeURIComponent(stage.key)}&sort=first_contact_sla`}>
                        Abrir a fila completa
                      </Link>
                    </p>
                  ) : null}
                </div>}
              </section>
              );
            })}
          </div>
        </div>
        <div className="border-t border-white/[.06] px-5 py-3 text-[10px] text-slate-500 sm:px-6">Arraste, use o seletor ou pressione <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-slate-300">Alt + ←/→</kbd> com o card em foco. A movimentação continua registrada na timeline.</div>
      </AtlasCard>
      {!focusMode ? <AtlasCard>
        <AtlasCardHeader eyebrow="Inteligência de compradores" title="Compraram em outro lugar" description="Base separada do funil ativo: compradores reais que ajudam a entender público, produto, preço e concorrência sem contar como venda da empresa." />
        {/* Seção de aprendizado (contexto, não decisão): N cards bordados dentro de um
            AtlasCard viram lista densa. O `flex-wrap` é obrigatório porque `.cc23-row`
            não quebra sozinho — sem ele o <select> disputaria a linha com o nome no
            celular. O `self-start` alinha o selo ao topo sem depender de `items-start`,
            que perderia para o `align-items:center` do próprio `.cc23-row`. */}
        <div className="p-4 sm:p-6">{leads.filter((lead) => lead.status === "comprou_outro").length ? <ul className="cc23-rows">{leads.filter((lead) => lead.status === "comprou_outro").map((lead) => <li key={lead.id} className="cc23-row flex-wrap">
          <div className="min-w-0 flex-1">
            <Link href={`/leads/${lead.id}`} className="font-semibold text-white hover:text-emerald-300">{lead.name || "Cliente comprador"}</Link>
            <p className="mt-1 text-xs text-slate-500">{lead.phone || lead.email || "Contato protegido"}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Perfil preservado para inteligência comercial e futuras estratégias de público.</p>
          </div>
          <span className="shrink-0 self-start"><AtlasBadge tone="success">COMPRADOR</AtlasBadge></span>
          <select aria-label={`Mover ${lead.name || "cliente comprador"} para outra etapa`} value={lead.status ?? "comprou_outro"} disabled={savingId === lead.id} onChange={(event) => void moveLead(lead.id, event.target.value as StageKey)} className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-xs text-slate-300 sm:w-auto">{destinationOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
        </li>)}</ul> : <AtlasEmpty reason="no-activity" eyebrow="Aprendizado comprador" title="Nenhum perfil comprador separado" description="Ao registrar uma compra em outro lugar, o cliente aparecerá aqui com seu aprendizado preservado." action={<Link href="/external-sales" className="atlas-button-secondary">Registrar compra externa</Link>} />}</div>
      </AtlasCard> : null}
      {!focusMode && discardReportStatus !== "restricted" ? <AtlasCard>
        <AtlasCardHeader eyebrow="Qualidade de descarte" title="Descartadas" description="Motivos estruturados dos últimos 30 dias. Sinais negativos permanecem internos até a decisão do diretor de sincronizar com a Meta." action={<Link href="/pipeline/discards" className="atlas-button-secondary">Ver relatório Andromeda</Link>} />
        <div className="p-4 sm:p-6">
          {discardReportStatus === "loading" ? <AtlasSkeleton className="h-24 w-full" /> : null}
          {discardReportStatus === "error" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100" role="status"><span>O resumo de descartes não pôde ser carregado agora.</span><button type="button" onClick={() => { setDiscardReportStatus("loading"); void loadDiscardReport(); }} className="font-semibold text-amber-50 underline decoration-amber-300/40 underline-offset-4">Tentar novamente</button></div> : null}
          {discardReportStatus === "ready" && discardReport ? (discardReport.byReason.length ? <>
            <div className="flex flex-wrap items-center gap-2">
              <AtlasBadge tone="danger">{discardReport.totals.discarded} descarte(s) em {discardReport.period.days} dias</AtlasBadge>
              <AtlasBadge tone="neutral">{discardReport.totals.uniqueLeads} lead(s)</AtlasBadge>
              {discardReport.totals.coveragePct !== null ? <AtlasBadge tone={discardReport.totals.coveragePct >= 80 ? "success" : "warning"}>Cobertura {discardReport.totals.coveragePct}% das perdas</AtlasBadge> : null}
            </div>
            {/* Ranking de motivos: `cc23-quiet` agrupa por fundo (sem desenhar mais uma
                borda dentro do AtlasCard) e a face tabular do `cc23-display` deixa as
                magnitudes comparáveis na vertical. A cor de risco vai num span FILHO
                porque `.cc23-display` também declara `color` e, empatando em
                especificidade, venceria `.cc6-crit` por vir depois no globals.css. */}
            <div className="cc23-quiet mt-4">
              <ul className="cc23-rows">
                {discardReport.byReason.map((item) => <li key={item.key} className="cc23-row">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <div className="mt-1"><AtlasBadge tone="violet">{item.metaCategory}</AtlasBadge></div>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2">
                    <span className="cc23-display"><span className="cc6-crit">{item.count}</span></span>
                    <span className="text-[11px] text-slate-500">{item.share}% dos descartes</span>
                  </div>
                </li>)}
              </ul>
            </div>
          </> : <AtlasEmpty reason="no-activity" eyebrow="Aprendizado de descarte" title="Nenhum descarte classificado ainda" description="Ao mover uma lead para a etapa de perda, o motivo escolhido aparece aqui e alimenta o relatório Andromeda." action={<Link href="/pipeline/discards" className="atlas-button-secondary">Abrir relatório Andromeda</Link>} />) : null}
        </div>
      </AtlasCard> : null}
      {discardDraft ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center" role="presentation" onClick={() => setDiscardDraft(null)}>
        <div ref={discardPanelRef} role="dialog" aria-modal="true" aria-labelledby="discard-panel-title" aria-describedby="discard-panel-description" tabIndex={-1} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); setDiscardDraft(null); return; }
          // Focus trap: Tab circula dentro do painel (dívida registrada na onda 2).
          if (event.key === "Tab") {
            const panel = discardPanelRef.current;
            if (!panel) return;
            const focusables = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex='0']"));
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (event.shiftKey) {
              if (active === first || active === panel) { event.preventDefault(); last.focus(); }
            } else if (active === last || active === panel) { event.preventDefault(); first.focus(); }
          }
        }} className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/40 outline-none sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-rose-300">Descarte com aprendizado</p>
          <h3 id="discard-panel-title" className="mt-1 text-lg font-semibold text-white">Por que descartar {discardDraft.leadName}?</h3>
          <p id="discard-panel-description" className="mt-1 text-xs leading-5 text-slate-500">O motivo alimenta o relatório Andromeda e permanece interno. A lead só sai de {destinationOptions.find((item) => item.key === discardDraft.fromStage)?.label || "sua etapa"} depois da confirmação.</p>
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Motivo do descarte" onKeyDown={(event) => {
            // Navegação por setas com roving tabindex (dívida registrada na onda 2).
            if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
            event.preventDefault();
            const keys = DISCARD_REASONS.map((item) => item.key);
            const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
            const currentIndex = discardDraft.reasonKey ? keys.indexOf(discardDraft.reasonKey) : -1;
            const nextKey = currentIndex === -1
              ? keys[delta > 0 ? 0 : keys.length - 1]
              : keys[(currentIndex + delta + keys.length) % keys.length];
            setDiscardDraft((current) => (current ? { ...current, reasonKey: nextKey } : current));
            event.currentTarget.querySelector<HTMLButtonElement>(`[data-reason-key="${nextKey}"]`)?.focus();
          }}>
            {DISCARD_REASONS.map((reason, reasonIndex) => <button key={reason.key} type="button" role="radio" data-reason-key={reason.key} tabIndex={discardDraft.reasonKey === reason.key || (!discardDraft.reasonKey && reasonIndex === 0) ? 0 : -1} aria-checked={discardDraft.reasonKey === reason.key} onClick={() => setDiscardDraft((current) => (current ? { ...current, reasonKey: reason.key } : current))} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${discardDraft.reasonKey === reason.key ? "border-rose-400/40 bg-rose-400/10" : "border-white/[0.07] bg-white/[0.025] hover:border-white/15"}`}>
              <span className={`block text-sm font-semibold ${discardDraft.reasonKey === reason.key ? "text-rose-100" : "text-slate-200"}`}>{reason.label}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{reason.description}</span>
            </button>)}
          </div>
          <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500" htmlFor="discard-notes">Observação (opcional)</label>
          <input id="discard-notes" value={discardDraft.notes} maxLength={280} onChange={(event) => setDiscardDraft((current) => (current ? { ...current, notes: event.target.value } : current))} placeholder="Contexto curto para o time e para a IA..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-rose-400/30" />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setDiscardDraft(null)} className="atlas-button-secondary">Cancelar</button>
            <button type="button" onClick={confirmDiscard} disabled={!discardDraft.reasonKey || Boolean(savingId)} className="atlas-button-primary disabled:cursor-not-allowed disabled:opacity-50">Confirmar descarte</button>
          </div>
        </div>
      </div> : null}

      {followUpDraft ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center" role="presentation" onClick={() => setFollowUpDraft(null)}>
        {/* ── SEM `ref` QUE FOCA O CONTÊINER ──────────────────────────────────
            Havia aqui `ref={(node) => node?.focus()}`. Arrow inline é uma função
            NOVA a cada renderização, então o React a executava em TODAS elas —
            e cada execução roubava o foco do textarea de volta para esta div.
            Digitar uma letra muda o estado, o estado re-renderiza, o foco pula:
            na prática o campo não aceitava texto. Relatado com captura de tela.
            O `autoFocus` do textarea já leva o foco para dentro do diálogo na
            abertura, que é o que a acessibilidade pede — e é o campo, não a
            moldura, que a pessoa precisa usar. */}
        <div role="dialog" aria-modal="true" aria-labelledby="followup-panel-title" aria-describedby="followup-panel-description" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); setFollowUpDraft(null); }
        }} className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/40 outline-none sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-amber-300">Comprou em outro lugar</p>
          <h3 id="followup-panel-title" className="mt-1 text-lg font-semibold text-white">O que pesou na decisão de {followUpDraft.leadName}?</h3>
          <p id="followup-panel-description" className="mt-1 text-xs leading-5 text-slate-500">Projeto, região, preço, prazo, financiamento ou atendimento. Fica interno ao CRM e é o que ensina onde o Atlas perde negócio.</p>
          <textarea
            id="followup-description"
            autoFocus
            rows={4}
            maxLength={4000}
            value={followUpDraft.description}
            onChange={(event) => setFollowUpDraft((current) => (current ? { ...current, description: event.target.value } : current))}
            placeholder="Ex.: fechou num lançamento a 2 km, entrega 8 meses antes e entrada parcelada em 36x."
            className="mt-4 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-amber-400/30"
          />
          {/* Diz quanto falta em vez de recusar depois: o botão desabilitado sem
              explicação é a versão silenciosa do mesmo bloqueio. */}
          <p className="mt-2 text-[11px] text-slate-500" role="status">
            {followUpDraft.description.trim().length < 10
              ? `Faltam ${10 - followUpDraft.description.trim().length} caractere(s) — uma linha basta.`
              : "Pronto para registrar."}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setFollowUpDraft(null)} className="atlas-button-secondary">Cancelar</button>
            <button type="button" onClick={confirmFollowUp} disabled={followUpDraft.description.trim().length < 10 || Boolean(savingId)} className="atlas-button-primary disabled:cursor-not-allowed disabled:opacity-50">Registrar e mover</button>
          </div>
        </div>
      </div> : null}
    </div>
  );
}
