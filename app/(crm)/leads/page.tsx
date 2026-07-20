"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { LIVE_PROFILE_SELECT, mapLegacyProfile, mapLegacyProject } from "@/lib/compat/legacy-v2";
import { EmptyState } from "@/components/atlas/empty-state";
import { ErrorState } from "@/components/atlas/error-state";
import { LoadingState } from "@/components/atlas/loading-state";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  source: string | null;
  assigned_to: string | null;
  campaign_id: string | null;
  development_id: string | null;
  temperature: string | null;
  score: number | null;
  budget_min: number | null;
  budget_max: number | null;
  last_interaction_at: string | null;
  next_action_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  metadata: {
    meta?: {
      campaignId?: string;
      formId?: string;
      dataSharingConsent?: boolean;
      sourceName?: string;
    };
  } | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  commercial_role: string | null;
  reports_to: string | null;
  active: boolean;
};

type ReferenceRow = Record<string, unknown>;
type SortDirection = "asc" | "desc";
type AttentionFilter = "" | "overdue" | "no_action" | "hot" | "unassigned";
type NextActionFilter = "" | "today" | "next_7_days" | "scheduled";
type LeadPriorityTone = "danger" | "warning" | "info";
type LeadPriority = {
  lead: Lead;
  label: string;
  detail: string;
  tone: LeadPriorityTone;
  rank: number;
};
type StalledSignal = {
  days: number;
  basis: "atividade" | "criacao";
  level: "amber" | "rose";
  hot: boolean;
};
type SavedLeadFilters = {
  search?: string;
  status?: string;
  source?: string;
  project?: string;
  broker?: string;
  score?: string;
  attention?: AttentionFilter;
  nextAction?: NextActionFilter;
  sort?: string;
  direction?: SortDirection;
  filtersOpen?: boolean;
};

type LeadsPayload = {
  ok: true;
  data: {
    items: Lead[];
    page: {
      limit: number;
      number: number | null;
      total: number | null;
      pages: number | null;
      hasMore: boolean;
    };
  };
};

const PAGE_SIZE = 25;
const FILTER_STORAGE_KEY = "atlas:leads-filters:v1";
const statuses = [
  { value: "", label: "Todos os status" },
  { value: "novo", label: "Novo" },
  { value: "contato", label: "Contato" },
  { value: "qualificacao", label: "Qualificação" },
  { value: "visita", label: "Visita" },
  { value: "proposta", label: "Proposta" },
  { value: "negociacao", label: "Negociação" },
  { value: "ganho", label: "Venda" },
  { value: "perdido", label: "Perdido" },
  { value: "comprou_outro", label: "Comprou em outro lugar" },
] as const;

/* CC-6: anel de foco padrão do repositório e cor da faixa lateral por tom. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const priorityBand: Record<LeadPriorityTone, string> = {
  danger: "#fb7185",
  warning: "#f5b544",
  info: "var(--atlas-accent)",
};

function text(row: ReferenceRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function developmentRef(row: ReferenceRow) {
  return text(
    row,
    "development_id",
    "developmentId",
    "project_id",
    "projectId",
  );
}

function statusTone(value: string | null) {
  const normalized = (value ?? "").toLowerCase();
  if (["ganho", "venda"].includes(normalized)) return "success";
  if (["perdido"].includes(normalized)) return "danger";
  if (normalized === "comprou_outro") return "success";
  if (["visita", "proposta", "negociacao"].includes(normalized))
    return "violet";
  if (["contato", "qualificacao"].includes(normalized)) return "warning";
  return "info";
}

function scoreTone(score: number | null) {
  if (Number(score ?? 0) >= 70) return "danger";
  if (Number(score ?? 0) >= 40) return "warning";
  return "info";
}

function formatDate(value: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dueLabel(value: string | null, referenceTime: number) {
  if (!value) return { label: "Sem próxima ação", overdue: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return { label: "Sem próxima ação", overdue: false };
  const overdue = date.getTime() < referenceTime;
  return {
    label: `${overdue ? "Atrasada" : "Próxima"} · ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`,
    overdue,
  };
}

function phoneLinks(phone: string | null) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const international = digits.startsWith("55") ? digits : `55${digits}`;
  return { call: `tel:+${international}`, whatsapp: `https://wa.me/${international}` };
}

function isHotLead(lead: Lead) {
  return (
    (lead.temperature ?? "").toLowerCase() === "quente" ||
    Number(lead.score ?? 0) >= 70
  );
}

function isOpenLead(lead: Lead) {
  return !["ganho", "perdido", "comprou_outro"].includes(
    (lead.status ?? "novo").toLowerCase(),
  );
}

/* Sinal proativo 100% determinístico (mesmo padrão do kanban): deriva apenas
   de updated_at/last_interaction_at/created_at já carregados. Sem timestamp
   válido não há sinal — nenhum número é inventado. Limiares: amber >= 3 dias,
   rose >= 7 dias; leads encerradas não geram sinal. */
function stalledSignal(lead: Lead, referenceTime: number): StalledSignal | null {
  if (!referenceTime || !isOpenLead(lead)) return null;
  const activityTimes = [lead.updated_at, lead.last_interaction_at]
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time));
  const hasActivity = activityTimes.length > 0;
  const reference = hasActivity
    ? Math.max(...activityTimes)
    : lead.created_at
      ? new Date(lead.created_at).getTime()
      : Number.NaN;
  if (!Number.isFinite(reference)) return null;
  const days = Math.floor(Math.max(0, referenceTime - reference) / 86_400_000);
  if (days < 3) return null;
  return {
    days,
    basis: hasActivity ? "atividade" : "criacao",
    level: days >= 7 ? "rose" : "amber",
    hot: isHotLead(lead),
  };
}

