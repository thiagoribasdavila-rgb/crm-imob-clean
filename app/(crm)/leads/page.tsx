"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LIVE_PROFILE_SELECT, mapLegacyProfile, mapLegacyProject } from "@/lib/compat/legacy-v2";
import { EmptyState } from "@/components/atlas/empty-state";
import { ErrorState } from "@/components/atlas/error-state";
import { LoadingState } from "@/components/atlas/loading-state";
import { MetricCard } from "@/components/atlas/metric-card";
import { StatusBadge } from "@/components/atlas/status-badge";
import { AtlasDetailDisclosure } from "@/components/atlas/information-primitives";
import { ATLAS_RELIABLE_STATE_CONTRACT } from "@/components/atlas/reliable-state";
import {
  ATLAS_ADAPTIVE_DENSITY_CONTRACT,
  ATLAS_DECISION_CARD_CONTRACT,
  ATLAS_PROGRESSIVE_DECISION_CONTRACT,
} from "@/components/ui/AtlasCard";

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
type QualityFilter = "" | "missing_project" | "missing_campaign" | "missing_source";
type LeadPriorityTone = "danger" | "warning" | "info";
type LeadPriority = {
  lead: Lead;
  label: string;
  detail: string;
  tone: LeadPriorityTone;
  rank: number;
};
type FirstActionOutcome =
  | "contacted"
  | "no_response"
  | "meeting_scheduled"
  | "follow_up_needed"
  | "not_interested";
