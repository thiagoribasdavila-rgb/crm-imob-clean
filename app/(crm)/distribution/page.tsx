"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AtlasBadge,
  AtlasEmpty,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
import {
  AtlasCard,
  AtlasCardHeader,
  AtlasMetric,
} from "@/components/ui/AtlasCard";
import {
  ProjectBrokerRoster,
  type ProjectBrokerRosterItem,
} from "@/components/distribution/ProjectBrokerRoster";
import {
  MetaSourceRoster,
  type MetaRosterMember,
} from "@/components/distribution/MetaSourceRoster";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  full_name: string | null;
  reports_to: string | null;
  resolved_role: string;
};
type Presence = {
  profile_id: string;
  availability: string;
  last_seen_at: string;
  online: boolean;
};
type Project = {
  id: string;
  name: string;
  developer_name: string | null;
  status: string | null;
};
type Load = {
  profile_id: string;
  total: number;
  by_project: Record<string, number>;
};
type QueueState = {
  profile_id: string;
  development_id: string;
  enabled: boolean;
  weight: number;
  assignments_count: number;
  last_assigned_at: string | null;
};
type MetaRecipient = {
  profile_id: string;
  enabled: boolean;
  weight: number;
  configured_at: string | null;
  updated_at: string | null;
};
type Capacity = {
  profile_id: string;
  max_active_leads: number;
  max_project_leads: number;
  warning_percent: number;
  updated_at: string;
};
type PriorityRule = {
  development_id: string;
  source_key: string;
  priority: number;
  sla_minutes: number;
  enabled: boolean;
  updated_at: string;
};
type PortfolioAudit = {
  events: Array<{
    occurredAt: string;
    eventType: string;
    brokerId: string | null;
    leadId: string | null;
    developmentId: string | null;
    actorId: string;
    details: Record<string, unknown>;
  }>;
  summary: {
    total: number;
    distributions: number;
    transfers: number;
    reservations: number;
    returns: number;
    absences: number;
    capacityChanges: number;
  };
  maximum: number;
  hierarchicalScope: boolean;
  piiExposed: boolean;
  immutableSources: boolean;
  generatedAt: string;
};
type Assignment = {
  id: string;
  development_id: string;
  lead_id: string;
  assigned_to: string;
  created_at: string;
  score_snapshot: {
    algorithm?: string;
    projectLoadBefore?: number;
    weight?: number;
    weightedLoadBefore?: number;
  };
};
type UnassignedLead = {
  id: string;
  developmentId: string | null;
  source: string;
  status: string;
  createdAt: string;
  waitingMinutes: number;
};
type AssignmentTimeEvidence = {
  status: "measured" | "insufficient_sample" | "unavailable";
  sampleSize: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
  maximumMinutes: number | null;
};
type DistributionEvidence = {
  scope: "authenticated_organization";
  containsPii: false;
  window: {
    maximumEvents: number;
    observedEvents: number;
    firstEventAt: string | null;
    lastEventAt: string | null;
  };
  overall: AssignmentTimeEvidence;
  coverage: { matched: number; observed: number };
  byProject: Array<{
    developmentId: string;
    assignmentTime: AssignmentTimeEvidence;
    assignmentCoverage: { matched: number; observed: number };
    observedAssignments: number;
    enabledBrokerCount: number;
    concentrationPercent: number | null;
    currentWeightedLoadGap: number | null;
  }>;
  limitations: string[];
};
type Payload = {
  viewer: { id: string; role: string };
  rules: {
    algorithm: string;
    presenceWindowSeconds: number;
    onlineOnly: boolean;
    projectScoped: boolean;
    weightedLoad: boolean;
    atomicLock: boolean;
    singleOwner: boolean;
    explainable: boolean;
  };
  projects: Project[];
  profiles: Profile[];
  presence: Presence[];
  loads: Load[];
  queue: QueueState[];
  capacity: Capacity[];
  priorityRules: PriorityRule[];
  metaRecipients: MetaRecipient[];
  leadSources: string[];
  portfolioAudit: PortfolioAudit;
  recentAssignments: Assignment[];
  distributionEvidence: DistributionEvidence;
  unassignedQueue: UnassignedLead[];
  unassignedPolicy: {
    metadataOnly: boolean;
    piiExposed: boolean;
    automaticAssignment: boolean;
    explicitLeadershipAction: boolean;
    maximumVisible: number;
  };
  unassigned: Record<string, number>;
  generatedAt: string;
};