function stalledChipView(signal: StalledSignal, lead: Lead) {
  const fromCreation = signal.basis === "criacao";
  const baseTitle = fromCreation
    ? `Sem atualização registrada desde a criação, há ${signal.days} dia(s) — contagem baseada na data de criação, único registro disponível.`
    : `Sem atualização registrada há ${signal.days} dia(s) — base: atualização ou interação mais recente.`;
  return {
    label: signal.hot
      ? `quente sem toque · ${signal.days}d`
      : fromCreation
        ? `${signal.days}d desde a criação`
        : `parado há ${signal.days}d`,
    chipClass:
      signal.hot || signal.level === "rose"
        ? "cc6-crit border-[rgba(251,113,133,0.28)]!"
        : "cc6-warn border-[rgba(245,181,68,0.28)]!",
    title: signal.hot
      ? `Lead quente (score ${lead.score ?? 0}). ${baseTitle} Priorize o contato.`
      : baseTitle,
  };
}

function visibleLeadPriority(
  lead: Lead,
  referenceTime: number,
  includeOwnership: boolean,
): LeadPriority | null {
  const nextActionTime = lead.next_action_at
    ? new Date(lead.next_action_at).getTime()
    : Number.NaN;
  const overdue =
    referenceTime > 0 &&
    Number.isFinite(nextActionTime) &&
    nextActionTime < referenceTime;
  const hot = isHotLead(lead);

  if (overdue) {
    return {
      lead,
      label: "Follow-up vencido",
      detail: "Retome o contato e registre o resultado do atendimento.",
      tone: "danger",
      rank: 0,
    };
  }
  if (includeOwnership && !lead.assigned_to) {
    return {
      lead,
      label: "Sem responsável",
      detail: "Distribua a lead antes de perder o tempo de resposta.",
      tone: "warning",
      rank: 1,
    };
  }
  if (hot && !lead.next_action_at) {
    return {
      lead,
      label: "Quente sem agenda",
      detail: "Confirme o interesse e agende a próxima ação.",
      tone: "danger",
      rank: 2,
    };
  }
  if (hot) {
    return {
      lead,
      label: "Alta intenção",
      detail: "Revise o histórico antes do próximo contato agendado.",
      tone: "warning",
      rank: 3,
    };
  }
  if (!lead.next_action_at) {
    return {
      lead,
      label: "Sem próxima ação",
      detail: "Defina um follow-up para a oportunidade não ficar esquecida.",
      tone: "info",
      rank: 4,
    };
  }
  return null;
}