type SavedLeadFilters = {
  search?: string;
  status?: string;
  source?: string;
  project?: string;
  campaign?: string;
  broker?: string;
  score?: string;
  attention?: AttentionFilter;
  quality?: QualityFilter;
  nextAction?: NextActionFilter;
  sort?: string;
  direction?: SortDirection;
  filtersOpen?: boolean;
};
type LeadsDecision = {
  tone: "neutral" | "info" | "success" | "warning" | "danger" | "violet";
  badge: string;
  title: string;
  description: string;
  evidence: string;
  nextStep: string;
  primaryLabel: string;
  action: "filter" | "reset" | "href" | "none";
  href?: string;
  filter?: AttentionFilter;
  aiPrompt: string;
};
type LeadsV30Signal = {
  id: "sla" | "intent" | "coverage" | "memory";
  tone: LeadsDecision["tone"];
  eyebrow: string;
  value: string;
  label: string;
  detail: string;
  actionLabel: string;
  action: "filter" | "href" | "ai" | "none";
  filter?: AttentionFilter;
  href?: string;
  aiPrompt: string;
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

function nextBusinessActionInput() {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  value.setMinutes(0, 0, 0);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
const FILTER_STORAGE_KEY = "atlas:leads-filters:v1";
const uuidPattern = /^[0-9a-f-]{36}$/i;
const qualityFilterLabels: Record<Exclude<QualityFilter, "">, string> = {
  missing_project: "Leads sem projeto",
  missing_campaign: "Leads sem campanha",
  missing_source: "Leads sem origem",
};
const attentionFilterLabels: Record<Exclude<AttentionFilter, "">, string> = {
  overdue: "Ações atrasadas",
  no_action: "Leads sem próxima ação",
  hot: "Leads prioritárias",
  unassigned: "Leads sem responsável",
};

function isQualityFilter(value: string | null): value is Exclude<QualityFilter, ""> {
  return (
    value === "missing_project" ||
    value === "missing_campaign" ||
    value === "missing_source"
  );
}

function isAttentionFilter(value: string | null): value is Exclude<AttentionFilter, ""> {
  return value === "overdue" || value === "no_action" || value === "hot" || value === "unassigned";
}
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

function isKnownLeadStatus(value: string | null | undefined): value is Exclude<(typeof statuses)[number]["value"], ""> {
  return Boolean(value && statuses.some((status) => status.value === value));
}

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
  const hot =
    Number(lead.score ?? 0) >= 70 ||
    (lead.temperature ?? "").toLowerCase() === "quente";

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
  const [createdAfter, setCreatedAfter] = useState("");
  const [createdBefore, setCreatedBefore] = useState("");
  const [project, setProject] = useState("");
  const [campaign, setCampaign] = useState("");
  const [broker, setBroker] = useState("");
  const [score, setScore] = useState("");
  const [attention, setAttention] = useState<AttentionFilter>("");
  const [quality, setQuality] = useState<QualityFilter>("");
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
  const [firstActionLeadId, setFirstActionLeadId] = useState("");
  const [firstActionType, setFirstActionType] = useState("call");
  const [firstActionOutcome, setFirstActionOutcome] =
    useState<FirstActionOutcome>("contacted");
  const [firstActionNote, setFirstActionNote] = useState("");
  const [firstActionNextTitle, setFirstActionNextTitle] =
    useState("Retornar contato");
  const [firstActionNextAt, setFirstActionNextAt] = useState(() =>
    nextBusinessActionInput(),
  );
  const [firstActionSaving, setFirstActionSaving] = useState(false);
  const [firstActionError, setFirstActionError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const reportPeriodLabel = createdAfter
    ? `${formatDate(createdAfter)}${createdBefore ? ` até ${formatDate(createdBefore)}` : ""}`
    : "";

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
        setCampaign(filters.campaign || "");
        setBroker(filters.broker || "");
        setScore(filters.score || "");
        setAttention(filters.attention || "");
        setQuality(filters.quality || "");
        setNextAction(filters.nextAction || "");
        setSort(filters.sort || "created_at");
        setDirection(filters.direction === "asc" ? "asc" : "desc");
        setFiltersOpen(Boolean(filters.filtersOpen));
      }

      // A report may open a precise review queue. URL filters take precedence
      // over the saved workspace, so the user sees the requested evidence.
      const url = new URL(window.location.href);
      const requestedQuality = url.searchParams.get("quality");
      const requestedAttention = url.searchParams.get("attention");
      const requestedStatus = url.searchParams.get("status")?.trim();
      const requestedProject = url.searchParams.get("project")?.trim();
      const requestedCampaign = url.searchParams.get("campaign")?.trim();
      const requestedBroker = url.searchParams.get("broker")?.trim();
      const requestedSource = url.searchParams.get("source")?.trim();
      const requestedCreatedAfter = url.searchParams.get("created_after")?.trim();
      const requestedCreatedBefore = url.searchParams.get("created_before")?.trim();
      const normalizedCreatedAfter = requestedCreatedAfter && Number.isFinite(Date.parse(requestedCreatedAfter))
        ? new Date(requestedCreatedAfter).toISOString()
        : "";
      const normalizedCreatedBefore = requestedCreatedBefore && Number.isFinite(Date.parse(requestedCreatedBefore))
        ? new Date(requestedCreatedBefore).toISOString()
        : "";

      // A report drilldown is an explicit request for evidence. It must not
      // inherit a previous workspace filter and silently hide part of the
      // requested portfolio.
      const hasReportDrilldown = Boolean(
          isQualityFilter(requestedQuality) ||
          isAttentionFilter(requestedAttention) ||
          isKnownLeadStatus(requestedStatus) ||
          requestedProject ||
          (requestedCampaign && uuidPattern.test(requestedCampaign)) ||
          requestedBroker ||
          requestedSource ||
          normalizedCreatedAfter ||
          normalizedCreatedBefore,
      );
      if (hasReportDrilldown) {
        setSearch("");
        setDebouncedSearch("");
        setStatus("");
        setSource("");
        setCreatedAfter("");
        setCreatedBefore("");
        setProject("");
        setCampaign("");
        setBroker("");
        setScore("");
        setAttention("");
        setQuality("");
        setNextAction("");
      }
      if (isQualityFilter(requestedQuality)) setQuality(requestedQuality);
      if (isAttentionFilter(requestedAttention)) setAttention(requestedAttention);
      if (isKnownLeadStatus(requestedStatus)) setStatus(requestedStatus);
      if (requestedProject) setProject(requestedProject);
      if (requestedCampaign && uuidPattern.test(requestedCampaign))
        setCampaign(requestedCampaign);
      if (requestedBroker) setBroker(requestedBroker);
      if (requestedSource) setSource(requestedSource);
      if (normalizedCreatedAfter) setCreatedAfter(normalizedCreatedAfter);
      if (normalizedCreatedBefore) setCreatedBefore(normalizedCreatedBefore);
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
      campaign,
      broker,
      score,
      attention,
      quality,
      nextAction,
      sort,
      direction,
      filtersOpen,
    };
    window.sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    attention,
    broker,
    campaign,
    direction,
    filtersHydrated,
    filtersOpen,
    nextAction,
    project,
    quality,
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
        if (createdAfter) params.set("created_after", createdAfter);
        if (createdBefore) params.set("created_before", createdBefore);
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
        if (campaign) params.set("campaign_ids", campaign);
        if (score === "hot") params.set("min_score", "70");
        if (score === "warm") {
          params.set("min_score", "40");
          params.set("max_score", "69");
        }
        if (score === "cold") params.set("max_score", "39");
        if (attention) params.set("attention", attention);
        if (quality) params.set("quality", quality);
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
    campaign,
    createdAfter,
    createdBefore,
    debouncedSearch,
    direction,
    nextAction,
    page,
    profiles,
    project,
    quality,
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

  const campaignNameMap = useMemo(
    () =>
      new Map(
        campaigns.map((campaign) => [
          String(campaign.id),
          text(campaign, "name") || "Campanha sem nome",
        ]),
      ),
    [campaigns],
  );

  const selectedCampaignName = campaign
    ? campaignNameMap.get(campaign) || "campanha selecionada"
    : "";

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

  const selectedProjectName = project
    ? developmentMap.get(project) || "projeto selecionado"
    : "";
  const selectedBrokerName = broker
    ? profileMap.get(broker) || "corretor selecionado"
    : "";

  const projectName = (lead: Lead) => {
    const developmentId =
      lead.development_id ||
      (lead.campaign_id ? campaignMap.get(lead.campaign_id) : "");
    return developmentId
      ? developmentMap.get(developmentId) || "Projeto não identificado"
      : "Sem projeto";
  };

  const pageMetrics = useMemo(
    () => ({
      hot: items.filter(
        (lead) =>
          Number(lead.score ?? 0) >= 70 || lead.temperature === "quente",
      ).length,
      unassigned: items.filter((lead) => !lead.assigned_to).length,
      overdue: items.filter((lead) => {
        if (!lead.next_action_at || !referenceTime) return false;
        return new Date(lead.next_action_at).getTime() < referenceTime;
      }).length,
    }),
    [items, referenceTime],
  );

  const leadsV30Signals = useMemo(() => {
    const noNextAction = items.filter((lead) => !lead.next_action_at).length;
    const routed = items.filter((lead) => Boolean(lead.assigned_to)).length;
    const withContact = items.filter(
      (lead) => Boolean(lead.phone) || Boolean(lead.email),
    ).length;
    const metaLearning = items.filter(
      (lead) =>
        lead.source === "Meta Lead Ads" &&
        Boolean(lead.metadata?.meta?.dataSharingConsent),
    ).length;
    const actionCoverage = items.length
      ? Math.round(((items.length - noNextAction) / items.length) * 100)
      : 0;
    const ownershipCoverage = items.length
      ? Math.round((routed / items.length) * 100)
      : 0;
    const contactCoverage = items.length
      ? Math.round((withContact / items.length) * 100)
      : 0;
    const memoryCoverage = items.length
      ? Math.round((metaLearning / items.length) * 100)
      : 0;
    const decisionScore = items.length
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              actionCoverage * 0.34 +
                ownershipCoverage * 0.24 +
                contactCoverage * 0.24 +
                Math.min(100, memoryCoverage * 2) * 0.18,
            ),
          ),
        )
      : 0;

    const signals: LeadsV30Signal[] = [
      {
        id: "sla",
        tone: pageMetrics.overdue ? "danger" : "success",
        eyebrow: "Agora",
        value: String(pageMetrics.overdue),
        label: pageMetrics.overdue
          ? "SLA vencido antes de tudo"
          : "Sem atraso crítico",
        detail: pageMetrics.overdue
          ? "A primeira decisão é recuperar follow-ups vencidos."
          : "A carteira visível não tem follow-up vencido.",
        actionLabel: pageMetrics.overdue ? "Ver atrasados" : "Manter cadência",
        action: pageMetrics.overdue ? "filter" : "ai",
        filter: "overdue",
        aiPrompt:
          "Leia a carteira visível e crie uma cadência simples para manter follow-ups em dia, sem executar ações automaticamente.",
      },
      {
        id: "intent",
        tone: pageMetrics.hot ? "danger" : "info",
        eyebrow: "Intenção",
        value: String(pageMetrics.hot),
        label: pageMetrics.hot
          ? "Leads quentes exigem contato"
          : "Sem pico quente nesta página",
        detail: pageMetrics.hot
          ? "Priorize contato humano com contexto de projeto."
          : "Use filtros de score para encontrar oportunidades em outro recorte.",
        actionLabel: pageMetrics.hot ? "Ver quentes" : "Abrir pipeline",
        action: pageMetrics.hot ? "filter" : "href",
        filter: "hot",
        href: "/pipeline",
        aiPrompt:
          "Prepare uma leitura de leads quentes com argumentos curtos por projeto, sem enviar mensagens automaticamente.",
      },
      {
        id: "coverage",
        tone:
          actionCoverage >= 80
            ? "success"
            : actionCoverage >= 50
              ? "warning"
              : "danger",
        eyebrow: "Próxima ação",
        value: `${actionCoverage}%`,
        label: "Cobertura de follow-up",
        detail: `${noNextAction} lead(s) ainda sem próxima ação na página.`,
        actionLabel: noNextAction ? "Ver sem ação" : "Revisar rotina",
        action: noNextAction ? "filter" : "ai",
        filter: "no_action",
        aiPrompt:
          "Identifique como aumentar a cobertura de próximas ações da carteira visível e sugira uma rotina de 15 minutos para o corretor.",
      },
      {
        id: "memory",
        tone:
          memoryCoverage >= 70
            ? "success"
            : memoryCoverage >= 30
              ? "warning"
              : "info",
        eyebrow: "Memória IA",
        value: `${memoryCoverage}%`,
        label: "Sinais úteis para aprendizado",
        detail: `${metaLearning} lead(s) Meta com consentimento/sinal de aprendizagem nesta página.`,
        actionLabel: "Pedir diagnóstico",
        action: "ai",
        aiPrompt:
          "Explique como melhorar a memória comercial e os sinais enviados para aprendizado do Meta/Andromeda usando somente dados autorizados desta carteira.",
      },
    ];

    return {
      actionCoverage,
      contactCoverage,
      decisionScore,
      memoryCoverage,
      noNextAction,
      ownershipCoverage,
      signals,
    };
  }, [items, pageMetrics.hot, pageMetrics.overdue]);

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
    createdAfter ||
    createdBefore ||
    project ||
    campaign ||
    broker ||
    score ||
    attention ||
    quality ||
    nextAction,
  );
  const activeFilterCount = [
    search.trim(),
    status,
    source,
    createdAfter,
    createdBefore,
    project,
    campaign,
    broker,
    score,
    attention,
    quality,
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
  const leadingPriority = visiblePriorityQueue[0] ?? null;
  const leadDecision: LeadsDecision = (() => {
    if (error) {
      return {
        tone: "danger",
        badge: "Carteira em atenção",
        title: "Recupere a leitura antes de decidir",
        description:
          "O Atlas encontrou uma inconsistência ao carregar a carteira. A prioridade é limpar o recorte e voltar para uma leitura segura.",
        evidence: "Filtros e dados continuam protegidos.",
        nextStep: "Limpar filtros e tentar novamente.",
        primaryLabel: "Limpar filtros",
        action: "reset",
        aiPrompt:
          "Explique um plano seguro para recuperar a leitura da carteira de leads sem perder dados, sem executar ações no CRM.",
      };
    }
    if (loading) {
      return {
        tone: "info",
        badge: "Sincronizando",
        title: "Lendo a carteira comercial",
        description:
          "O Atlas está cruzando filtros, responsáveis, próximas ações e sinais de score para mostrar a melhor decisão.",
        evidence: "Consulta em andamento.",
        nextStep: "Aguardar a sincronização.",
        primaryLabel: "Sincronizando",
        action: "none",
        aiPrompt:
          "Prepare um roteiro de leitura para a carteira de leads quando os dados terminarem de sincronizar.",
      };
    }
    if (!total && !hasFilters) {
      return {
        tone: "success",
        badge: "Primeira carteira",
        title: "Cadastre ou importe leads para iniciar operação",
        description:
          "A tela está pronta. O próximo ganho operacional vem de colocar leads reais na carteira e registrar próximas ações.",
        evidence: "Nenhum lead encontrado no escopo atual.",
        nextStep: "Criar lead ou importar uma base autorizada.",
        primaryLabel: "Criar primeiro lead",
        action: "href",
        href: "/leads/new",
        aiPrompt:
          "Crie um checklist simples para iniciar uma carteira comercial imobiliária com leads reais e próximas ações.",
      };
    }
    if (!total && hasFilters) {
      return {
        tone: "warning",
        badge: "Filtro estreito",
        title: "Amplie a busca para encontrar oportunidades",
        description:
          "Nenhum lead apareceu com o recorte atual. O caminho mais rápido é limpar filtros e voltar para a visão de carteira.",
        evidence: `${activeFilterCount} filtro(s) avançado(s) ativo(s).`,
        nextStep: "Limpar filtros ou trocar período/status.",
        primaryLabel: "Limpar filtros",
        action: "reset",
        aiPrompt:
          "Sugira uma forma objetiva de revisar filtros de leads para encontrar oportunidades ocultas, sem alterar dados.",
      };
    }
    if (pageMetrics.overdue > 0) {
      return {
        tone: "danger",
        badge: "SLA em risco",
        title: "Resolver follow-ups vencidos primeiro",
        description:
          "A maior perda de conversão vem de lead esperando retorno. Priorize os atrasados antes de abrir novas buscas.",
        evidence: `${pageMetrics.overdue} ação(ões) atrasada(s) nesta página.`,
        nextStep: "Filtrar atrasados, abrir o primeiro lead e registrar resultado.",
        primaryLabel: "Ver atrasados",
        action: "filter",
        filter: "overdue",
        aiPrompt:
          "Monte um plano de recuperação para os follow-ups vencidos da carteira visível, priorizando conversão e respeito ao histórico do cliente.",
      };
    }
    if (currentRole !== "broker" && pageMetrics.unassigned > 0) {
      return {
        tone: "warning",
        badge: "Distribuição",
        title: "Distribuir leads sem responsável",
        description:
          "Lead sem dono perde velocidade. A gestão deve atribuir rapidamente sem quebrar histórico ou duplicar atendimento.",
        evidence: `${pageMetrics.unassigned} lead(s) sem responsável nesta página.`,
        nextStep: "Filtrar sem responsável e distribuir para corretor elegível.",
        primaryLabel: "Ver sem responsável",
        action: "filter",
        filter: "unassigned",
        aiPrompt:
          "Crie uma recomendação de distribuição para leads sem responsável, considerando carga do time, projeto e urgência.",
      };
    }
    if (pageMetrics.hot > 0) {
      return {
        tone: "danger",
        badge: "Alta intenção",
        title: "Atacar leads quentes agora",
        description:
          "A carteira tem sinais de compra. A próxima ação deve ser contato humano rápido com contexto de projeto e objeções.",
        evidence: `${pageMetrics.hot} lead(s) quente(s) nesta página.`,
        nextStep: "Filtrar quentes e preparar abordagem com IA.",
        primaryLabel: "Ver quentes",
        action: "filter",
        filter: "hot",
        aiPrompt:
          "Prepare abordagens curtas para leads quentes da carteira visível, explicando o motivo da prioridade e sem enviar mensagens automaticamente.",
      };
    }
    if (leadingPriority) {
      return {
        tone: leadingPriority.tone,
        badge: "Próxima melhor ação",
        title: `${leadingPriority.label}: ${leadingPriority.lead.name || "Lead sem nome"}`,
        description: leadingPriority.detail,
        evidence: `${projectName(leadingPriority.lead)} · score ${leadingPriority.lead.score ?? 0}.`,
        nextStep: "Abrir Lead 360 e concluir a próxima ação.",
        primaryLabel: "Abrir lead prioritário",
        action: "href",
        href: `/leads/${leadingPriority.lead.id}`,
        aiPrompt:
          "Prepare a melhor próxima ação para o lead prioritário, considerando projeto, score, origem, etapa e histórico visível.",
      };
    }
    return {
      tone: "success",
      badge: "Carteira saudável",
      title: "Carteira em ordem no recorte atual",
      description:
        "Não há pendência crítica nesta página. Continue avançando oportunidades por score, projeto e última interação.",
      evidence: `${items.length} lead(s) visível(is) no recorte atual.`,
      nextStep: "Abrir pipeline ou revisar oportunidades por score.",
      primaryLabel: "Abrir pipeline",
      action: "href",
      href: "/pipeline",
      aiPrompt:
        "Analise a carteira saudável e indique até três oportunidades de melhoria para aumentar conversão sem gerar trabalho desnecessário.",
    };
  })();

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

  function openFirstAction(leadId: string) {
    setFirstActionLeadId((current) => (current === leadId ? "" : leadId));
    setFirstActionType("call");
    setFirstActionOutcome("contacted");
    setFirstActionNote("");
    setFirstActionNextTitle("Retornar contato");
    setFirstActionNextAt(nextBusinessActionInput());
    setFirstActionError("");
  }

  async function registerFirstAction(lead: Lead) {
    if (firstActionSaving) return;
    setFirstActionSaving(true);
    setFirstActionError("");
    setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para registrar a ação.");

      const nextTimestamp = Date.parse(firstActionNextAt);
      if (!Number.isFinite(nextTimestamp) || nextTimestamp <= Date.now()) {
        throw new Error("Escolha uma data futura para a próxima ação.");
      }

      const response = await fetch(`/api/v1/leads/${lead.id}/first-action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `first-action:${lead.id}:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          actionType: firstActionType,
          outcome: firstActionOutcome,
          note: firstActionNote,
          nextActionTitle: firstActionNextTitle,
          nextActionAt: new Date(nextTimestamp).toISOString(),
          humanConfirmed: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message || "Não foi possível registrar a ação.");
      }

      setFirstActionLeadId("");
      setNotice(
        `Ação registrada para ${lead.name || "a lead"}. A próxima tarefa já está na agenda e a fila foi atualizada.`,
      );
      setReloadKey((current) => current + 1);
    } catch (actionError) {
      setFirstActionError(
        actionError instanceof Error
          ? actionError.message
          : "Não foi possível registrar a ação.",
      );
    } finally {
      setFirstActionSaving(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setSource("");
    setCreatedAfter("");
    setCreatedBefore("");
    setProject("");
    setCampaign("");
    setBroker("");
    setScore("");
    setAttention("");
    setQuality("");
    setNextAction("");
    setSort("created_at");
    setDirection("desc");
    // Report drilldowns use URL parameters. Remove them together with the
    // local state so a refresh never silently restores an old report context.
    const url = new URL(window.location.href);
    ["status", "quality", "attention", "project", "campaign", "broker", "source", "created_after", "created_before"].forEach((key) =>
      url.searchParams.delete(key),
    );
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
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

  function clearQualityFilter() {
    setQuality("");
    const url = new URL(window.location.href);
    url.searchParams.delete("quality");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setPage(1);
  }

  function clearAttentionFilter() {
    setAttention("");
    const url = new URL(window.location.href);
    url.searchParams.delete("attention");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setPage(1);
  }

  function clearCampaignFilter() {
    setCampaign("");
    const url = new URL(window.location.href);
    url.searchParams.delete("campaign");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setPage(1);
  }

  function clearReportPeriod() {
    setCreatedAfter("");
    setCreatedBefore("");
    const url = new URL(window.location.href);
    url.searchParams.delete("created_after");
    url.searchParams.delete("created_before");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setPage(1);
  }

  function clearProjectFilter() {
    setProject("");
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setPage(1);
  }

  function clearBrokerFilter() {
    setBroker("");
    const url = new URL(window.location.href);
    url.searchParams.delete("broker");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setPage(1);
  }

  function clearSourceFilter() {
    setSource("");
    setCreatedAfter("");
    setCreatedBefore("");
    const url = new URL(window.location.href);
    url.searchParams.delete("source");
    url.searchParams.delete("created_after");
    url.searchParams.delete("created_before");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setPage(1);
  }

  return (
    <div
      className="space-y-5 pb-10"
      data-reliable-state-contract={ATLAS_RELIABLE_STATE_CONTRACT}
      data-phase="36-leads-action-workspace"
      data-v30-phase="129-leads-customers-v30-decision-layer"
      data-leads-layout="action-first"
    >
      <section className="atlas-leads-hero atlas-leads-hero-compact" data-page-header="decision" data-primary-action-count="1">
        <div className="atlas-leads-source-filter">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">LEADS INTELLIGENCE</StatusBadge>
            <StatusBadge tone="success">TENANT-SAFE</StatusBadge>
            <StatusBadge tone="violet">LEAD 360</StatusBadge>
            {currentRole === "broker" ? (
              <StatusBadge tone="success">CARTEIRA EXCLUSIVA</StatusBadge>
            ) : null}
            {currentRole === "manager" ? (
              <StatusBadge tone="success">
                MEU TIME · {teamBrokers.length} CORRETORES
              </StatusBadge>
            ) : null}
          </div>
          <h1>
            {currentRole === "broker"
              ? "Sua fila de leads, pronta para agir."
              : "Leads que exigem decisão agora."}
          </h1>
          <p>
            {currentRole === "broker"
              ? "Prioridades e próximas ações da sua carteira, sem misturar leads de outros corretores."
              : "Prioridades do escopo autorizado, distribuição rastreável e próxima ação em uma visão compacta."}
          </p>
          <div className="atlas-command-actions">
            <Link href="/leads/new" className="atlas-button-primary">
              + Novo lead
            </Link>
            <Link href="/pipeline" className="atlas-button-secondary">
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
                              campaign,
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
        <div className="atlas-leads-total">
          <span>Base filtrada</span>
          <strong>{loading ? "—" : total}</strong>
          <small>
            {hasFilters
              ? "resultado dos filtros atuais"
              : currentRole === "broker"
                ? "somente a sua carteira"
                : "somente seu escopo comercial"}
          </small>
        </div>
      </section>

      <section
        className="atlas-leads-decision-cockpit"
        data-phase="104-leads-action-cockpit"
        data-tone={leadDecision.tone}
        aria-label="Decisão principal da carteira de leads"
      >
        <div className="atlas-leads-decision-main">
          <StatusBadge tone={leadDecision.tone}>{leadDecision.badge}</StatusBadge>
          <h2>{leadDecision.title}</h2>
          <p>{leadDecision.description}</p>
          <div className="atlas-leads-decision-actions">
            {leadDecision.action === "href" && leadDecision.href ? (
              <Link href={leadDecision.href}>{leadDecision.primaryLabel}</Link>
            ) : null}
            {leadDecision.action === "filter" && leadDecision.filter ? (
              <button
                type="button"
                onClick={() =>
                  applyAttention(leadDecision.filter as AttentionFilter)
                }
              >
                {leadDecision.primaryLabel}
              </button>
            ) : null}
            {leadDecision.action === "reset" ? (
              <button type="button" onClick={resetFilters}>
                {leadDecision.primaryLabel}
              </button>
            ) : null}
            {leadDecision.action === "none" ? (
              <button type="button" disabled>
                {leadDecision.primaryLabel}
              </button>
            ) : null}
            <button
              type="button"
              className="atlas-leads-decision-ai"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("atlas:open-copilot", {
                    detail: {
                      prompt: leadDecision.aiPrompt,
                      context: {
                        total,
                        currentRole,
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
              ✦ Pedir orientação
            </button>
          </div>
        </div>
        <div className="atlas-leads-decision-grid">
          {[
            ["Evidência", leadDecision.evidence],
            ["Próximo passo", leadDecision.nextStep],
            [
              "Carteira",
              loading
                ? "Sincronizando"
                : `${items.length} nesta página · ${total} no recorte`,
            ],
            [
              "IA",
              visiblePriorityQueue.length
                ? `${visiblePriorityQueue.length} prioridade(s) explicável(is)`
                : "Sem ação automática",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <AtlasDetailDisclosure label="Ver diagnóstico da carteira">
        <section
          className="atlas-leads-v30-command-strip"
          data-phase="129-leads-customers-v30-decision-layer"
          aria-label="Camada V30 de decisão da carteira de leads"
        >
        <div className="atlas-leads-v30-score-card">
          <div>
            <StatusBadge
              tone={
                leadsV30Signals.decisionScore >= 80
                  ? "success"
                  : leadsV30Signals.decisionScore >= 55
                    ? "warning"
                    : "danger"
              }
            >
              V30 DECISION LAYER
            </StatusBadge>
            <h2>Clareza da carteira</h2>
            <p>
              O Atlas mede se os leads têm dono, contato, próxima ação e sinal
              útil para aprendizado. Quanto mais claro, menos ruído para vender.
            </p>
          </div>
          <strong>{loading ? "—" : `${leadsV30Signals.decisionScore}%`}</strong>
          <span>
            {loading
              ? "Sincronizando sinais"
              : `${leadsV30Signals.ownershipCoverage}% com responsável · ${leadsV30Signals.actionCoverage}% com próxima ação`}
          </span>
        </div>
        <div className="atlas-leads-v30-signal-grid">
          {leadsV30Signals.signals.map((signal) => (
            <article key={signal.id} data-tone={signal.tone}>
              <div>
                <span>{signal.eyebrow}</span>
                <strong>{loading ? "—" : signal.value}</strong>
              </div>
              <h3>{signal.label}</h3>
              <p>{signal.detail}</p>
              {signal.action === "href" && signal.href ? (
                <Link href={signal.href}>{signal.actionLabel}</Link>
              ) : null}
              {signal.action === "filter" && signal.filter ? (
                <button
                  type="button"
                  onClick={() => applyAttention(signal.filter as AttentionFilter)}
                >
                  {signal.actionLabel}
                </button>
              ) : null}
              {signal.action === "ai" ? (
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("atlas:open-copilot", {
                        detail: {
                          prompt: signal.aiPrompt,
                          context: {
                            total,
                            currentRole,
                            signal: signal.id,
                            pageMetrics,
                            leadsV30Signals: {
                              actionCoverage: leadsV30Signals.actionCoverage,
                              contactCoverage: leadsV30Signals.contactCoverage,
                              decisionScore: leadsV30Signals.decisionScore,
                              memoryCoverage: leadsV30Signals.memoryCoverage,
                              noNextAction: leadsV30Signals.noNextAction,
                              ownershipCoverage:
                                leadsV30Signals.ownershipCoverage,
                            },
                          },
                        },
                      }),
                    )
                  }
                >
                  {signal.actionLabel}
                </button>
              ) : null}
              {signal.action === "none" ? <span>Monitorado</span> : null}
            </article>
          ))}
        </div>
        </section>
      </AtlasDetailDisclosure>

      <section
        className="atlas-leads-action-queue"
        aria-labelledby="atlas-leads-action-title"
        aria-live="polite"
        data-phase="36-visible-action-queue"
      >
        <header>
          <div>
            <p>Fila de ação · página atual</p>
            <h2 id="atlas-leads-action-title">O que precisa avançar agora</h2>
          </div>
          <span>
            {loading
              ? "Sincronizando"
              : `${visiblePriorityQueue.length} prioridade(s) visível(is)`}
          </span>
        </header>
        {loading ? (
          <LoadingState rows={3} />
        ) : visiblePriorityQueue.length ? (
          <div className="atlas-leads-action-list">
            {visiblePriorityQueue.slice(0, 3).map((priority, index) => (
              <article
                key={priority.lead.id}
                data-adaptive-density="role-and-device"
                data-adaptive-density-contract={ATLAS_ADAPTIVE_DENSITY_CONTRACT}
                data-decision-contract={ATLAS_DECISION_CARD_CONTRACT}
                data-progressive-contract={ATLAS_PROGRESSIVE_DECISION_CONTRACT}
                data-progressive-reading="decision-context-history"
                data-tone={priority.tone}
              >
                <div className="atlas-leads-action-rank">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <StatusBadge tone={priority.tone}>
                    {priority.label}
                  </StatusBadge>
                </div>
                <div className="atlas-leads-action-copy">
                  <Link href={`/leads/${priority.lead.id}`}>
                    {priority.lead.name || "Lead sem nome"}
                  </Link>
                  <p>{priority.detail}</p>
                  <small>
                    {projectName(priority.lead)} · {priority.lead.status || "novo"}
                  </small>
                </div>
                <div className="atlas-leads-action-buttons">
                  <Link href={`/leads/${priority.lead.id}`}>Abrir lead</Link>
                  <button
                    type="button"
                    aria-expanded={firstActionLeadId === priority.lead.id}
                    onClick={() => openFirstAction(priority.lead.id)}
                  >
                    {firstActionLeadId === priority.lead.id
                      ? "Fechar registro"
                      : "✓ Registrar ação"}
                  </button>
                  <button
                    type="button"
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
                {firstActionLeadId === priority.lead.id ? (
                  <form
                    className="atlas-leads-first-action"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void registerFirstAction(priority.lead);
                    }}
                  >
                    <header>
                      <div>
                        <strong>Registrar e já preparar o próximo passo</strong>
                        <span>
                          Uma confirmação atualiza a lead, preserva o histórico e
                          cria o compromisso seguinte sem duplicidade.
                        </span>
                      </div>
                      <StatusBadge tone="info">AÇÃO ATÔMICA</StatusBadge>
                    </header>
                    <div className="atlas-leads-first-action-grid">
                      <label>
                        <span>Canal usado</span>
                        <select
                          value={firstActionType}
                          onChange={(event) =>
                            setFirstActionType(event.target.value)
                          }
                        >
                          <option value="call">Ligação</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="email">E-mail</option>
                          <option value="meeting">Reunião</option>
                          <option value="visit">Visita</option>
                        </select>
                      </label>
                      <label>
                        <span>Resultado</span>
                        <select
                          value={firstActionOutcome}
                          onChange={(event) =>
                            setFirstActionOutcome(
                              event.target.value as FirstActionOutcome,
                            )
                          }
                        >
                          <option value="contacted">Contato realizado</option>
                          <option value="no_response">Sem resposta</option>
                          <option value="meeting_scheduled">
                            Reunião ou visita marcada
                          </option>
                          <option value="follow_up_needed">
                            Precisa de retorno
                          </option>
                          <option value="not_interested">Sem interesse</option>
                        </select>
                      </label>
                      <label className="atlas-leads-first-action-note">
                        <span>O que aconteceu</span>
                        <textarea
                          required
                          minLength={10}
                          maxLength={1000}
                          rows={3}
                          value={firstActionNote}
                          onChange={(event) =>
                            setFirstActionNote(event.target.value)
                          }
                          placeholder="Registre a resposta, necessidade ou objeção observada."
                        />
                      </label>
                      <label>
                        <span>Próxima ação</span>
                        <input
                          required
                          minLength={3}
                          maxLength={120}
                          value={firstActionNextTitle}
                          onChange={(event) =>
                            setFirstActionNextTitle(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>Quando</span>
                        <input
                          required
                          type="datetime-local"
                          value={firstActionNextAt}
                          onChange={(event) =>
                            setFirstActionNextAt(event.target.value)
                          }
                        />
                      </label>
                    </div>
                    {firstActionError ? (
                      <p role="alert" className="atlas-leads-first-action-error">
                        {firstActionError}
                      </p>
                    ) : null}
                    <button type="submit" disabled={firstActionSaving}>
                      {firstActionSaving
                        ? "Registrando com segurança…"
                        : "Confirmar ação e criar tarefa"}
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="atlas-leads-action-clear">
            <strong>Nenhuma pendência prioritária nesta página</strong>
            <span>
              Use os atalhos de atenção para consultar o restante da carteira.
            </span>
          </div>
        )}
        {!loading && visiblePriorityQueue.length > 3 ? (
          <small className="atlas-leads-action-more">
            + {visiblePriorityQueue.length - 3} prioridade(s) continuam na
            tabela desta página.
          </small>
        ) : null}
      </section>

      <section className="atlas-leads-metrics">
        <MetricCard
          label="Leads encontrados"
          value={loading ? "—" : total}
          detail={`${PAGE_SIZE} por página`}
          trend="BASE"
        />
        <MetricCard
          label="Quentes nesta página"
          value={loading ? "—" : pageMetrics.hot}
          detail="Score ≥ 70 ou temperatura quente"
          trend="HOT"
          tone="danger"
        />
        {currentRole === "manager" ? (
          <MetricCard
            label="Corretores no meu time"
            value={referencesLoading ? "—" : teamBrokers.length}
            detail="Somente subordinados ativos"
            trend="ESCOPO"
            tone="success"
          />
        ) : (
          <MetricCard
            label="Sem responsável"
            value={loading ? "—" : pageMetrics.unassigned}
            detail="Precisam de distribuição"
            trend="AÇÃO"
            tone="warning"
          />
        )}
        <MetricCard
          label="Ações atrasadas"
          value={loading ? "—" : pageMetrics.overdue}
          detail="Follow-up fora do prazo"
          trend="SLA"
          tone="danger"
        />
      </section>

      <section
        className="rounded-[24px] border border-white/[0.07] bg-white/[0.018] p-4 sm:p-5"
        aria-label="Atalhos da rotina comercial"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-sky-300">
              Minha rotina
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Encontre rapidamente onde agir
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Os atalhos consultam toda a carteira dentro do seu escopo
              comercial.
            </p>
          </div>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            role="group"
            aria-label="Filtrar leads que precisam de atenção"
          >
            {(
              [
                ["overdue", "Ações atrasadas", "Resolver follow-ups vencidos"],
                ["no_action", "Sem próxima ação", "Evitar leads esquecidas"],
                ["hot", "Leads quentes", "Atender maior intenção"],
                ...(currentRole !== "broker"
                  ? [
                      [
                        "unassigned",
                        "Sem responsável",
                        "Distribuir para o time",
                      ],
                    ]
                  : []),
              ] as Array<[AttentionFilter, string, string]>
            ).map(([key, label, description]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyAttention(key)}
                aria-pressed={attention === key}
                title={description}
                className={`shrink-0 rounded-xl border px-3 py-2.5 text-left transition ${attention === key ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:text-white"}`}
              >
                <strong className="block text-xs">{label}</strong>
                <span className="mt-0.5 block text-[9px] opacity-60">
                  {description}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        className="atlas-leads-filter-panel"
        data-expanded={filtersOpen ? "true" : "false"}
      >
        {quality ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[.06] px-3 py-2 text-xs text-amber-100"
            role="status"
            data-leads-quality-filter={quality}
          >
            <span>
              Revisão de qualidade: <strong>{qualityFilterLabels[quality]}</strong>. Nenhum dado é alterado automaticamente.
            </span>
            <button type="button" className="font-semibold text-amber-200 underline-offset-2 hover:underline" onClick={clearQualityFilter}>
              Limpar recorte
            </button>
          </div>
        ) : null}
        {attention ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[.06] px-3 py-2 text-xs text-rose-100"
            role="status"
            data-leads-attention-filter={attention}
          >
            <span>
              Prioridade operacional: <strong>{attentionFilterLabels[attention]}</strong>. A lista está ordenada para facilitar a próxima decisão.
            </span>
            <button type="button" className="font-semibold text-rose-200 underline-offset-2 hover:underline" onClick={clearAttentionFilter}>
              Limpar prioridade
            </button>
          </div>
        ) : null}
        {campaign ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-300/20 bg-sky-300/[.06] px-3 py-2 text-xs text-sky-100"
            role="status"
            data-leads-campaign-filter={campaign}
          >
            <span>
              Carteira da campanha: <strong>{selectedCampaignName}</strong>. Você está vendo somente leads vinculadas a este recorte
              {createdAfter ? ` no período de ${reportPeriodLabel}` : ""}.
            </span>
            <span className="flex items-center gap-3">
              {createdAfter ? (
                <button type="button" className="font-semibold text-sky-200 underline-offset-2 hover:underline" onClick={clearReportPeriod}>
                  Ver todo o período
                </button>
              ) : null}
              <button type="button" className="font-semibold text-sky-200 underline-offset-2 hover:underline" onClick={clearCampaignFilter}>
                Ver todas as campanhas
              </button>
            </span>
          </div>
        ) : null}
        {source ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[.06] px-3 py-2 text-xs text-emerald-100"
            role="status"
            data-leads-source-filter={source}
          >
            <span>
              Origem selecionada: <strong>{source}</strong>. A carteira mostra
              somente leads captadas por esta origem{createdAfter ? " dentro do período analisado no relatório" : ""}.
            </span>
            <button
              type="button"
              className="font-semibold text-emerald-200 underline-offset-2 hover:underline"
              onClick={clearSourceFilter}
            >
              {createdAfter ? "Ver todas as origens e períodos" : "Ver todas as origens"}
            </button>
          </div>
        ) : null}
        {project || broker ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[.06] px-3 py-2 text-xs text-violet-100"
            role="status"
            data-leads-report-context="true"
          >
            <span>
              Recorte do relatório:{" "}
              {project ? <strong>{selectedProjectName}</strong> : null}
              {project && broker ? " · " : null}
              {broker ? <strong>{selectedBrokerName}</strong> : null}
              {createdAfter ? ` · período de ${reportPeriodLabel}` : ""}.
            </span>
            <span className="flex items-center gap-3">
              {createdAfter ? (
                <button type="button" className="font-semibold text-violet-200 underline-offset-2 hover:underline" onClick={clearReportPeriod}>
                  Ver todo o período
                </button>
              ) : null}
              {project ? (
                <button type="button" className="font-semibold text-violet-200 underline-offset-2 hover:underline" onClick={clearProjectFilter}>
                  Limpar projeto
                </button>
              ) : null}
              {broker ? (
                <button type="button" className="font-semibold text-violet-200 underline-offset-2 hover:underline" onClick={clearBrokerFilter}>
                  Limpar corretor
                </button>
              ) : null}
            </span>
          </div>
        ) : null}
        {createdAfter && !source && !project && !broker && !campaign ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-300/20 bg-indigo-300/[.06] px-3 py-2 text-xs text-indigo-100"
            role="status"
            data-leads-report-period={createdAfter}
          >
            <span>
              Período do relatório: leads cadastradas de <strong>{reportPeriodLabel}</strong>.
            </span>
            <button type="button" className="font-semibold text-indigo-200 underline-offset-2 hover:underline" onClick={clearReportPeriod}>
              Ver todo o período
            </button>
          </div>
        ) : null}
        <div className="atlas-leads-filter-top">
          <div className="atlas-leads-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, e-mail ou telefone..."
              aria-label="Buscar leads"
            />
            <kbd>⌘ K</kbd>
          </div>
          <button
            type="button"
            className="atlas-filter-toggle"
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
              className="atlas-clear-filters"
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
              value={campaign}
              onChange={(event) => updateFilter(setCampaign, event.target.value)}
              aria-label="Filtrar por campanha"
              disabled={referencesLoading}
            >
              <option value="">Todas as campanhas</option>
              {campaigns.map((campaignItem) => (
                <option key={String(campaignItem.id)} value={String(campaignItem.id)}>
                  {text(campaignItem, "name") || "Campanha sem nome"}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => updateFilter(setStatus, event.target.value)}
              aria-label="Filtrar por status"
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
            >
              <option value="">Qualquer próxima ação</option>
              <option value="today">Agendada para hoje</option>
              <option value="next_7_days">Próximos 7 dias</option>
              <option value="scheduled">Todas as agendadas</option>
            </select>
            <div className="atlas-leads-sort">
              <select
                value={sort}
                onChange={(event) => updateFilter(setSort, event.target.value)}
                aria-label="Ordenar leads"
              >
                <option value="created_at">Data de entrada</option>
                <option value="updated_at">Última atualização</option>
                <option value="score">Score</option>
                <option value="name">Nome</option>
              </select>
              <button
                type="button"
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
          </div>
        ) : null}
      </section>

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
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      {canTransfer && selected.size ? (
        <section
          data-phase="54-team-transfer"
          className="sticky top-3 z-30 flex flex-col gap-3 rounded-2xl border border-cyan-400/30 bg-slate-950/95 p-4 shadow-2xl backdrop-blur md:flex-row md:items-center"
        >
          <div className="min-w-52">
            <strong className="block text-white">
              {selected.size} lead(s) selecionado(s)
            </strong>
            <span className="block text-xs text-slate-400">
              Transferência segura com rastreabilidade
            </span>
            <span className="block text-xs text-cyan-200">
              Ao escolher um gerente, as leads são equilibradas entre os
              corretores elegíveis. O gerente não se torna responsável.
            </span>
          </div>
          <select
            className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
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
            className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
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
            className="atlas-button-secondary"
            onClick={() => setSelected(new Set())}
          >
            Cancelar
          </button>
        </section>
      ) : null}

      {!error ? (
        <section className="atlas-leads-table-panel">
          <div className="atlas-leads-table-head">
            <div>
              <strong>Carteira comercial</strong>
              <span>
                {loading
                  ? "Sincronizando..."
                  : `${total} lead(s) · página ${page} de ${pages}`}
              </span>
            </div>
            <StatusBadge tone="success">DADOS REAIS</StatusBadge>
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
                        <span className="sr-only">Abrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((lead) => {
                      const due = dueLabel(lead.next_action_at, referenceTime);
                      return (
                        <tr key={lead.id}>
                          {canTransfer ? (
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Selecionar ${lead.name || "lead"}`}
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
                            <Link href={`/leads/${lead.id}`}>
                              <span className="atlas-lead-avatar">
                                {(lead.name || "L").slice(0, 2).toUpperCase()}
                              </span>
                              <span>
                                <strong>{lead.name || "Lead sem nome"}</strong>
                                <small>
                                  {lead.email ||
                                    lead.phone ||
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
                                <StatusBadge tone="info">META</StatusBadge>
                                <StatusBadge
                                  tone={
                                    lead.metadata?.meta?.dataSharingConsent
                                      ? "success"
                                      : "warning"
                                  }
                                >
                                  {lead.metadata?.meta?.dataSharingConsent
                                    ? "APRENDENDO"
                                    : "SEM SINAL"}
                                </StatusBadge>
                                {lead.metadata?.meta?.campaignId ? (
                                  <small>
                                    Campanha {lead.metadata.meta.campaignId}
                                  </small>
                                ) : (
                                  <small>Campanha não identificada</small>
                                )}
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
                              data-tone={scoreTone(lead.score)}
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
                            <span className="atlas-date-cell">
                              {formatDate(
                                lead.last_interaction_at || lead.updated_at,
                              )}
                            </span>
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
                            <Link
                              href={`/leads/${lead.id}`}
                              className="atlas-row-action"
                              aria-label={`Abrir Lead 360 de ${lead.name || "lead"}`}
                            >
                              →
                            </Link>
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
                  return (
                    <Link href={`/leads/${lead.id}`} key={lead.id}>
                      <div className="atlas-mobile-lead-head">
                        <span className="atlas-lead-avatar">
                          {(lead.name || "L").slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          <strong>{lead.name || "Lead sem nome"}</strong>
                          <small>{projectName(lead)}</small>
                        </span>
                        <span
                          className="atlas-score-cell"
                          data-tone={scoreTone(lead.score)}
                        >
                          {lead.score ?? 0}
                        </span>
                      </div>
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
                        <span>
                          {formatDate(
                            lead.last_interaction_at || lead.updated_at,
                          )}
                        </span>
                        <span
                          className="atlas-next-action"
                          data-overdue={due.overdue ? "true" : "false"}
                        >
                          {due.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
          {!loading && items.length ? (
            <div className="atlas-pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                ← Anterior
              </button>
              <span>
                Página <strong>{page}</strong> de <strong>{pages}</strong>
              </span>
              <button
                type="button"
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