function formatEvidenceMinutes(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value * 10) / 10} min`;
  if (value < 1440) return `${Math.round((value / 60) * 10) / 10} h`;
  return `${Math.round((value / 1440) * 10) / 10} d`;
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export default function DistributionPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [availability, setAvailability] = useState<
    "available" | "busy" | "offline"
  >("available");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [absenceBrokerId, setAbsenceBrokerId] = useState("");
  const [absenceEndsAt, setAbsenceEndsAt] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceReviewOpen, setAbsenceReviewOpen] = useState(false);
  const [capacityBrokerId, setCapacityBrokerId] = useState("");
  const [maxActiveLeads, setMaxActiveLeads] = useState(100);
  const [maxProjectLeads, setMaxProjectLeads] = useState(50);
  const [warningPercent, setWarningPercent] = useState(80);
  const [capacityReason, setCapacityReason] = useState("");
  const [prioritySource, setPrioritySource] = useState("");
  const [sourcePriority, setSourcePriority] = useState(5);
  const [sourceSlaMinutes, setSourceSlaMinutes] = useState(60);
  const [priorityReason, setPriorityReason] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const token = await accessToken();
      const response = await fetch("/api/v1/crm/distribution", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 403) {
          setAccessDenied(true);
          setError("");
          return;
        }
        setError(result.error?.message || "Falha ao carregar a fila.");
      } else {
        setAccessDenied(false);
        setData(result.data);
        setProjectId((current) => current || result.data.projects[0]?.id || "");
        setError("");
      }
    } catch {
      setError("Não foi possível atualizar a fila comercial agora.");
    } finally {
      setLoading(false);
    }
  }, []);

  const heartbeat = useCallback(
    async (
      nextAvailability: "available" | "busy" | "offline" = availability,
    ) => {
      const token = await accessToken();
      await fetch("/api/v1/crm/distribution", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "heartbeat",
          availability: nextAvailability,
        }),
      });
    },
    [availability],
  );

  useEffect(() => {
    if (accessDenied) return;
    void heartbeat().then(() => load());
    const beat = window.setInterval(() => void heartbeat(), 30_000);
    const refresh = window.setInterval(() => void load(true), 15_000);
    return () => {
      window.clearInterval(beat);
      window.clearInterval(refresh);
    };
  }, [accessDenied, heartbeat, load]);

  async function updateAvailability(next: "available" | "busy" | "offline") {
    setAvailability(next);
    await heartbeat(next);
    await load(true);
  }

  async function distribute(limit: number) {
    if (!projectId) return;
    setWorking(true);
    setError("");
    setNotice("");
    const token = await accessToken();
    const response = await fetch("/api/v1/crm/distribution", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "distribute",
        developmentId: projectId,
        limit,
      }),
    });
    const result = await response.json();
    if (!response.ok)
      setError(result.error?.message || "Não foi possível distribuir.");
    else
      setNotice(
        `${result.data.distributed} lead${result.data.distributed === 1 ? "" : "s"} distribuída${result.data.distributed === 1 ? "" : "s"}. Responsável único preservado; escolha explicada por carga ponderada e última atribuição.`,
      );
    await load(true);
    setWorking(false);
  }

  async function configureMembers(
    members: Array<{ profileId: string; enabled: boolean; weight: number }>,
  ) {
    if (!projectId) return false;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/crm/distribution", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "configure_members",
          developmentId: projectId,
          members,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.error?.message ||
            "Não foi possível salvar a roleta deste projeto.",
        );
        return false;
      }
      setNotice(
        `${members.filter((member) => member.enabled).length} corretor(es) selecionado(s) para receber leads de ${selectedProject?.name || "este projeto"}.`,
      );
      await load(true);
      return true;
    } catch {
      setError("Não foi possível salvar a roleta deste projeto agora.");
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function configureMetaRecipients(members: MetaRosterMember[]) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/crm/distribution", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "configure_source_members",
          sourceKey: "meta",
          members: members.map((member) => ({
            profileId: member.profileId,
            enabled: true,
            weight: member.weight,
          })),
          reason: "Roleta exclusiva aprovada pela diretoria para leads originados da Meta.",
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message || "Não foi possível salvar a roleta exclusiva da Meta.");
        return false;
      }
      const names = teamBrokers
        .filter((broker) => members.some((member) => member.profileId === broker.id))
        .map((broker) => broker.full_name || "Corretor")
        .join(" e ");
      setNotice(`Leads novos da Meta serão enviados somente para ${names || "os corretores selecionados"}. Leads já atribuídos não foram alterados.`);
      await load(true);
      return true;
    } catch {
      setError("Não foi possível salvar a roleta exclusiva da Meta agora.");
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function coverAbsence() {
    if (!absenceBrokerId || !absenceEndsAt || absenceReason.trim().length < 10)
      return;
    setWorking(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/v1/crm/distribution", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "cover_absence",
        profileId: absenceBrokerId,
        endsAt: new Date(absenceEndsAt).toISOString(),
        reason: absenceReason.trim(),
        limit: 200,
      }),
    });
    const result = await response.json();
    if (!response.ok)
      setError(result.error?.message || "Não foi possível ativar a cobertura.");
    else {
      setNotice(
        `Cobertura registrada: ${result.data.transferred} lead(s) ativa(s) redistribuída(s), com histórico e tarefas preservados.`,
      );
      setAbsenceBrokerId("");
      setAbsenceEndsAt("");
      setAbsenceReason("");
      setAbsenceReviewOpen(false);
    }
    await load(true);
    setWorking(false);
  }

  async function configureCapacity() {
    if (
      !capacityBrokerId ||
      capacityReason.trim().length < 10 ||
      maxProjectLeads > maxActiveLeads
    )
      return;
    setWorking(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/v1/crm/distribution", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "configure_capacity",
        profileId: capacityBrokerId,
        maxActiveLeads,
        maxProjectLeads,
        warningPercent,
        reason: capacityReason.trim(),
      }),
    });
    const result = await response.json();
    if (!response.ok)
      setError(
        result.error?.message || "Não foi possível atualizar a capacidade.",
      );
    else {
      setNotice(
        `Capacidade atualizada: ${result.data.maxActiveLeads} leads ativas e ${result.data.maxProjectLeads} por projeto.${result.data.currentlyOverLimit ? " A carteira atual já está acima do novo limite; novas entradas foram bloqueadas." : ""}`,
      );
      setCapacityReason("");
    }
    await load(true);
    setWorking(false);
  }

  async function configurePriority() {
    if (!projectId || !prioritySource || priorityReason.trim().length < 10)
      return;
    setWorking(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/v1/crm/distribution", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "configure_priority",
        developmentId: projectId,
        sourceKey: prioritySource,
        priority: sourcePriority,
        slaMinutes: sourceSlaMinutes,
        enabled: true,
        reason: priorityReason.trim(),
      }),
    });
    const result = await response.json();
    if (!response.ok)
      setError(
        result.error?.message || "Não foi possível salvar a prioridade.",
      );
    else {
      setNotice(
        `Regra salva para ${result.data.sourceKey}: prioridade ${result.data.priority}, SLA ${result.data.slaMinutes} minutos.`,
      );
      setPriorityReason("");
    }
    await load(true);
    setWorking(false);
  }

  const presenceMap = useMemo(
    () =>
      new Map((data?.presence ?? []).map((item) => [item.profile_id, item])),
    [data],
  );
  const loadMap = useMemo(
    () => new Map((data?.loads ?? []).map((item) => [item.profile_id, item])),
    [data],
  );
  const stateMap = useMemo(
    () =>
      new Map(
        (data?.queue ?? [])
          .filter((item) => item.development_id === projectId)
          .map((item) => [item.profile_id, item]),
      ),
    [data, projectId],
  );
  const capacityMap = useMemo(
    () =>
      new Map((data?.capacity ?? []).map((item) => [item.profile_id, item])),
    [data],
  );
  const profilesMap = useMemo(
    () => new Map((data?.profiles ?? []).map((item) => [item.id, item])),
    [data],
  );
  const managers = (data?.profiles ?? []).filter(
    (item) =>
      item.resolved_role === "manager" &&
      (data?.viewer.role !== "superintendent" ||
        item.reports_to === data.viewer.id) &&
      presenceMap.get(item.id)?.online,
  );
  const teamBrokers = (data?.profiles ?? []).filter(
    (item) =>
      item.resolved_role === "broker" &&
      (data?.viewer.role !== "manager" || item.reports_to === data.viewer.id),
  );
  const canManageDistribution = data?.viewer.role === "director";
  const brokers = (data?.profiles ?? [])
    .filter(
      (item) =>
        item.resolved_role === "broker" &&
        presenceMap.get(item.id)?.online &&
        presenceMap.get(item.id)?.availability === "available" &&
        stateMap.get(item.id)?.enabled !== false,
    )
    .sort((a, b) => {
      const aLoad =
        (loadMap.get(a.id)?.by_project[projectId] ?? 0) /
        (stateMap.get(a.id)?.weight || 1);
      const bLoad =
        (loadMap.get(b.id)?.by_project[projectId] ?? 0) /
        (stateMap.get(b.id)?.weight || 1);
      if (aLoad !== bLoad) return aLoad - bLoad;
      return (stateMap.get(a.id)?.last_assigned_at || "").localeCompare(
        stateMap.get(b.id)?.last_assigned_at || "",
      );
    });
  const selectedProject = data?.projects.find((item) => item.id === projectId);
  const selectedDistributionEvidence = data?.distributionEvidence.byProject.find(
    (item) => item.developmentId === projectId,
  );
  const evidenceStatus = selectedDistributionEvidence?.assignmentTime.status;
  const rosterProjects = (data?.projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    developerName: project.developer_name,
    activeCount: (data?.queue ?? []).filter(
      (member) => member.development_id === project.id && member.enabled,
    ).length,
    waitingCount: data?.unassigned[project.id] ?? 0,
  }));
  const rosterBrokers: ProjectBrokerRosterItem[] = teamBrokers.map((broker) => {
    const state = stateMap.get(broker.id);
    const presence = presenceMap.get(broker.id);
    const capacity = capacityMap.get(broker.id);
    const brokerLoad = loadMap.get(broker.id);
    return {
      id: broker.id,
      name: broker.full_name || "Corretor",
      managerName: broker.reports_to
        ? profilesMap.get(broker.reports_to)?.full_name || "Comercial"
        : "Comercial",
      enabled: state?.enabled !== false,
      online: Boolean(presence?.online),
      availability: presence?.availability || "offline",
      weight: state?.weight || 1,
      totalLoad: brokerLoad?.total || 0,
      projectLoad: brokerLoad?.by_project[projectId] || 0,
      maxActiveLeads: capacity?.max_active_leads || 100,
      maxProjectLeads: capacity?.max_project_leads || 50,
      warningPercent: capacity?.warning_percent || 80,
      lastAssignedAt: state?.last_assigned_at || null,
    };
  });
  const metaConfiguredRecipients = (data?.metaRecipients ?? [])
    .filter((recipient) => recipient.enabled)
    .map((recipient) => ({
      profileId: recipient.profile_id,
      weight: recipient.weight,
    }));
  const metaSuggestedRecipientIds = teamBrokers
    .filter((broker) => /\b(diego|luciano)\b/i.test(broker.full_name || ""))
    .map((broker) => broker.id);
  const absenceBroker = profilesMap.get(absenceBrokerId);
  const unassigned = data?.unassigned[projectId] ?? 0;
  const weightedLoads = brokers.map(
    (broker) =>
      (loadMap.get(broker.id)?.by_project[projectId] ?? 0) /
      (stateMap.get(broker.id)?.weight || 1),
  );
  const balanceGap =
    weightedLoads.length > 1
      ? Math.round(
          (Math.max(...weightedLoads) - Math.min(...weightedLoads)) * 10,
        ) / 10
      : 0;
  const selectedQueue = (data?.unassignedQueue ?? []).filter(
    (item) => !projectId || item.developmentId === projectId,
  );
  const oldestWaitingMinutes = selectedQueue.reduce(
    (maximum, item) => Math.max(maximum, item.waitingMinutes),
    0,
  );
  const brokersNearCapacity = teamBrokers.filter((broker) => {
    const capacity = capacityMap.get(broker.id);
    if (!capacity) return false;
    const currentLoad = loadMap.get(broker.id)?.total ?? 0;
    return (
      currentLoad >=
      capacity.max_active_leads * (capacity.warning_percent / 100)
    );
  }).length;
  const conversionSignals = [
    unassigned > 0
      ? {
          title: "Leads aguardando responsável",
          value: String(unassigned),
          detail: "A liderança decide quando liberar a próxima distribuição.",
        }
      : null,
    oldestWaitingMinutes >= 60
      ? {
          title: "SLA de entrada pressionado",
          value:
            oldestWaitingMinutes < 1440
              ? `${Math.floor(oldestWaitingMinutes / 60)} h`
              : `${Math.floor(oldestWaitingMinutes / 1440)} d`,
          detail: "Tempo da lead mais antiga na fila selecionada.",
        }
      : null,
    unassigned > 0 && brokers.length === 0
      ? {
          title: "Sem capacidade online",
          value: "AÇÃO",
          detail:
            "Há demanda, mas nenhum corretor elegível está disponível agora.",
        }
      : null,
    brokersNearCapacity > 0
      ? {
          title: "Carteiras próximas do limite",
          value: String(brokersNearCapacity),
          detail: "Apoie o time antes de distribuir novos atendimentos.",
        }
      : null,
    balanceGap > 1
      ? {
          title: "Desvio de carga no projeto",
          value: String(balanceGap),
          detail: "Revise peso, presença e capacidade antes de um novo lote.",
        }
      : null,
  ]
    .filter(
      (signal): signal is { title: string; value: string; detail: string } =>
        Boolean(signal),
    )
    .slice(0, 3);

  function openCapacityCopilot() {
    window.dispatchEvent(
      new CustomEvent("atlas:open-copilot", {
        detail: {
          prompt: `Analise uma fila comercial do projeto ${selectedProject?.name || "selecionado"} com ${unassigned} leads aguardando, ${brokers.length} corretores disponíveis, espera máxima de ${oldestWaitingMinutes} minutos, ${brokersNearCapacity} carteiras próximas do limite e desvio de carga ${balanceGap}. Sugira até três decisões para proteger velocidade e conversão. Não distribua leads, não altere capacidade e não envie mensagens.`,
          context: {
            module: "distribution-capacity",
            projectId: projectId || null,
            humanApprovalRequired: true,
          },
        },
      }),
    );
  }

  if (accessDenied) {
    return (
      <div
        className="space-y-6 pb-10"
        data-distribution-access="director-only"
      >
        <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.06] to-violet-500/[.1] p-6 shadow-[0_34px_120px_rgba(2,8,23,.42)] sm:p-8">
          <AtlasBadge tone="info">ACESSO DA DIRETORIA</AtlasBadge>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">
            A fila de distribuição é administrada pela diretoria.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
            Sua carteira, tarefas e pipeline continuam disponíveis. A seleção de
            corretores e a roleta de novos leads ficam protegidas para evitar
            alterações indevidas na operação.
          </p>
        </section>
        <AtlasEmpty
          reason="not-configured"
          eyebrow="Acesso protegido"
          title="Nenhuma ação é necessária nesta tela"
          description="Acompanhe sua equipe e suas oportunidades pelos módulos liberados para o seu perfil."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/dashboard" className="atlas-button-primary">
                Abrir Command Center
              </Link>
              <Link href="/brokers" className="atlas-button-secondary">
                Ver equipe
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div
      className="space-y-6 pb-10"
      data-phase="51-explainable-distribution"
      data-evolution-phase="46"
      data-distribution-layout="capacity-first"
    >
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.06] to-violet-500/[.1] p-6 shadow-[0_34px_120px_rgba(2,8,23,.42)] sm:p-8">
        <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <AtlasBadge tone="success">FILA AO VIVO</AtlasBadge>
              <AtlasBadge tone="info">PROJETO + CARGA</AtlasBadge>
              <AtlasBadge tone="violet">HIERARQUIA ATIVA</AtlasBadge>
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">
              Leads no corretor certo,{" "}
              <span className="atlas-gradient-text">no momento certo.</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
              O Atlas considera disponibilidade, projeto, carteira atual e tempo
              desde a última atribuição. Gerentes enxergam apenas sua estrutura;
              o diretor acompanha toda a operação.
            </p>
          </div>
          <div className="min-w-[280px] rounded-2xl border border-white/10 bg-[#070d1b]/70 p-4">
            <label className="atlas-eyebrow" htmlFor="project">
              Projeto da distribuição
            </label>
            <select
              id="project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="">Selecione um projeto</option>
              {data?.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <p className="mt-3 text-xs text-slate-500">
              {selectedProject?.developer_name || "Incorporadora não informada"}
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <AtlasRecoverableError
          description={error}
          onRetry={() => void load()}
          busy={loading}
        />
      ) : null}
      <section data-phase="46-distribution-capacity-decision">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 46 · Proteção da conversão"
            title="Capacidade, espera e equilíbrio antes da distribuição"
            description="O Atlas reúne somente sinais operacionais e prepara a decisão. Nenhuma lead é atribuída e nenhum limite é alterado sem ação humana explícita."
            action={
              <button
                type="button"
                onClick={openCapacityCopilot}
                disabled={!projectId || loading}
                className="atlas-button-secondary disabled:opacity-50"
              >
                Preparar decisão com IA
              </button>
            }
          />
          <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-3">
            {conversionSignals.map((signal) => (
              <article
                key={signal.title}
                className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold text-white">
                    {signal.title}
                  </h2>
                  <AtlasBadge tone="warning">{signal.value}</AtlasBadge>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  {signal.detail}
                </p>
              </article>
            ))}
            {!conversionSignals.length ? (
              <div className="lg:col-span-3">
                <AtlasEmpty
                  reason="completed"
                  eyebrow="Capacidade protegida"
                  title="Sem pressão crítica na fila selecionada"
                  description="Continue acompanhando presença, tempo de espera e carga antes de liberar novos lotes."
                />
              </div>
            ) : null}
          </div>
          <div className="border-t border-white/[.06] px-5 py-3 text-[10px] text-slate-500">
            IA proativa para análise · aprovação humana obrigatória · sem PII ·
            sem distribuição autônoma.
          </div>
        </AtlasCard>
      </section>
      <div data-phase="52-unassigned-lead-queue">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 52 · Fila sem responsável"
            title="Recupere leads sem expor dados pessoais"
            description="A fila usa somente projeto, origem, etapa e tempo de espera. Nada é atribuído sem comando da liderança."
            action={
              <button
                type="button"
                disabled={
                  working || !projectId || !brokers.length || !unassigned
                }
                onClick={() => void distribute(1)}
                className="atlas-button-primary disabled:opacity-50"
              >
                Distribuir próxima
              </button>
            }
          />
          <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-2">
            {data?.unassignedQueue
              .filter((item) => !projectId || item.developmentId === projectId)
              .slice(0, 12)
              .map((item) => (
                <article
                  key={item.id}
                  className={`rounded-2xl border p-4 ${item.waitingMinutes >= 60 ? "border-amber-400/20 bg-amber-400/[.04]" : "border-white/[.07] bg-white/[.025]"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="text-sm text-white">
                        Lead {item.id.slice(0, 8)}
                      </strong>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.source} · {item.status}
                      </p>
                    </div>
                    <AtlasBadge
                      tone={item.waitingMinutes >= 60 ? "warning" : "neutral"}
                    >
                      {item.waitingMinutes < 60
                        ? `${item.waitingMinutes} MIN`
                        : item.waitingMinutes < 1440
                          ? `${Math.floor(item.waitingMinutes / 60)} H`
                          : `${Math.floor(item.waitingMinutes / 1440)} D`}
                    </AtlasBadge>
                  </div>
                  <p className="mt-3 text-[10px] text-slate-600">
                    Sem nome, telefone ou e-mail nesta fila. A distribuição
                    seleciona atomicamente a lead mais antiga do projeto.
                  </p>
                </article>
              ))}
            {!data?.unassignedQueue.filter(
              (item) => !projectId || item.developmentId === projectId,
            ).length ? (
              <div className="lg:col-span-2">
                <AtlasEmpty
                  reason="completed"
                  eyebrow="Distribuição em dia"
                  title="Fila sem pendências"
                  description="Nenhuma lead sem responsável no projeto selecionado."
                  action={
                    <Link href="/pipeline" className="atlas-button-secondary">
                      Revisar pipeline
                    </Link>
                  }
                />
              </div>
            ) : null}
          </div>
          <div className="border-t border-white/[.06] px-5 py-3 text-[10px] text-slate-500">
            Máximo de 100 metadados visíveis · sem PII · sem atribuição
            automática · decisão explícita da liderança.
          </div>
        </AtlasCard>
      </div>
      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 51 · Evidência de distribuição"
          title="Por que cada lead foi atribuída"
          description="Cada evento preserva projeto, responsável único, carga anterior, peso e algoritmo usado."
        />
        <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-2">
          {data?.recentAssignments
            .filter((item) => !projectId || item.development_id === projectId)
            .slice(0, 8)
            .map((item) => {
              const broker = profilesMap.get(item.assigned_to);
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="text-sm text-white">
                        {broker?.full_name || "Corretor"}
                      </strong>
                      <p className="mt-1 text-xs text-slate-500">
                        Lead {item.lead_id.slice(0, 8)} ·{" "}
                        {new Date(item.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <AtlasBadge tone="success">ÚNICO RESPONSÁVEL</AtlasBadge>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    Carga anterior{" "}
                    {item.score_snapshot?.projectLoadBefore ?? "—"} ÷ peso{" "}
                    {item.score_snapshot?.weight ?? 1} = carga ponderada{" "}
                    {item.score_snapshot?.weightedLoadBefore ?? "—"}.
                  </p>
                </article>
              );
            })}
          {!data?.recentAssignments.length ? (
            <div className="lg:col-span-2">
              <AtlasEmpty
                title="Sem atribuições recentes"
                description="As próximas distribuições terão justificativa auditável."
              />
            </div>
          ) : null}
        </div>
      </AtlasCard>

      <section data-phase="364-distribution-evidence">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 364 · Evidência operacional"
            title="Tempo e equilíbrio da roleta"
            description={`Leitura do projeto ${selectedProject?.name || "selecionado"} com base apenas nas atribuições recentes que puderam ser ligadas à criação da lead.`}
            action={
              <AtlasBadge
                tone={
                  evidenceStatus === "measured"
                    ? "success"
                    : evidenceStatus === "insufficient_sample"
                      ? "warning"
                      : "neutral"
                }
              >
                {evidenceStatus === "measured"
                  ? "MEDIDO"
                  : evidenceStatus === "insufficient_sample"
                    ? "AMOSTRA BAIXA"
                    : "SEM EVIDÊNCIA"}
              </AtlasBadge>
            }
          />
          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
            {[
              [
                "Tempo mediano",
                formatEvidenceMinutes(
                  selectedDistributionEvidence?.assignmentTime.medianMinutes ??
                    null,
                ),
                "Metade das atribuições medidas ocorreu até este tempo.",
              ],
              [
                "P90 de atribuição",
                formatEvidenceMinutes(
                  selectedDistributionEvidence?.assignmentTime.p90Minutes ??
                    null,
                ),
                "Nove em cada dez atribuições medidas ocorreram até este tempo.",
              ],
              [
                "Desvio de carga ponderada",
                selectedDistributionEvidence?.currentWeightedLoadGap === null ||
                selectedDistributionEvidence?.currentWeightedLoadGap ===
                  undefined
                  ? "—"
                  : String(
                      selectedDistributionEvidence.currentWeightedLoadGap,
                    ),
                "Diferença atual entre a maior e a menor carga ajustada pelo peso.",
              ],
              [
                "Maior participação observada",
                selectedDistributionEvidence?.concentrationPercent === null ||
                selectedDistributionEvidence?.concentrationPercent === undefined
                  ? "—"
                  : `${selectedDistributionEvidence.concentrationPercent}%`,
                "Concentração descritiva na janela; não comprova justiça da decisão.",
              ],
            ].map(([label, value, detail]) => (
              <article
                key={label}
                className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
              >
                <p className="text-[10px] uppercase tracking-[.14em] text-slate-500">
                  {label}
                </p>
                <strong className="mt-3 block text-2xl text-white">
                  {value}
                </strong>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {detail}
                </p>
              </article>
            ))}
          </div>
          <div className="border-t border-white/[.06] px-5 py-4 text-xs leading-5 text-slate-500 sm:px-6">
            Amostra compatível: {selectedDistributionEvidence?.assignmentCoverage.matched ?? 0}
            /{selectedDistributionEvidence?.assignmentCoverage.observed ?? 0} eventos · {" "}
            {selectedDistributionEvidence?.enabledBrokerCount ?? 0} corretor(es)
            habilitado(s). Janela máxima de {data?.distributionEvidence.window.maximumEvents ?? 100}
            eventos, sem PII. A concentração descreve o histórico observado e não
            deve ser usada isoladamente para avaliar pessoas.
          </div>
        </AtlasCard>
      </section>

      {data?.portfolioAudit ? (
        <section data-phase="59-portfolio-audit">
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="Fase 59 · Livro da carteira"
              title="Histórico gerencial unificado"
              description="Distribuições, transferências, reservas, devoluções, ausências e capacidade no mesmo escopo hierárquico, sem nome ou contato da lead."
              action={
                <div className="flex gap-2">
                  <AtlasBadge tone="success">SEM PII</AtlasBadge>
                  <AtlasBadge tone="info">
                    ATÉ {data.portfolioAudit.maximum}
                  </AtlasBadge>
                </div>
              }
            />
            <div className="grid gap-3 border-b border-white/[.06] p-5 sm:grid-cols-3 sm:p-6 lg:grid-cols-6">
              {[
                ["Distribuições", data.portfolioAudit.summary.distributions],
                ["Transferências", data.portfolioAudit.summary.transfers],
                ["Reservas", data.portfolioAudit.summary.reservations],
                ["Devoluções", data.portfolioAudit.summary.returns],
                ["Ausências", data.portfolioAudit.summary.absences],
                ["Capacidade", data.portfolioAudit.summary.capacityChanges],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-white/[.06] bg-white/[.025] p-3"
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    {label}
                  </p>
                  <strong className="mt-2 block text-xl text-white">
                    {value}
                  </strong>
                </div>
              ))}
            </div>
            <div className="space-y-2 p-5 sm:p-6">
              {data.portfolioAudit.events.slice(0, 20).map((event, index) => {
                const labels: Record<string, string> = {
                  distribution: "Distribuição",
                  transfer: "Transferência",
                  reservation_pending: "Reserva criada",
                  reservation_accepted: "Reserva aceita",
                  reservation_expired: "Devolução à fila",
                  reservation_superseded: "Reserva superada",
                  absence: "Cobertura de ausência",
                  capacity: "Limite de capacidade",
                };
                return (
                  <article
                    key={`${event.eventType}-${event.occurredAt}-${index}`}
                    className="flex flex-col gap-2 rounded-2xl border border-white/[.06] bg-white/[.02] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <strong className="text-sm text-white">
                        {labels[event.eventType] || event.eventType}
                      </strong>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.brokerId
                          ? profilesMap.get(event.brokerId)?.full_name ||
                            "Corretor no escopo"
                          : "Operação gerencial"}
                        {event.leadId
                          ? ` · Lead ${event.leadId.slice(0, 8)}`
                          : ""}
                      </p>
                    </div>
                    <time className="text-xs text-slate-500">
                      {new Date(event.occurredAt).toLocaleString("pt-BR")}
                    </time>
                  </article>
                );
              })}
              {!data.portfolioAudit.events.length ? (
                <AtlasEmpty
                  title="Histórico ainda vazio"
                  description="Os próximos movimentos aparecerão aqui com rastreabilidade."
                />
              ) : null}
            </div>
            <div className="border-t border-white/[.06] px-5 py-3 text-[10px] text-slate-600">
              Fontes operacionais preservadas · escopo hierárquico · nome,
              telefone, e-mail e textos livres da lead não expostos.
            </div>
          </AtlasCard>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AtlasMetric
          label="Leads aguardando"
          value={loading ? "—" : String(unassigned)}
          detail={selectedProject?.name || "Selecione o projeto"}
          trend="FILA"
          tone="amber"
        />
        <AtlasMetric
          label="Corretores disponíveis"
          value={loading ? "—" : String(brokers.length)}
          detail="Online e elegíveis agora"
          trend="AO VIVO"
          tone="green"
        />
        <AtlasMetric
          label="Gestores online"
          value={loading ? "—" : String(managers.length)}
          detail="Gerentes e superintendentes"
          trend="LIDERANÇA"
          tone="blue"
        />
        <AtlasMetric
          label="Próximo da fila"
          value={loading ? "—" : brokers[0]?.full_name || "Sem corretor"}
          detail="Menor carga no projeto"
          trend="EQUILÍBRIO"
          tone="violet"
        />
      </section>

      {canManageDistribution ? (
        <section className="rounded-[24px] border border-cyan-400/15 bg-gradient-to-r from-cyan-400/[.07] to-blue-400/[.04] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="atlas-eyebrow">
                Fase 38 · Distribuição equilibrada
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Roleta da operação conectada ao motor
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Selecione quem recebe cada projeto. Presença, disponibilidade,
                capacidade, peso e última atribuição definem a ordem real.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AtlasBadge tone={balanceGap <= 1 ? "success" : "warning"}>
                DESVIO {balanceGap}
              </AtlasBadge>
              <AtlasBadge tone="info">{brokers.length} ELEGÍVEIS</AtlasBadge>
              <AtlasBadge tone="violet">MESMO PROJETO</AtlasBadge>
            </div>
          </div>
        </section>
      ) : null}

      {canManageDistribution && projectId ? (
        <ProjectBrokerRoster
          key={projectId}
          projectId={projectId}
          projects={rosterProjects}
          brokers={rosterBrokers}
          working={working}
          priorityRuleCount={(data?.priorityRules ?? []).filter(
            (rule) => rule.development_id === projectId && rule.enabled,
          ).length}
          onProjectChange={setProjectId}
          onSave={configureMembers}
        />
      ) : null}

      {canManageDistribution ? (
        <MetaSourceRoster
          brokers={teamBrokers.map((broker) => {
            const presence = presenceMap.get(broker.id);
            return {
              id: broker.id,
              name: broker.full_name || "Corretor",
              managerName: broker.reports_to
                ? profilesMap.get(broker.reports_to)?.full_name || "Comercial"
                : "Comercial",
              online: Boolean(presence?.online),
              availability: presence?.availability || "offline",
            };
          })}
          configuredRecipients={metaConfiguredRecipients}
          suggestedRecipientIds={metaSuggestedRecipientIds}
          working={working}
          onSave={configureMetaRecipients}
        />
      ) : null}

      {canManageDistribution ? (
        <section data-phase="57-distribution-priority">
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="Fase 57 · Ordem inteligente da fila"
              title="Prioridade por SLA e origem"
              description="A fila considera pressão do SLA, regra da origem e antiguidade. Nome, renda, gênero, idade e outros dados pessoais nunca entram na decisão."
            />
            <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-5">
              <label className="text-xs text-slate-400">
                Origem
                <select
                  value={prioritySource}
                  onChange={(event) => {
                    const source = event.target.value;
                    setPrioritySource(source);
                    const current = data?.priorityRules.find(
                      (rule) =>
                        rule.development_id === projectId &&
                        rule.source_key === source,
                    );
                    if (current) {
                      setSourcePriority(current.priority);
                      setSourceSlaMinutes(current.sla_minutes);
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                >
                  <option value="">Selecione</option>
                  {(data?.leadSources ?? []).map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Prioridade 1–10
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={sourcePriority}
                  onChange={(event) =>
                    setSourcePriority(Number(event.target.value))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400">
                SLA em minutos
                <input
                  type="number"
                  min={5}
                  max={10080}
                  value={sourceSlaMinutes}
                  onChange={(event) =>
                    setSourceSlaMinutes(Number(event.target.value))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400 lg:col-span-2">
                Motivo auditável
                <input
                  value={priorityReason}
                  onChange={(event) => setPriorityReason(event.target.value)}
                  minLength={10}
                  maxLength={500}
                  placeholder="Ex.: origem com compromisso de contato em 15 minutos"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <div className="lg:col-span-5 flex flex-col gap-3 rounded-2xl border border-violet-400/15 bg-violet-400/[.035] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs leading-5 text-slate-400">
                    Ordem: maior pressão de SLA → prioridade da origem → lead
                    mais antiga. O destino continua respeitando equipe,
                    presença, projeto, capacidade e carga ponderada.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(data?.priorityRules ?? [])
                      .filter(
                        (rule) =>
                          rule.development_id === projectId && rule.enabled,
                      )
                      .slice(0, 8)
                      .map((rule) => (
                        <AtlasBadge key={rule.source_key} tone="violet">
                          {rule.source_key} · P{rule.priority} ·{" "}
                          {rule.sla_minutes} MIN
                        </AtlasBadge>
                      ))}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    working ||
                    !projectId ||
                    !prioritySource ||
                    priorityReason.trim().length < 10
                  }
                  onClick={() => void configurePriority()}
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {working ? "Salvando..." : "Salvar prioridade"}
                </button>
              </div>
            </div>
          </AtlasCard>
        </section>
      ) : null}

      {canManageDistribution ? (
        <section data-phase="56-broker-capacity">
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="Fase 56 · Proteção contra sobrecarga"
              title="Limites de carteira por corretor"
              description="Defina capacidade operacional, não meta nem ranking. Ao atingir o teto, novas distribuições e transferências são bloqueadas no banco."
            />
            <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-5">
              <label className="text-xs text-slate-400">
                Corretor
                <select
                  value={capacityBrokerId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setCapacityBrokerId(id);
                    const current = capacityMap.get(id);
                    if (current) {
                      setMaxActiveLeads(current.max_active_leads);
                      setMaxProjectLeads(current.max_project_leads);
                      setWarningPercent(current.warning_percent);
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                >
                  <option value="">Selecione</option>
                  {teamBrokers.map((broker) => (
                    <option key={broker.id} value={broker.id}>
                      {broker.full_name || "Corretor"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Máximo ativo
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={maxActiveLeads}
                  onChange={(event) =>
                    setMaxActiveLeads(Number(event.target.value))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400">
                Máximo por projeto
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={maxProjectLeads}
                  onChange={(event) =>
                    setMaxProjectLeads(Number(event.target.value))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400">
                Avisar em %
                <input
                  type="number"
                  min={50}
                  max={95}
                  value={warningPercent}
                  onChange={(event) =>
                    setWarningPercent(Number(event.target.value))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400">
                Motivo auditável
                <input
                  value={capacityReason}
                  onChange={(event) => setCapacityReason(event.target.value)}
                  minLength={10}
                  maxLength={500}
                  placeholder="Ex.: capacidade definida para o período"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <div className="lg:col-span-5 flex flex-col gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/[.035] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs leading-5 text-slate-400">
                    Carga atual:{" "}
                    <strong className="text-white">
                      {capacityBrokerId
                        ? (loadMap.get(capacityBrokerId)?.total ?? 0)
                        : "—"}
                    </strong>
                    . Alerta visual em {warningPercent}% e bloqueio real no
                    teto. Reduzir o limite não retira leads existentes.
                  </p>
                  <p className="text-[10px] text-slate-600">
                    Sem comparação pública, punição ou pontuação de pessoas.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    working ||
                    !capacityBrokerId ||
                    capacityReason.trim().length < 10 ||
                    maxProjectLeads > maxActiveLeads
                  }
                  onClick={() => void configureCapacity()}
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {working ? "Salvando..." : "Salvar limites"}
                </button>
              </div>
            </div>
          </AtlasCard>
        </section>
      ) : null}

      {canManageDistribution ? (
        <section data-phase="55-absence-redistribution">
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="Fase 55 · Continuidade de atendimento"
              title="Cobertura por ausência"
              description="A liderança confirma período e motivo. Somente a carteira ativa é movida para corretores online da mesma equipe; vendas e descartes permanecem intactos."
            />
            <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-4">
              <label className="text-xs text-slate-400">
                Corretor ausente
                <select
                  value={absenceBrokerId}
                  onChange={(event) => setAbsenceBrokerId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                >
                  <option value="">Selecione</option>
                  {teamBrokers.map((broker) => (
                    <option key={broker.id} value={broker.id}>
                      {broker.full_name || "Corretor"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Retorno previsto
                <input
                  type="datetime-local"
                  value={absenceEndsAt}
                  onChange={(event) => setAbsenceEndsAt(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-400 lg:col-span-2">
                Motivo auditável
                <input
                  value={absenceReason}
                  onChange={(event) => setAbsenceReason(event.target.value)}
                  minLength={10}
                  maxLength={500}
                  placeholder="Ex.: férias programadas até o retorno informado"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
                />
              </label>
              <div className="lg:col-span-4 flex flex-col gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/[.04] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-3xl text-xs leading-5 text-slate-400">
                  Não é acionado por simples queda de conexão. A operação exige
                  confirmação humana, preserva responsável único, timeline,
                  tarefas abertas e evidência do lote.
                </p>
                <button
                  type="button"
                  disabled={
                    working ||
                    !absenceBrokerId ||
                    !absenceEndsAt ||
                    absenceReason.trim().length < 10
                  }
                  onClick={() => setAbsenceReviewOpen(true)}
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {working ? "Protegendo carteira..." : "Revisar cobertura"}
                </button>
              </div>
            </div>
          </AtlasCard>
        </section>
      ) : null}

      <section className="flex flex-col gap-4 rounded-[24px] border border-white/[.07] bg-white/[.025] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="atlas-eyebrow">Minha disponibilidade</p>
          <p className="mt-1 text-sm text-slate-400">
            O status atualiza a fila em até 15 segundos. Somente “Disponível”
            participa da distribuição.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "available", label: "Disponível" },
              { key: "busy", label: "Ocupado" },
              { key: "offline", label: "Sair da fila" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => void updateAvailability(option.key)}
              className={
                availability === option.key
                  ? "atlas-button-primary"
                  : "atlas-button-secondary"
              }
              aria-pressed={availability === option.key}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_.8fr]">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fila de corretores"
            title="Ordem inteligente de recebimento"
            description="Atualização automática a cada 15 segundos e mesma ordem ponderada do motor."
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={
                    working || !projectId || !unassigned || !brokers.length
                  }
                  onClick={() => void distribute(1)}
                  className="atlas-button-secondary"
                >
                  Distribuir próximo
                </button>
                <button
                  disabled={
                    working || !projectId || !unassigned || !brokers.length
                  }
                  onClick={() => void distribute(Math.min(100, unassigned))}
                  className="atlas-button-primary"
                >
                  {working ? "Equilibrando..." : "Equilibrar pendentes"}
                </button>
              </div>
            }
          />
          <div className="p-5 sm:p-6">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <AtlasSkeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : brokers.length === 0 ? (
              <AtlasEmpty
                reason="not-configured"
                eyebrow="Fila aguardando disponibilidade"
                title="Nenhum corretor disponível"
                description="O corretor aparece aqui ao acessar o Atlas e manter a disponibilidade ativa."
                action={
                  <Link href="/brokers" className="atlas-button-secondary">
                    Revisar equipe
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {brokers.map((broker, index) => {
                  const load = loadMap.get(broker.id);
                  const manager = broker.reports_to
                    ? profilesMap.get(broker.reports_to)
                    : null;
                  const state = stateMap.get(broker.id);
                  return (
                    <article
                      key={broker.id}
                      className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
                    >
                      <div
                        className={`grid h-11 w-11 place-items-center rounded-2xl text-sm font-bold ${index === 0 ? "bg-cyan-400 text-slate-950" : "bg-white/[0.06] text-slate-300"}`}
                      >
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-white">
                            {broker.full_name || "Corretor"}
                          </h3>
                          {index === 0 ? (
                            <AtlasBadge tone="success">PRÓXIMO</AtlasBadge>
                          ) : null}
                          <span className="flex items-center gap-1 text-xs text-emerald-300">
                            <i className="h-2 w-2 rounded-full bg-emerald-400" />{" "}
                            online
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Time {manager?.full_name || "comercial"} · peso{" "}
                          {state?.weight || 1} · última atribuição{" "}
                          {state?.last_assigned_at
                            ? new Date(
                                state.last_assigned_at,
                              ).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "ainda não recebeu"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-semibold text-white">
                          {load?.by_project[projectId] ?? 0}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">
                          neste projeto
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          carga ponderada{" "}
                          {Math.round(
                            ((load?.by_project[projectId] ?? 0) /
                              (state?.weight || 1)) *
                              10,
                          ) / 10}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 35 · Liderança ao vivo"
            title="Gerentes online"
            description="Na superintendência, somente os gerentes diretamente subordinados aparecem."
          />
          <div className="p-5 sm:p-6">
            {loading ? (
              <AtlasSkeleton className="h-52 w-full" />
            ) : managers.length === 0 ? (
              <AtlasEmpty
                title="Nenhum gerente direto online"
                description="A fila continua protegida pelas regras automáticas."
              />
            ) : (
              <div className="space-y-3">
                {managers.map((manager) => {
                  const teamOnline = brokers.filter(
                    (broker) => broker.reports_to === manager.id,
                  ).length;
                  return (
                    <div
                      key={manager.id}
                      className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-white">
                            {manager.full_name || "Gestor comercial"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Gerência direta
                          </p>
                        </div>
                        <span className="flex items-center gap-2 text-xs text-emerald-300">
                          <i className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]" />{" "}
                          online
                        </span>
                      </div>
                      <div className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-slate-400">
                        {teamOnline} corretor{teamOnline === 1 ? "" : "es"}{" "}
                        disponível{teamOnline === 1 ? "" : "is"} no time
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </AtlasCard>
      </section>
      {absenceReviewOpen ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !working)
              setAbsenceReviewOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="absence-review-title"
            className="w-full max-w-xl rounded-[28px] border border-amber-300/20 bg-[#08101f] p-6 shadow-[0_30px_120px_rgba(0,0,0,.65)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="atlas-eyebrow text-amber-200">
                  Revisão humana obrigatória
                </p>
                <h2
                  id="absence-review-title"
                  className="mt-2 text-2xl font-semibold text-white"
                >
                  Confirmar cobertura da carteira?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAbsenceReviewOpen(false)}
                disabled={working}
                className="atlas-button-secondary"
                aria-label="Fechar revisão"
              >
                Fechar
              </button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Corretor ausente
                </p>
                <strong className="mt-2 block text-white">
                  {absenceBroker?.full_name || "Corretor selecionado"}
                </strong>
              </div>
              <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Retorno previsto
                </p>
                <strong className="mt-2 block text-white">
                  {absenceEndsAt
                    ? new Date(absenceEndsAt).toLocaleString("pt-BR")
                    : "Não informado"}
                </strong>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Motivo registrado
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {absenceReason}
              </p>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4 text-xs leading-6 text-slate-300">
              A carteira comercial ativa poderá ser redistribuída somente dentro
              da mesma equipe. Vendas, descartes, timeline, tarefas e o
              histórico de responsabilidade permanecem preservados.
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setAbsenceReviewOpen(false)}
                disabled={working}
                className="atlas-button-secondary"
              >
                Voltar e revisar
              </button>
              <button
                type="button"
                onClick={() => void coverAbsence()}
                disabled={working}
                className="atlas-button-primary disabled:opacity-50"
              >
                {working
                  ? "Ativando cobertura..."
                  : "Confirmar e proteger carteira"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