export default function LeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [campaigns, setCampaigns] = useState<ReferenceRow[]>([]);
  const [developments, setDevelopments] = useState<ReferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [project, setProject] = useState("");
  const [broker, setBroker] = useState("");
  const [score, setScore] = useState("");
  const [attention, setAttention] = useState<AttentionFilter>("");
  const [nextAction, setNextAction] = useState<NextActionFilter>("");
  const [sort, setSort] = useState("created_at");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [referenceTime, setReferenceTime] = useState(0);
  const [currentRole, setCurrentRole] = useState("");
  const [currentProfileId, setCurrentProfileId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [transferTarget, setTransferTarget] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (saved) {
        const filters = JSON.parse(saved) as SavedLeadFilters;
        setSearch(filters.search || "");
        setDebouncedSearch((filters.search || "").trim());
        setStatus(filters.status || "");
        setSource(filters.source || "");
        setProject(filters.project || "");
        setBroker(filters.broker || "");
        setScore(filters.score || "");
        setAttention(filters.attention || "");
        setNextAction(filters.nextAction || "");
        setSort(filters.sort || "created_at");
        setDirection(filters.direction === "asc" ? "asc" : "desc");
        setFiltersOpen(Boolean(filters.filtersOpen));
      }
    } catch {
      window.sessionStorage.removeItem(FILTER_STORAGE_KEY);
    } finally {
      setFiltersHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!filtersHydrated) return;
    const snapshot: SavedLeadFilters = {
      search,
      status,
      source,
      project,
      broker,
      score,
      attention,
      nextAction,
      sort,
      direction,
      filtersOpen,
    };
    window.sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    attention,
    broker,
    direction,
    filtersHydrated,
    filtersOpen,
    nextAction,
    project,
    score,
    search,
    sort,
    source,
    status,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let active = true;

    async function loadReferences() {
      const [profileResult, campaignResult, developmentResult, meResult] =
        await Promise.all([
          supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("active", true).order("created_at"),
          supabase.from("marketing_campaigns").select("id,name,platform,status,created_at").limit(500),
          supabase.from("crm_projects").select("id,organization_id,name,developer_name,code,status,city,neighborhood,address,launch_date,delivery_date,created_at,updated_at").order("name").limit(100),
          fetch("/api/v1/auth/me").then((response) => response.json()),
        ]);
      if (!active) return;
      setProfiles(((profileResult.data ?? []) as Record<string, unknown>[]).map(mapLegacyProfile) as unknown as Profile[]);
      setCampaigns((campaignResult.data ?? []) as ReferenceRow[]);
      setDevelopments(((developmentResult.data ?? []) as Record<string, unknown>[]).map(mapLegacyProject) as ReferenceRow[]);
      setCurrentRole(
        meResult?.data?.profile?.commercialRole ||
          meResult?.data?.profile?.role ||
          "",
      );
      setCurrentProfileId(meResult?.data?.profile?.id || "");
      const referenceError =
        profileResult.error || campaignResult.error || developmentResult.error;
      if (referenceError) setError("Alguns filtros auxiliares estão sincronizando. A carteira principal continua protegida.");
      setReferencesLoading(false);
    }

    void loadReferences();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLeads() {
      if (!filtersHydrated) return;
      setLoading(true);
      setError("");
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token)
          throw new Error(
            "Sessão expirada. Entre novamente para consultar os leads.",
          );

        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          sort,
          direction,
        });
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (status) params.set("status", status);
        if (source) params.set("source", source);
        if (broker) {
          const selectedProfile = profiles.find(
            (profile) => profile.id === broker,
          );
          if (
            (selectedProfile?.commercial_role || selectedProfile?.role) ===
            "manager"
          )
            params.set("team_owner", broker);
          else params.set("assigned_to", broker);
        }
        if (project) params.set("development_id", project);
        if (score === "hot") params.set("min_score", "70");
        if (score === "warm") {
          params.set("min_score", "40");
          params.set("max_score", "69");
        }
        if (score === "cold") params.set("max_score", "39");
        if (attention) params.set("attention", attention);
        if (nextAction) params.set("next_action", nextAction);

        const response = await fetch(`/api/v1/crm/leads?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const payload = (await response.json()) as
          LeadsPayload | { error?: { message?: string } };
        if (!response.ok || !("ok" in payload) || !payload.ok) {
          const message = "error" in payload ? payload.error?.message : "";
          throw new Error(message || "Não foi possível carregar os leads.");
        }
        setItems(payload.data.items);
        setSelected(new Set());
        setTotal(payload.data.page.total ?? payload.data.items.length);
        setPages(payload.data.page.pages ?? 1);
        setReferenceTime(Date.now());
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Falha ao carregar leads.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadLeads();
    return () => controller.abort();
  }, [
    attention,
    broker,
    debouncedSearch,
    direction,
    nextAction,
    page,
    profiles,
    project,
    reloadKey,
    score,
    sort,
    source,
    status,
    filtersHydrated,
  ]);

  const profileMap = useMemo(
    () =>
      new Map(
        profiles.map((profile) => [
          profile.id,
          profile.full_name || "Usuário Atlas",
        ]),
      ),
    [profiles],
  );

  const campaignMap = useMemo(
    () =>
      new Map(
        campaigns.map((campaign) => [
          String(campaign.id),
          developmentRef(campaign),
        ]),
      ),
    [campaigns],
  );

  const developmentMap = useMemo(
    () =>
      new Map(
        developments.map((development) => [
          String(development.id),
          text(development, "name") || "Projeto sem nome",
        ]),
      ),
    [developments],
  );

  const projectName = (lead: Lead) => {
    const developmentId =
      lead.development_id ||
      (lead.campaign_id ? campaignMap.get(lead.campaign_id) : "");
    return developmentId
      ? developmentMap.get(developmentId) || "Projeto não identificado"
      : "Sem projeto";
  };

  const pageMetrics = useMemo(() => {
    let hot = 0;
    let unassigned = 0;
    let overdue = 0;
    let noAction = 0;
    let stalled = 0;
    let stalledCritical = 0;
    for (const lead of items) {
      if (isHotLead(lead)) hot += 1;
      if (!lead.assigned_to) unassigned += 1;
      if (!lead.next_action_at) noAction += 1;
      else if (
        referenceTime &&
        new Date(lead.next_action_at).getTime() < referenceTime
      )
        overdue += 1;
      const signal = stalledSignal(lead, referenceTime);
      if (signal) {
        stalled += 1;
        if (signal.hot || signal.level === "rose") stalledCritical += 1;
      }
    }
    return { hot, unassigned, overdue, noAction, stalled, stalledCritical };
  }, [items, referenceTime]);

  const teamBrokers = useMemo(
    () =>
      profiles.filter(
        (profile) => (profile.commercial_role || profile.role) === "broker",
      ),
    [profiles],
  );

  const visiblePriorityQueue = useMemo(() => {
    const includeOwnership = currentRole !== "broker";
    return items
      .map((lead) =>
        visibleLeadPriority(lead, referenceTime, includeOwnership),
      )
      .filter((priority): priority is LeadPriority => priority !== null)
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank;
        return Number(right.lead.score ?? 0) - Number(left.lead.score ?? 0);
      });
  }, [currentRole, items, referenceTime]);

  const hasFilters = Boolean(
    search ||
    status ||
    source ||
    project ||
    broker ||
    score ||
    attention ||
    nextAction,
  );
  const activeFilterCount = [
    status,
    source,
    project,
    broker,
    score,
    attention,
    nextAction,
  ].filter(Boolean).length;
  const canTransfer = [
    "admin",
    "director",
    "superintendent",
    "manager",
  ].includes(currentRole);
  const transferTargets = profiles.filter((profile) => {
    const role = profile.commercial_role || profile.role;
    if (currentRole === "manager")
      return role === "broker" && profile.reports_to === currentProfileId;
    return ["manager", "broker"].includes(role);
  });

  /* Contagens da página atual anexadas aos atalhos que filtram a carteira
     inteira — uma única superfície no lugar de métricas + atalhos separados. */
  const attentionShortcuts: Array<{
    key: AttentionFilter;
    label: string;
    description: string;
    count: number;
    countClass: string;
  }> = [
    {
      key: "overdue",
      label: "Atrasadas",
      description: "Resolver follow-ups vencidos",
      count: pageMetrics.overdue,
      countClass: "cc6-crit",
    },
    {
      key: "no_action",
      label: "Sem próxima ação",
      description: "Evitar leads esquecidas",
      count: pageMetrics.noAction,
      countClass: "text-[#aab6ca]",
    },
    {
      key: "hot",
      label: "Quentes",
      description: "Atender maior intenção",
      count: pageMetrics.hot,
      countClass: "cc6-crit",
    },
    ...(currentRole !== "broker"
      ? [
          {
            key: "unassigned" as AttentionFilter,
            label: "Sem responsável",
            description: "Distribuir para o time",
            count: pageMetrics.unassigned,
            countClass: "cc6-warn",
          },
        ]
      : []),
  ];

  async function transferSelected() {
    if (!selected.size || !transferTarget) return;
    setTransferring(true);
    setError("");
    setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token)
        throw new Error(
          "Sessão expirada. Entre novamente para transferir leads.",
        );
      const response = await fetch("/api/v1/crm/leads/bulk-transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          leadIds: [...selected],
          targetOwnerId: transferTarget,
          reason: transferReason,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.error?.message || "Não foi possível transferir os leads.",
        );
      setNotice(
        payload.data?.teamTargetId
          ? `${selected.size} lead(s) distribuído(s) aos corretores elegíveis da equipe escolhida. O gerente não virou proprietário.`
          : `${selected.size} lead(s) transferido(s) com histórico registrado.`,
      );
      setSelected(new Set());
      setTransferTarget("");
      setTransferReason("");
      setReloadKey((current) => current + 1);
    } catch (transferError) {
      setError(
        transferError instanceof Error
          ? transferError.message
          : "Falha na transferência.",
      );
    } finally {
      setTransferring(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setSource("");
    setProject("");
    setBroker("");
    setScore("");
    setAttention("");
    setNextAction("");
    setSort("created_at");
    setDirection("desc");
    setPage(1);
  }

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function applyAttention(value: AttentionFilter) {
    setAttention((current) => (current === value ? "" : value));
    setPage(1);
  }

  return (
    <div
      className="space-y-4 pb-10"
      data-phase="36-leads-action-workspace"
      data-leads-layout="action-first"
    >
      {/* Herói-resumo CC-6: identidade + total + atalhos de rotina em uma
          única superfície (única com 3D). Substitui hero, cards de métricas
          e painel "Minha rotina" separados. */}
      <section aria-label="Resumo da carteira e atalhos de rotina">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="cc6-eyebrow">CRM · Leads</p>
                {currentRole === "broker" ? (
                  <StatusBadge tone="success">CARTEIRA EXCLUSIVA</StatusBadge>
                ) : null}
                {currentRole === "manager" ? (
                  <StatusBadge tone="success">
                    MEU TIME · {teamBrokers.length} CORRETORES
                  </StatusBadge>
                ) : null}
              </div>
              <h1 className="mt-2 max-w-xl text-2xl font-semibold tracking-[-0.02em] text-[#e8eef8] sm:text-[27px] sm:leading-9">
                {currentRole === "broker"
                  ? "Sua fila de leads, pronta para agir."
                  : "Leads que exigem decisão agora."}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href="/leads/new" className="atlas-button-primary">
                  + Novo lead
                </Link>
                <Link href="/pipeline" className="cc6-ghost-btn min-h-11">
                  Abrir pipeline
                </Link>
                <details className="atlas-leads-tools">
                  <summary>Mais ferramentas</summary>
                  <div>
                    <Link href="/leads/data-quality">Qualidade dos dados</Link>
                    <Link href="/leads/deduplication">Duplicidades</Link>
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("atlas:open-copilot", {
                            detail: {
                              prompt:
                                "Analise a carteira de leads visível e explique até três prioridades, sem executar nenhuma ação.",
                              context: {
                                total,
                                filters: {
                                  status,
                                  source,
                                  project,
                                  broker,
                                  score,
                                  attention,
                                  nextAction,
                                },
                                pageMetrics,
                                visiblePriorities: visiblePriorityQueue.length,
                              },
                            },
                          }),
                        )
                      }
                    >
                      ✦ Analisar carteira
                    </button>
                  </div>
                </details>
              </div>
            </div>
            <div className="shrink-0 lg:pl-6 lg:text-right">
              <p className="cc6-eyebrow">Base filtrada</p>
              <p className="cc6-metric-value mt-1 text-4xl leading-none">
                {loading ? "—" : total}
              </p>
              <p className="mt-2 text-[11px] leading-4 text-[#6b7890]">
                {hasFilters
                  ? "resultado dos filtros atuais"
                  : currentRole === "broker"
                    ? "somente a sua carteira"
                    : "somente seu escopo comercial"}
              </p>
            </div>
          </div>
          <div className="cc6-hairline mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
            <p
              className="cc6-eyebrow"
              title="Os números contam a incidência na página atual; cada atalho filtra toda a carteira do seu escopo comercial."
            >
              Minha rotina
            </p>
            <div
              className="flex flex-1 gap-2 overflow-x-auto pb-0.5"
              role="group"
              aria-label="Encontre rapidamente onde agir"
            >
              {attentionShortcuts.map((shortcut) => (
                <button
                  key={shortcut.key}
                  type="button"
                  onClick={() => applyAttention(shortcut.key)}
                  aria-pressed={attention === shortcut.key}
                  title={`${shortcut.description}. O número é a incidência nesta página; o filtro consulta toda a carteira do seu escopo.`}
                  className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl border px-3 transition-colors ${
                    attention === shortcut.key
                      ? "border-[rgba(75,141,248,0.45)] bg-[rgba(75,141,248,0.08)] text-[#e8eef8]"
                      : "border-[rgba(148,163,184,0.14)] bg-white/[0.02] text-[#aab6ca] hover:border-[rgba(148,163,184,0.3)] hover:text-[#e8eef8]"
                  } ${focusRing}`}
                >
                  <span className="text-[11.5px] font-medium">
                    {shortcut.label}
                  </span>
                  <span
                    className={`cc6-num text-[13px] ${
                      shortcut.count > 0
                        ? shortcut.countClass
                        : "text-[#6b7890]"
                    }`}
                  >
                    {loading ? "—" : shortcut.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </TiltShell>
      </section>

      <section
        className="cc6-panel cc6-reveal p-4 sm:p-5"
        style={{ animationDelay: "70ms" }}
        aria-labelledby="atlas-leads-action-title"
        aria-live="polite"
        data-phase="36-visible-action-queue"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="atlas-leads-action-title"
            className="text-sm font-semibold tracking-tight text-[#e8eef8]"
          >
            Fila de ação · página atual
          </h2>
          <span
            className="cc6-chip"
            title={
              loading
                ? "Sincronizando a fila com os leads desta página."
                : `${visiblePriorityQueue.length} prioridade(s) visível(is), derivada(s) somente dos leads desta página${visiblePriorityQueue.length > 3 ? "; as demais seguem sinalizadas na tabela abaixo" : ""}.`
            }
          >
            {loading
              ? "sincronizando"
              : visiblePriorityQueue.length > 3
                ? `3 de ${visiblePriorityQueue.length}`
                : visiblePriorityQueue.length}
          </span>
        </header>
        {loading ? (
          <div className="mt-3">
            <LoadingState rows={3} />
          </div>
        ) : visiblePriorityQueue.length ? (
          <div className="mt-3 grid gap-2">
            {visiblePriorityQueue.slice(0, 3).map((priority, index) => {
              const contact = phoneLinks(priority.lead.phone);
              return (
                <article
                  key={priority.lead.id}
                  data-tone={priority.tone}
                  className="cc6-sev-band cc6-panel-quiet flex flex-col gap-3 py-3 pl-4 pr-3 md:flex-row md:items-center md:justify-between"
                  style={
                    { "--cc6-sev": priorityBand[priority.tone] } as CSSProperties
                  }
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="cc6-num pt-0.5 text-xs text-[#6b7890]"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/leads/${priority.lead.id}`}
                          className={`rounded-md text-[13px] font-semibold text-[#e8eef8] transition-colors hover:text-[color:var(--atlas-accent-hover)] ${focusRing}`}
                        >
                          {priority.lead.name || "Lead sem nome"}
                        </Link>
                        <StatusBadge tone={priority.tone}>
                          {priority.label}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#aab6ca]">
                        {priority.detail}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#6b7890]">
                        {projectName(priority.lead)} ·{" "}
                        {priority.lead.status || "novo"}
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex shrink-0 flex-wrap items-center gap-2 md:pl-3"
                    role="group"
                    aria-label={`Ações rápidas para ${priority.lead.name || "lead"}`}
                  >
                    {contact ? (
                      <a
                        href={contact.call}
                        className="cc6-ghost-btn min-h-11"
                        aria-label={`Ligar para ${priority.lead.name || "lead"}`}
                      >
                        Ligar
                      </a>
                    ) : null}
                    {contact ? (
                      <a
                        href={contact.whatsapp}
                        target="_blank"
                        rel="noreferrer"
                        className="cc6-ghost-btn min-h-11"
                        aria-label={`Abrir WhatsApp com ${priority.lead.name || "lead"}`}
                      >
                        WhatsApp
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="cc6-ghost-btn min-h-11"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("atlas:open-copilot", {
                            detail: {
                              prompt:
                                "Prepare uma abordagem curta para esta lead usando apenas o contexto autorizado. Explique a recomendação e não envie mensagem nem altere o CRM.",
                              context: {
                                leadId: priority.lead.id,
                                project: projectName(priority.lead),
                                status: priority.lead.status,
                                source: priority.lead.source,
                                score: priority.lead.score,
                                temperature: priority.lead.temperature,
                                priority: priority.label,
                              },
                            },
                          }),
                        )
                      }
                    >
                      ✦ Preparar abordagem
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-xs leading-5 text-[#6b7890]">
            Nenhuma pendência prioritária nesta página — os atalhos de atenção
            varrem o restante da carteira.
          </p>
        )}
      </section>

      <div className="cc6-reveal" style={{ animationDelay: "140ms" }}>
        <section
          className="atlas-leads-filter-panel"
          data-expanded={filtersOpen ? "true" : "false"}
        >
          <div className="atlas-leads-filter-top">
            <div className="atlas-leads-search border-[rgba(148,163,184,0.12)]! transition-colors focus-within:border-[color:var(--atlas-accent)]!">
              <span aria-hidden="true" className="text-[color:var(--atlas-accent)]!">
                ⌕
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, e-mail ou telefone..."
                aria-label="Buscar leads"
                className="focus:outline-hidden"
              />
            </div>
            <div className="atlas-leads-sort w-full sm:w-56 sm:shrink-0">
              <select
                value={sort}
                onChange={(event) => updateFilter(setSort, event.target.value)}
                aria-label="Ordenar leads"
                className={`min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#0a1120] px-3 text-[11px] text-[#cdd7e5] ${focusRing}`}
              >
                <option value="created_at">Data de entrada</option>
                <option value="updated_at">Última atualização</option>
                <option value="score">Score</option>
                <option value="name">Nome</option>
              </select>
              <button
                type="button"
                className={`min-h-11 ${focusRing}`}
                onClick={() => {
                  setDirection((current) =>
                    current === "asc" ? "desc" : "asc",
                  );
                  setPage(1);
                }}
                aria-label={
                  direction === "asc"
                    ? "Ordenação crescente"
                    : "Ordenação decrescente"
                }
              >
                {direction === "asc" ? "↑" : "↓"}
              </button>
            </div>
            <button
              type="button"
              className={`atlas-filter-toggle ${focusRing}`}
              aria-expanded={filtersOpen}
              aria-controls="atlas-advanced-filters"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <span aria-hidden="true">≡</span>
              <span>Filtros</span>
              {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
            </button>
            {hasFilters ? (
              <button
                type="button"
                className={`atlas-clear-filters ${focusRing}`}
                onClick={resetFilters}
              >
                Limpar
              </button>
            ) : null}
          </div>
          {filtersOpen ? (
            <div
              className="atlas-leads-advanced-filters"
              id="atlas-advanced-filters"
            >
              <select
                value={project}
                onChange={(event) => updateFilter(setProject, event.target.value)}
                aria-label="Filtrar por projeto"
                disabled={referencesLoading}
                className={focusRing}
              >
                <option value="">Todos os projetos</option>
                {developments.map((development) => (
                  <option
                    key={String(development.id)}
                    value={String(development.id)}
                  >
                    {text(development, "name") || "Projeto sem nome"}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(event) => updateFilter(setStatus, event.target.value)}
                aria-label="Filtrar por status"
                className={focusRing}
              >
                {statuses.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <div className="atlas-filter-input-wrap">
                <input
                  list="atlas-lead-sources"
                  value={source}
                  onChange={(event) =>
                    updateFilter(setSource, event.target.value)
                  }
                  placeholder="Todas as origens"
                  aria-label="Filtrar por origem"
                  className={focusRing}
                />
                <datalist id="atlas-lead-sources">
                  <option value="Meta Lead Ads" />
                  <option value="WhatsApp" />
                  <option value="Google Ads" />
                  <option value="TikTok Ads" />
                  <option value="Portal imobiliário" />
                  <option value="Indicação" />
                  <option value="Oferta ativa" />
                </datalist>
              </div>
              {currentRole !== "broker" ? (
                <select
                  value={broker}
                  onChange={(event) =>
                    updateFilter(setBroker, event.target.value)
                  }
                  aria-label="Filtrar por corretor"
                  disabled={referencesLoading}
                  className={focusRing}
                >
                  <option value="">
                    {currentRole === "manager"
                      ? "Todo o meu time"
                      : "Todos os corretores"}
                  </option>
                  {currentRole !== "manager" ? (
                    <option value="unassigned">Sem responsável</option>
                  ) : null}
                  {(currentRole === "manager"
                    ? teamBrokers
                    : profiles.filter((profile) =>
                        ["broker", "manager"].includes(
                          profile.commercial_role || profile.role,
                        ),
                      )
                  ).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name || "Usuário sem nome"}
                    </option>
                  ))}
                </select>
              ) : null}
              <select
                value={score}
                onChange={(event) => updateFilter(setScore, event.target.value)}
                aria-label="Filtrar por score"
                className={focusRing}
              >
                <option value="">Todos os scores</option>
                <option value="hot">Quente · 70–100</option>
                <option value="warm">Morno · 40–69</option>
                <option value="cold">Frio · 0–39</option>
              </select>
              <select
                value={nextAction}
                onChange={(event) =>
                  updateFilter(
                    (value) => setNextAction(value as NextActionFilter),
                    event.target.value,
                  )
                }
                aria-label="Filtrar por próxima ação"
                className={focusRing}
              >
                <option value="">Qualquer próxima ação</option>
                <option value="today">Agendada para hoje</option>
                <option value="next_7_days">Próximos 7 dias</option>
                <option value="scheduled">Todas as agendadas</option>
              </select>
            </div>
          ) : null}
        </section>
      </div>

      {error ? (
        <ErrorState
          description={error}
          action={
            <button
              type="button"
              className="atlas-button-secondary"
              onClick={resetFilters}
            >
              Limpar e tentar novamente
            </button>
          }
        />
      ) : null}
      {notice ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-200"
        >
          {notice}
        </div>
      ) : null}

      {canTransfer && selected.size ? (
        <section
          data-phase="54-team-transfer"
          className="sticky top-3 z-30 flex flex-col gap-3 rounded-2xl border border-[rgba(75,141,248,0.35)] bg-[#080e1d]/95 p-4 backdrop-blur md:flex-row md:items-center"
        >
          <div className="min-w-52">
            <strong className="block text-sm text-[#e8eef8]">
              <span className="cc6-num">{selected.size}</span> lead(s)
              selecionado(s)
            </strong>
            <span className="mt-1 block text-[11px] leading-4 text-[#6b7890]">
              {currentRole === "manager"
                ? "Transferência direta para um corretor do meu time, com histórico registrado."
                : "Ao escolher um gerente, as leads são equilibradas entre os corretores elegíveis. O gerente não se torna responsável."}
            </span>
          </div>
          <select
            className={`min-h-11 flex-1 rounded-xl border border-[rgba(148,163,184,0.16)] bg-white/5 px-3 text-sm text-[#e8eef8] ${focusRing}`}
            value={transferTarget}
            onChange={(event) => setTransferTarget(event.target.value)}
          >
            <option value="">
              {currentRole === "manager"
                ? "Escolha um corretor do meu time"
                : "Escolha gerente ou corretor"}
            </option>
            {transferTargets.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name || "Usuário sem nome"} ·{" "}
                {profile.commercial_role || profile.role}
              </option>
            ))}
          </select>
          <input
            className={`min-h-11 flex-1 rounded-xl border border-[rgba(148,163,184,0.16)] bg-white/5 px-3 text-sm text-[#e8eef8] ${focusRing}`}
            value={transferReason}
            onChange={(event) => setTransferReason(event.target.value)}
            placeholder="Motivo obrigatório da transferência"
            minLength={10}
            maxLength={500}
          />
          <button
            type="button"
            className="atlas-button-primary"
            disabled={
              !transferTarget ||
              transferReason.trim().length < 10 ||
              transferring
            }
            onClick={transferSelected}
          >
            {transferring ? "Transferindo..." : "Confirmar transferência"}
          </button>
          <button
            type="button"
            className="cc6-ghost-btn min-h-11"
            onClick={() => setSelected(new Set())}
          >
            Cancelar
          </button>
        </section>
      ) : null}

      {!error ? (
        <section
          className="atlas-leads-table-panel cc6-reveal"
          style={{ animationDelay: "140ms" }}
        >
          <div className="atlas-leads-table-head">
            <div>
              <strong>Carteira comercial</strong>
            </div>
            {!loading && pageMetrics.stalled > 0 ? (
              <span
                className={`cc6-chip inline-flex! ${
                  pageMetrics.stalledCritical > 0
                    ? "cc6-crit border-[rgba(251,113,133,0.28)]!"
                    : "cc6-warn border-[rgba(245,181,68,0.28)]!"
                }`}
                title={`${pageMetrics.stalled} de ${items.length} lead(s) desta página sem atualização registrada há 3 ou mais dias.`}
              >
                {pageMetrics.stalled}{" "}
                {pageMetrics.stalled === 1 ? "parado" : "parados"} ≥3d
              </span>
            ) : null}
          </div>
          {loading ? (
            <div className="p-5">
              <LoadingState rows={6} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              reason={hasFilters ? "no-results" : "first-use"}
              eyebrow={hasFilters ? "Busca sem correspondência" : "Comece sua carteira"}
              title={
                hasFilters
                  ? "Nenhum lead corresponde aos filtros"
                  : "Nenhum lead cadastrado"
              }
              description={
                hasFilters
                  ? "Ajuste os filtros para ampliar a busca."
                  : "Cadastre o primeiro lead para iniciar a operação comercial."
              }
              action={
                hasFilters ? (
                  <button
                    type="button"
                    className="atlas-button-secondary"
                    onClick={resetFilters}
                  >
                    Limpar filtros
                  </button>
                ) : (
                  <Link href="/leads/new" className="atlas-button-primary">
                    Criar lead
                  </Link>
                )
              }
            />
          ) : (
            <>
              <div className="atlas-leads-desktop">
                <table>
                  <thead>
                    <tr>
                      {canTransfer ? (
                        <th>
                          <input
                            type="checkbox"
                            aria-label="Selecionar página"
                            className={`accent-[var(--atlas-accent)] ${focusRing}`}
                            checked={
                              items.length > 0 &&
                              items.every((lead) => selected.has(lead.id))
                            }
                            onChange={(event) =>
                              setSelected(
                                event.target.checked
                                  ? new Set(items.map((lead) => lead.id))
                                  : new Set(),
                              )
                            }
                          />
                        </th>
                      ) : null}
                      <th>Lead</th>
                      <th>Projeto e origem</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Corretor</th>
                      <th>Último contato</th>
                      <th>Próxima ação</th>
                      <th>
                        <span className="sr-only">Ações rápidas</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((lead) => {
                      const due = dueLabel(lead.next_action_at, referenceTime);
                      const contact = phoneLinks(lead.phone);
                      const hot = isHotLead(lead);
                      const stall = stalledSignal(lead, referenceTime);
                      const stallView = stall
                        ? stalledChipView(stall, lead)
                        : null;
                      return (
                        <tr
                          key={lead.id}
                          data-overdue={due.overdue ? "true" : "false"}
                          className={
                            due.overdue
                              ? "group bg-rose-500/[0.04]"
                              : "group"
                          }
                        >
                          {canTransfer ? (
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Selecionar ${lead.name || "lead"}`}
                                className={`accent-[var(--atlas-accent)] ${focusRing}`}
                                checked={selected.has(lead.id)}
                                onChange={(event) =>
                                  setSelected((current) => {
                                    const next = new Set(current);
                                    if (event.target.checked) next.add(lead.id);
                                    else next.delete(lead.id);
                                    return next;
                                  })
                                }
                              />
                            </td>
                          ) : null}
                          <td>
                            <Link
                              href={`/leads/${lead.id}`}
                              className={`rounded-lg ${focusRing}`}
                            >
                              <span className="atlas-lead-avatar">
                                {(lead.name || "L").slice(0, 2).toUpperCase()}
                              </span>
                              <span>
                                <strong>{lead.name || "Lead sem nome"}</strong>
                                <small>
                                  {lead.phone ||
                                    lead.email ||
                                    "Contato não informado"}
                                </small>
                              </span>
                            </Link>
                          </td>
                          <td>
                            <strong>{projectName(lead)}</strong>
                            <small>
                              {lead.source || "Origem não informada"}
                            </small>
                            {lead.source === "Meta Lead Ads" ? (
                              <span className="mt-1 flex flex-wrap gap-1">
                                <StatusBadge
                                  tone={
                                    lead.metadata?.meta?.dataSharingConsent
                                      ? "success"
                                      : "info"
                                  }
                                >
                                  <span
                                    title={`${
                                      lead.metadata?.meta?.dataSharingConsent
                                        ? "Sinal de aprendizado ativo"
                                        : "Sem sinal de aprendizado"
                                    } · Campanha ${
                                      lead.metadata?.meta?.campaignId ||
                                      "não identificada"
                                    }`}
                                  >
                                    META
                                  </span>
                                </StatusBadge>
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <StatusBadge tone={statusTone(lead.status)}>
                              {lead.status || "novo"}
                            </StatusBadge>
                          </td>
                          <td>
                            <span
                              className="atlas-score-cell"
                              data-tone={hot ? "danger" : scoreTone(lead.score)}
                              title={
                                hot
                                  ? `Lead quente — score ${lead.score ?? 0}${
                                      (lead.temperature ?? "").toLowerCase() ===
                                      "quente"
                                        ? " · temperatura quente"
                                        : ""
                                    }`
                                  : `Score ${lead.score ?? 0}`
                              }
                            >
                              {lead.score ?? 0}
                            </span>
                          </td>
                          <td>
                            {lead.assigned_to ? (
                              <span className="atlas-broker-name">
                                {profileMap.get(lead.assigned_to) ||
                                  "Responsável vinculado"}
                              </span>
                            ) : (
                              <StatusBadge tone="warning">
                                Sem responsável
                              </StatusBadge>
                            )}
                          </td>
                          <td>
                            {stallView ? (
                              <span
                                className={`cc6-chip ${stallView.chipClass}`}
                                title={stallView.title}
                              >
                                {stallView.label}
                              </span>
                            ) : (
                              <span className="atlas-date-cell cc6-num">
                                {formatDate(
                                  lead.last_interaction_at || lead.updated_at,
                                )}
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              className="atlas-next-action"
                              data-overdue={due.overdue ? "true" : "false"}
                            >
                              {due.label}
                            </span>
                          </td>
                          <td>
                            <div
                              className="atlas-kanban-primary-actions pointer-events-none min-w-max opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 motion-safe:transition-opacity motion-safe:duration-150"
                              style={{ marginTop: 0 }}
                              role="group"
                              aria-label={`Ações rápidas para ${lead.name || "lead"}`}
                            >
                              <Link
                                href={`/leads/${lead.id}`}
                                title="Abrir Lead 360"
                                className={focusRing}
                                aria-label={`Abrir Lead 360 de ${lead.name || "lead"}`}
                              >
                                👁️
                              </Link>
                              {contact ? (
                                <a
                                  href={contact.call}
                                  title="Ligar"
                                  className={focusRing}
                                  aria-label={`Ligar para ${lead.name || "lead"}`}
                                >
                                  📞
                                </a>
                              ) : null}
                              {contact ? (
                                <a
                                  href={contact.whatsapp}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="WhatsApp"
                                  className={focusRing}
                                  aria-label={`Abrir WhatsApp com ${lead.name || "lead"}`}
                                >
                                  💬
                                </a>
                              ) : null}
                              <Link
                                href={`/leads/${lead.id}/messages`}
                                title="Abordagem com IA"
                                className={focusRing}
                                aria-label={`Preparar abordagem com IA para ${lead.name || "lead"}`}
                              >
                                ✦
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="atlas-leads-mobile">
                {items.map((lead) => {
                  const due = dueLabel(lead.next_action_at, referenceTime);
                  const contact = phoneLinks(lead.phone);
                  const hot = isHotLead(lead);
                  const stall = stalledSignal(lead, referenceTime);
                  const stallView = stall ? stalledChipView(stall, lead) : null;
                  return (
                    <div
                      key={lead.id}
                      className="grid gap-3 border-t border-white/[0.06] px-0.5 py-4 first:border-t-0"
                      data-overdue={due.overdue ? "true" : "false"}
                    >
                      <Link
                        href={`/leads/${lead.id}`}
                        className={`atlas-mobile-lead-head min-h-11 rounded-lg ${focusRing}`}
                        aria-label={`Abrir Lead 360 de ${lead.name || "lead"}`}
                      >
                        <span className="atlas-lead-avatar">
                          {(lead.name || "L").slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          <strong>{lead.name || "Lead sem nome"}</strong>
                          <small>{projectName(lead)}</small>
                        </span>
                        <span
                          className="atlas-score-cell"
                          data-tone={hot ? "danger" : scoreTone(lead.score)}
                          title={
                            hot
                              ? `Lead quente — score ${lead.score ?? 0}`
                              : `Score ${lead.score ?? 0}`
                          }
                        >
                          {lead.score ?? 0}
                        </span>
                      </Link>
                      <div className="atlas-mobile-lead-meta">
                        <StatusBadge tone={statusTone(lead.status)}>
                          {lead.status || "novo"}
                        </StatusBadge>
                        {lead.source === "Meta Lead Ads" ? (
                          <StatusBadge
                            tone={
                              lead.metadata?.meta?.dataSharingConsent
                                ? "success"
                                : "warning"
                            }
                          >
                            {lead.metadata?.meta?.dataSharingConsent
                              ? "META · APRENDENDO"
                              : "META · SEM SINAL"}
                          </StatusBadge>
                        ) : null}
                        {lead.assigned_to ? (
                          <span>
                            {profileMap.get(lead.assigned_to) ||
                              "Responsável vinculado"}
                          </span>
                        ) : (
                          <StatusBadge tone="warning">
                            Sem responsável
                          </StatusBadge>
                        )}
                      </div>
                      <div className="atlas-mobile-lead-footer">
                        {stallView ? (
                          <span
                            className={`cc6-chip ${stallView.chipClass}`}
                            title={stallView.title}
                          >
                            {stallView.label}
                          </span>
                        ) : (
                          <span className="cc6-num">
                            {formatDate(
                              lead.last_interaction_at || lead.updated_at,
                            )}
                          </span>
                        )}
                        <span
                          className="atlas-next-action"
                          data-overdue={due.overdue ? "true" : "false"}
                        >
                          {due.label}
                        </span>
                      </div>
                      <div
                        className="atlas-leads-action-buttons"
                        role="group"
                        aria-label={`Ações rápidas para ${lead.name || "lead"}`}
                      >
                        <Link
                          href={`/leads/${lead.id}`}
                          aria-label={`Abrir Lead 360 de ${lead.name || "lead"}`}
                        >
                          👁️ Lead 360
                        </Link>
                        {contact ? (
                          <a
                            href={contact.call}
                            aria-label={`Ligar para ${lead.name || "lead"}`}
                          >
                            📞 Ligar
                          </a>
                        ) : null}
                        {contact ? (
                          <a
                            href={contact.whatsapp}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Abrir WhatsApp com ${lead.name || "lead"}`}
                          >
                            💬 WhatsApp
                          </a>
                        ) : null}
                        <Link
                          href={`/leads/${lead.id}/messages`}
                          aria-label={`Preparar abordagem com IA para ${lead.name || "lead"}`}
                        >
                          ✦ IA
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {!loading && items.length ? (
            <div className="atlas-pagination">
              <button
                type="button"
                className={focusRing}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                ← Anterior
              </button>
              <span>
                Página <strong className="cc6-num">{page}</strong> de{" "}
                <strong className="cc6-num">{pages}</strong>
              </span>
              <button
                type="button"
                className={focusRing}
                disabled={page >= pages}
                onClick={() =>
                  setPage((current) => Math.min(pages, current + 1))
                }
              >
                Próxima →
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
