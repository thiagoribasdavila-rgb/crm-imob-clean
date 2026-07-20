"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import {
  AtlasBadge,
  AtlasEmpty,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";

// Command Center dedicado · sala de comando em camadas com dados 100% dos endpoints existentes.

type DataRow = Record<string, unknown>;

type ModuleWriteReadiness = {
  state: "ready" | "source-mediated" | "blocked";
  label: string;
  detail: string;
  href: string;
  actionLabel: string;
};

type ModuleHealth = {
  id: string;
  label: string;
  state: "operational" | "degraded" | "unavailable";
  detail: string;
  href: string;
  count: number | null;
  write: ModuleWriteReadiness;
};

type SnapshotData = {
  leads: DataRow[];
  opportunities: DataRow[];
  tasks: DataRow[];
  insights: DataRow[];
  developments: DataRow[];
  profiles: DataRow[];
};

type ModuleHealthApiEnvelope = {
  ok: boolean;
  data?: {
    generatedAt: string;
    snapshot: SnapshotData;
    health: {
      state: "operational" | "degraded" | "attention";
      modules: ModuleHealth[];
    };
  };
  error?: { message?: string };
};

type BriefingSignal = {
  id: string;
  severity: "critical" | "attention" | "opportunity" | "healthy";
  area: string;
  title: string;
  evidence: string;
  action: string;
  href: string;
  impact: number;
};

type Briefing = {
  generatedAt: string;
  status: "critical" | "attention" | "healthy";
  signals: BriefingSignal[];
  model: { generativeReady: boolean; localIntelligenceReady: boolean };
};

type AttentionSignalItem = {
  kind: string;
  severity: "critical" | "warning" | "info";
  reason: string;
  detail: string;
  since: string | null;
  metric: number;
};

type AttentionQueueItem = {
  leadId: string;
  leadName: string;
  status: string;
  score: number;
  topSeverity: "critical" | "warning" | "info";
  topReason: string;
  signals: AttentionSignalItem[];
};

type BrokerDaily = {
  summary: {
    activeLeads: number;
    hotLeads: number;
    openTasks: number;
    overdueTasks: number;
    firstContactOverdue: number;
    followUpOverdue: number;
    agendaNext7Days: number;
    leadsNeedingAttention: number;
  };
  priorities: Array<{
    leadId: string;
    leadName: string;
    status: string;
    score: number;
    priorityScore: number;
    conversionProbability: number;
    reason: string;
    nextBestAction: string;
    dueAt: string | null;
    hot: boolean;
  }>;
  attention: { queue: AttentionQueueItem[] };
  generatedAt: string;
};

type ManagerDaily = {
  totals: {
    brokers: number;
    online: number;
    available: number;
    activeLeads: number;
    hotLeads: number;
    firstContactOverdue: number;
    followUpOverdue: number;
    withoutNextAction: number;
  };
  interventions: Array<{
    brokerId: string;
    brokerName: string;
    severity: "critical" | "attention" | "opportunity";
    reason: string;
    action: string;
    href: string;
  }>;
  generatedAt: string;
};

type TeamSla = {
  totals: {
    alerts: number;
    firstContactOverdue: number;
    followUpOverdue: number;
    brokersWithAlerts: number;
    followUpComplianceRate: number | null;
  };
  generatedAt: string;
};

type SuperintendentSummary = {
  totals: {
    managers: number;
    brokers: number;
    online: number;
    activeLeads: number;
    hotLeads: number;
    firstContactOverdue: number;
    followUpOverdue: number;
  };
  interventions: Array<{
    managerId: string;
    managerName: string;
    severity: "critical" | "attention" | "opportunity";
    reason: string;
    action: string;
    href: string;
  }>;
  generatedAt: string;
};

type DirectorDaily = {
  commercial: { activeLeads: number; hotLeads: number; conversionRate: number };
  risks: Array<{
    severity: "critical" | "attention";
    area: string;
    reason: string;
    action: string;
  }>;
  generatedAt: string;
};

type GovernanceSummary = {
  status: "ready" | "blocked" | "unknown";
  generatedAt: string;
  health: {
    databaseOk: boolean;
    databaseLatencyMs: number;
    environment: string;
    hosting: string;
  };
  queues: {
    tasks: number | null;
    approvals: number | null;
    pendingOutbox: number | null;
    failedOutbox: number | null;
  };
  homologation: { passed: number | null; failed: number | null };
  ai: { calls30d: number; estimatedCostUsd30d: number; measured: boolean };
  critical: Record<string, boolean | null>;
};

const emptySnapshot: SnapshotData = {
  leads: [],
  opportunities: [],
  tasks: [],
  insights: [],
  developments: [],
  profiles: [],
};

const criticalGateLabels: Record<string, string> = {
  database: "Banco",
  https: "HTTPS",
  workerSecret: "Workers",
  failedOutbox: "Fila sem falhas",
  restoreEvidence: "Restauração",
};

// Profundidade 3D sutil: perspective própria no transform (autocontida) e tudo
// condicionado a motion-safe — sob prefers-reduced-motion nada se move.
const depthShell =
  "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:[transform:perspective(1200px)_translateZ(12px)_rotateX(1deg)]";
const depthShellSoft =
  "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:[transform:perspective(1200px)_translateZ(8px)]";
const quickActionClass =
  "grid h-11 w-11 place-items-center rounded-xl border border-white/[.07] bg-white/[.02] text-sm text-slate-300 transition-colors hover:border-white/[.12] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

function stringValue(row: DataRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function numberValue(row: DataRow, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function dateValue(row: DataRow, ...keys: string[]) {
  const value = stringValue(row, ...keys);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function displayName(row: DataRow, fallback: string) {
  return stringValue(row, "name", "title", "full_name") || fallback;
}

function ownerId(row: DataRow) {
  return stringValue(row, "assigned_to", "broker_id", "owner_id", "user_id");
}

function isDoneTask(row: DataRow) {
  return ["done", "concluido", "concluida", "completed", "cancelado"].includes(
    normalized(row.status),
  );
}

function phoneLinks(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const international = digits.startsWith("55") ? digits : `55${digits}`;
  return { call: `tel:+${international}`, whatsapp: `https://wa.me/${international}` };
}

function openCopilot(prompt: string, context: DataRow) {
  window.dispatchEvent(
    new CustomEvent("atlas:open-copilot", { detail: { prompt, context } }),
  );
}

function feedTimestamp(date: Date | null, referenceTime: number) {
  if (!date) return "Data não informada";
  const sameDay = new Date(referenceTime).toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function briefingTone(severity: BriefingSignal["severity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "attention") return "warning" as const;
  if (severity === "opportunity") return "info" as const;
  return "success" as const;
}

function attentionTone(severity: AttentionQueueItem["topSeverity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

function interventionTone(severity: "critical" | "attention" | "opportunity") {
  if (severity === "critical") return "danger" as const;
  if (severity === "attention") return "warning" as const;
  return "info" as const;
}

export default function CommandCenterPage() {
  const [snapshot, setSnapshot] = useState<SnapshotData>(emptySnapshot);
  const [moduleHealth, setModuleHealth] = useState<ModuleHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [viewerId, setViewerId] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingUnavailable, setBriefingUnavailable] = useState(false);
  const [brokerDaily, setBrokerDaily] = useState<BrokerDaily | null>(null);
  const [managerDaily, setManagerDaily] = useState<ManagerDaily | null>(null);
  const [teamSla, setTeamSla] = useState<TeamSla | null>(null);
  const [superintendentSummary, setSuperintendentSummary] = useState<SuperintendentSummary | null>(null);
  const [directorDaily, setDirectorDaily] = useState<DirectorDaily | null>(null);
  const [governance, setGovernance] = useState<GovernanceSummary | null>(null);
  const [governanceNote, setGovernanceNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) throw new Error("ATLAS_SESSION_REQUIRED");

      const response = await fetch("/api/v1/core-v2/module-health", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as ModuleHealthApiEnvelope | null;
      if (!response.ok || !body?.ok || !body.data) throw new Error("ATLAS_MODULE_HEALTH_UNAVAILABLE");

      setViewerId(session.user.id);
      setSnapshot(body.data.snapshot);
      setModuleHealth(body.data.health.modules);
      setWarnings(
        body.data.health.modules
          .filter((module) => module.state !== "operational")
          .map((module) => `${module.label}: ${module.detail}.`),
      );
      setLastUpdated(new Date(body.data.generatedAt));
    } catch {
      setSnapshot(emptySnapshot);
      setModuleHealth([]);
      setWarnings(["Não foi possível atualizar a sala de comando agora. Seus dados permanecem protegidos."]);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Pulso ao vivo: mesma assinatura do /dashboard, com topic próprio para não colidir.
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void load(), 700);
    };
    const channel = supabase
      .channel("atlas-command-center-page-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
      .subscribe((status) => setLiveConnected(status === "SUBSCRIBED"));
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      setLiveConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const referenceTime = lastUpdated?.getTime() ?? 0;
  const viewer = snapshot.profiles.find((profile) => String(profile.id) === viewerId);
  const viewerRole = viewer ? normalized(stringValue(viewer, "commercial_role", "role")) : "";
  const isDirector = viewerRole === "director" || stringValue(viewer ?? {}, "role") === "admin";
  const isSuperintendent = viewerRole === "superintendent";
  const isManager = viewerRole === "manager";
  const isBroker = viewerRole === "broker";

  useEffect(() => {
    if (!viewerId) return;
    let active = true;
    setBriefingUnavailable(false);
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/ai/briefing", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      if (!active) return;
      if (!response.ok) {
        setBriefingUnavailable(true);
        return;
      }
      const body = await response.json();
      if (active) setBriefing(body as Briefing);
    });
    return () => {
      active = false;
    };
  }, [viewerId]);

  useEffect(() => {
    if (!isBroker) {
      setBrokerDaily(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/broker-daily", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      if (response.ok) setBrokerDaily(body.data as BrokerDaily);
      else setWarnings((current) => [...current, "Sua fila do dia está temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isBroker]);

  useEffect(() => {
    if (!isManager) {
      setManagerDaily(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/manager-daily", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      if (response.ok) setManagerDaily(body.data as ManagerDaily);
      else setWarnings((current) => [...current, "Cockpit do gerente temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isManager]);

  useEffect(() => {
    if (!isManager) {
      setTeamSla(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/team-sla", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      if (response.ok) setTeamSla(body.data as TeamSla);
      else setWarnings((current) => [...current, "Fila de SLA temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isManager]);

  useEffect(() => {
    if (!isSuperintendent) {
      setSuperintendentSummary(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/dashboard", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      if (response.ok) setSuperintendentSummary(body.data as SuperintendentSummary);
      else setWarnings((current) => [...current, "Painel da superintendência temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isSuperintendent]);

  useEffect(() => {
    if (!isDirector) {
      setDirectorDaily(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/director-daily", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      if (response.ok) setDirectorDaily(body.data as DirectorDaily);
      else setWarnings((current) => [...current, "Visão executiva temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isDirector]);

  useEffect(() => {
    if (!isDirector) {
      setGovernance(null);
      setGovernanceNote("");
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/governance/command-center", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!active) return;
      if (response.status === 403) {
        setGovernanceNote("Visão executiva disponível somente para a diretoria.");
        return;
      }
      if (!response.ok || !body?.ok || !body.data) {
        setGovernanceNote("Resumo de governança temporariamente indisponível.");
        return;
      }
      setGovernance(body.data as GovernanceSummary);
    });
    return () => {
      active = false;
    };
  }, [isDirector]);

  const metrics = useMemo(() => {
    const active = snapshot.leads.filter(
      (lead) => !["ganho", "perdido", "arquivado", "comprou_outro"].includes(normalized(lead.status)),
    );
    const hot = active.filter(
      (lead) =>
        normalized(lead.temperature) === "quente" ||
        numberValue(lead, "score", "score_ia") >= 70,
    );
    const unassigned = active.filter((lead) => !ownerId(lead));
    const overdueTasks = snapshot.tasks.filter((task) => {
      const dueAt = dateValue(task, "due_at", "due_date");
      return Boolean(dueAt && dueAt.getTime() < referenceTime && !isDoneTask(task));
    });
    return {
      active: active.length,
      hot: hot.length,
      unassigned: unassigned.length,
      overdueTasks: overdueTasks.length,
    };
  }, [snapshot.leads, snapshot.tasks, referenceTime]);

  const liveFeed = useMemo(() => {
    const reference = referenceTime;
    const dayMs = 86_400_000;
    const leadEvents = snapshot.leads.map((lead) => {
      const at = dateValue(lead, "updated_at", "created_at");
      const createdAt = dateValue(lead, "created_at");
      return {
        id: `lead-${String(lead.id)}`,
        href: `/leads/${String(lead.id)}`,
        title: displayName(lead, "Lead sem nome"),
        detail: `Lead · ${stringValue(lead, "status") || "novo"}`,
        at: at?.getTime() ?? 0,
        when: at,
        isNew: Boolean(reference > 0 && createdAt && reference - createdAt.getTime() <= dayMs),
      };
    });
    const taskEvents = snapshot.tasks.map((task) => {
      const at = dateValue(task, "updated_at", "created_at", "due_at", "due_date");
      const leadId = stringValue(task, "lead_id");
      return {
        id: `task-${String(task.id)}`,
        href: leadId ? `/leads/${leadId}` : "/tasks",
        title: displayName(task, "Tarefa"),
        detail: `Tarefa · ${stringValue(task, "status") || "pendente"}`,
        at: at?.getTime() ?? 0,
        when: at,
        isNew: false,
      };
    });
    return [...leadEvents, ...taskEvents].sort((a, b) => b.at - a.at).slice(0, 8);
  }, [snapshot.leads, snapshot.tasks, referenceTime]);

  const phoneByLead = useMemo(
    () =>
      new Map(
        snapshot.leads.map((lead) => [String(lead.id), stringValue(lead, "phone")] as const),
      ),
    [snapshot.leads],
  );

  const managementQueue = useMemo(() => {
    if (isManager) {
      return {
        title: "Onde intervir no time",
        description: "Somente corretores diretamente subordinados. A decisão final continua com você.",
        ready: Boolean(managerDaily),
        items: (managerDaily?.interventions ?? []).slice(0, 5).map((item, index) => ({
          key: `${item.brokerId}-${index}`,
          label: item.brokerName,
          severity: item.severity,
          reason: item.reason,
          action: item.action,
          href: item.href,
        })),
      };
    }
    if (isSuperintendent) {
      return {
        title: "Onde apoiar os gerentes",
        description: "Comparação apenas da sua estrutura direta, sem misturar equipes paralelas.",
        ready: Boolean(superintendentSummary),
        items: (superintendentSummary?.interventions ?? []).slice(0, 5).map((item, index) => ({
          key: `${item.managerId}-${index}`,
          label: item.managerName,
          severity: item.severity,
          reason: item.reason,
          action: item.action,
          href: item.href,
        })),
      };
    }
    if (isDirector) {
      return {
        title: "Decisões que exigem a diretoria",
        description: "Riscos por exceção, com evidência e aprovação humana obrigatória.",
        ready: Boolean(directorDaily),
        items: (directorDaily?.risks ?? []).slice(0, 5).map((risk, index) => ({
          key: `${risk.area}-${index}`,
          label: risk.area,
          severity: risk.severity,
          reason: risk.reason,
          action: risk.action,
          href: "/reports",
        })),
      };
    }
    return null;
  }, [directorDaily, isDirector, isManager, isSuperintendent, managerDaily, superintendentSummary]);

  const roleLabel = isDirector
    ? "Diretoria"
    : isSuperintendent
      ? "Superintendência"
      : isManager
        ? "Gerência"
        : "Corretor";
  const roleDescription = isDirector
    ? "Pulso da organização, sinais da IA e governança consolidados em tempo real."
    : isSuperintendent
      ? "Estrutura direta, movimentos e sinais da IA atualizados ao vivo."
      : isManager
        ? "Time direto, SLA e sinais da IA atualizados ao vivo para intervir cedo."
        : "Sua carteira, sua fila do dia e os sinais da IA em tempo real.";

  const initialLoading = loading && !lastUpdated;

  if (initialLoading) {
    return (
      <div className="space-y-5 pb-12" aria-busy="true" aria-label="Carregando a sala de comando">
        <AtlasSkeleton className="h-28 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AtlasSkeleton className="h-36 w-full" />
          <AtlasSkeleton className="h-36 w-full" />
          <AtlasSkeleton className="h-36 w-full" />
          <AtlasSkeleton className="h-36 w-full" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <AtlasSkeleton className="h-80 w-full" />
          <AtlasSkeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (viewer && viewer.active !== true) {
    return (
      <div className="atlas-panel rounded-2xl p-6">
        <p className="atlas-page-eyebrow">Sala de comando</p>
        <h1 className="mt-1 text-xl font-semibold text-white">Perfil aguardando ativação</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Seu login está correto, mas o perfil comercial está inativo. Um administrador deve ativar
          seu acesso antes de abrir a operação.
        </p>
        <Link href="/settings/profile" className="atlas-button-secondary mt-5 inline-flex min-h-11 items-center">
          Ver situação do perfil
        </Link>
      </div>
    );
  }

  if (!viewerRole) {
    return (
      <div className="atlas-panel rounded-2xl p-6">
        <p className="atlas-page-eyebrow">Sala de comando</p>
        <h1 className="mt-1 text-xl font-semibold text-white">Perfil comercial não identificado</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Seu usuário está autenticado, mas ainda não possui um papel comercial ativo nesta
          organização.
        </p>
        <Link href="/settings/profile" className="atlas-button-secondary mt-5 inline-flex min-h-11 items-center">
          Revisar meu perfil
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12 [perspective:1400px]" data-page="command-center-live">
      <section
        aria-label="Estado da sala de comando"
        className={`atlas-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 sm:p-6 ${depthShellSoft}`}
      >
        <div className="min-w-0">
          <p className="atlas-page-eyebrow">Sala de comando · {roleLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">Command Center</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{roleDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            role="status"
            aria-live="polite"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[.07] bg-white/[.02] px-4 text-xs font-medium text-slate-300"
          >
            <span aria-hidden="true" className="relative inline-flex h-2 w-2">
              {liveConnected ? (
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--atlas-success)] opacity-60 motion-safe:animate-ping" />
              ) : null}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${liveConnected ? "bg-[var(--atlas-success)]" : "bg-[var(--atlas-warning)]"}`}
              />
            </span>
            {liveConnected ? "Ao vivo" : "Reconectando"}
          </span>
          <span className="text-xs text-slate-500">
            {loading
              ? "Atualizando…"
              : lastUpdated
                ? `Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Sincronizando"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Atualizar a sala de comando"
            className="atlas-button-secondary min-h-11 min-w-11 disabled:cursor-wait disabled:opacity-60"
          >
            ↻
          </button>
        </div>
      </section>

      {warnings.length ? (
        <AtlasRecoverableError
          title="Atualização parcial da sala de comando"
          description={warnings.join(" · ")}
          onRetry={() => void load()}
          busy={loading}
          scope="page"
        />
      ) : null}

      <section
        aria-label="Pulso da operação"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [transform-style:preserve-3d]"
      >
        <div className={depthShellSoft}>
          <AtlasMetric label="Leads ativos" value={metrics.active} detail="Base em atendimento no seu escopo" tone="blue" />
        </div>
        <div className={depthShellSoft}>
          <AtlasMetric label="Leads quentes" value={metrics.hot} detail="Score alto ou temperatura quente" tone={metrics.hot ? "amber" : "green"} />
        </div>
        <div className={depthShellSoft}>
          <AtlasMetric label="Tarefas atrasadas" value={metrics.overdueTasks} detail="Prazos vencidos aguardando ação" tone={metrics.overdueTasks ? "rose" : "green"} />
        </div>
        <div className={depthShellSoft}>
          <AtlasMetric label="Sem responsável" value={metrics.unassigned} detail="Leads aguardando distribuição" tone={metrics.unassigned ? "amber" : "green"} />
        </div>
      </section>

      <section
        aria-label="Agora e sinais da IA"
        className="grid gap-4 xl:grid-cols-[1.05fr_.95fr] [transform-style:preserve-3d]"
      >
        <div className={depthShell}>
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="Pulso ao vivo"
              title="Agora"
              description="Novos leads e movimentos recentes, atualizados automaticamente."
              action={
                <AtlasBadge tone={liveConnected ? "success" : "neutral"}>
                  {liveConnected ? "TEMPO REAL" : "ATUALIZAÇÃO SEGURA"}
                </AtlasBadge>
              }
            />
            <div className="border-t border-white/[.06] p-5 sm:p-6">
              {liveFeed.length ? (
                <ul className="grid gap-2">
                  {liveFeed.map((event) => (
                    <li key={event.id}>
                      <Link
                        href={event.href}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/[.06] bg-white/[.02] px-4 py-3 transition-colors hover:border-white/[.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">{event.title}</span>
                            <span className="block text-xs text-slate-500">{event.detail}</span>
                          </span>
                          {event.isNew ? <AtlasBadge tone="info">NOVO</AtlasBadge> : null}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          {feedTimestamp(event.when, referenceTime)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <AtlasEmpty
                  reason="no-activity"
                  title="Sem movimentos recentes"
                  description="Assim que um lead entrar ou uma tarefa mudar, o feed atualiza sozinho."
                />
              )}
            </div>
          </AtlasCard>
        </div>

        <div className={depthShell}>
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="Camada IA"
              title={isBroker ? "Sinais de atenção da sua carteira" : "O que a IA está sinalizando"}
              description={
                isBroker
                  ? "Sinais explicáveis da sua carteira. A IA aponta; a decisão é sua."
                  : "Sinais priorizados por severidade dentro do seu escopo autorizado."
              }
              action={
                briefing && !isBroker ? (
                  <AtlasBadge tone={briefing.status === "critical" ? "danger" : briefing.status === "attention" ? "warning" : "success"}>
                    {briefing.status === "critical" ? "CRÍTICO" : briefing.status === "attention" ? "ATENÇÃO" : "SAUDÁVEL"}
                  </AtlasBadge>
                ) : undefined
              }
            />
            <div className="border-t border-white/[.06] p-5 sm:p-6">
              {isBroker ? (
                !brokerDaily ? (
                  <AtlasSkeleton className="h-48 w-full" />
                ) : brokerDaily.attention.queue.length ? (
                  <ul className="grid gap-2">
                    {brokerDaily.attention.queue.slice(0, 6).map((item) => (
                      <li key={item.leadId}>
                        <Link
                          href={`/leads/${item.leadId}`}
                          className="block rounded-xl border border-white/[.06] bg-white/[.02] p-4 transition-colors hover:border-white/[.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                        >
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium text-white">{item.leadName}</span>
                            <AtlasBadge tone={attentionTone(item.topSeverity)}>
                              {item.topSeverity === "critical" ? "CRÍTICO" : item.topSeverity === "warning" ? "ATENÇÃO" : "INFO"}
                            </AtlasBadge>
                          </span>
                          <span className="mt-1 block text-xs text-slate-400">{item.topReason}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            Score {item.score} · etapa {item.status}
                            {item.signals.length > 1 ? ` · +${item.signals.length - 1} sinal(is)` : ""}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <AtlasEmpty
                    reason="completed"
                    title="Nenhum sinal ativo"
                    description="Nenhum lead da sua carteira está parado, com follow-up vencido ou quente sem contato."
                  />
                )
              ) : briefingUnavailable ? (
                <AtlasEmpty
                  reason="not-configured"
                  title="Sinais indisponíveis agora"
                  description="A leitura preditiva não respondeu. Os demais painéis seguem atualizando normalmente."
                />
              ) : !briefing ? (
                <AtlasSkeleton className="h-48 w-full" />
              ) : (
                <ul className="grid gap-2">
                  {briefing.signals.slice(0, 6).map((signal) => (
                    <li key={signal.id} className="rounded-xl border border-white/[.06] bg-white/[.02] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white">{signal.title}</span>
                        <AtlasBadge tone={briefingTone(signal.severity)}>
                          {signal.severity === "critical"
                            ? "CRÍTICO"
                            : signal.severity === "attention"
                              ? "ATENÇÃO"
                              : signal.severity === "opportunity"
                                ? "OPORTUNIDADE"
                                : "SAUDÁVEL"}
                        </AtlasBadge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{signal.evidence}</p>
                      <Link
                        href={signal.href}
                        className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-[var(--atlas-accent)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                      >
                        {signal.action} →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AtlasCard>
        </div>
      </section>

      {isBroker ? (
        <section aria-label="Fila do dia" className="[transform-style:preserve-3d]">
          <div className={depthShell}>
            <AtlasCard>
              <AtlasCardHeader
                eyebrow="Camada corretor"
                title="Fila do dia"
                description="Quem atender agora, por que entrou na fila e a próxima melhor ação — com atalhos de um clique."
                action={
                  brokerDaily ? (
                    <AtlasBadge tone={brokerDaily.priorities.length ? "info" : "success"}>
                      {brokerDaily.priorities.length
                        ? `${brokerDaily.priorities.length} NA FILA`
                        : "FILA CONCLUÍDA"}
                    </AtlasBadge>
                  ) : undefined
                }
              />
              <div className="border-t border-white/[.06] p-5 sm:p-6">
                {!brokerDaily ? (
                  <AtlasSkeleton className="h-56 w-full" />
                ) : brokerDaily.priorities.length ? (
                  <div className="grid gap-3">
                    {brokerDaily.priorities.map((item, index) => {
                      const contact = phoneLinks(phoneByLead.get(item.leadId) ?? "");
                      const urgent = /sla|vencid|atrasad/i.test(item.reason);
                      return (
                        <article
                          key={item.leadId}
                          className="rounded-2xl border border-white/[.07] bg-white/[.02] p-4 transition-colors hover:border-white/[.12]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span
                                aria-hidden="true"
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/[.07] text-xs font-semibold tabular-nums text-[var(--atlas-accent)]"
                              >
                                {index + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link
                                    href={`/leads/${item.leadId}`}
                                    className="font-semibold text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                                  >
                                    {item.leadName}
                                  </Link>
                                  <AtlasBadge tone={urgent ? "danger" : item.hot ? "warning" : "info"}>
                                    {item.reason}
                                  </AtlasBadge>
                                </div>
                                <p className="mt-1 text-sm leading-6 text-slate-300">{item.nextBestAction}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Score {item.score} · etapa {item.status} · {item.conversionProbability}% de conversão estimada
                                  {item.dueAt
                                    ? ` · prazo ${new Date(item.dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                            <div
                              className="flex shrink-0 items-center gap-2"
                              role="group"
                              aria-label={`Ações rápidas para ${item.leadName}`}
                            >
                              <Link
                                href={`/leads/${item.leadId}`}
                                aria-label={`Abrir lead ${item.leadName}`}
                                title="Abrir lead"
                                className={quickActionClass}
                              >
                                <span aria-hidden="true">👁</span>
                              </Link>
                              {contact ? (
                                <a
                                  href={contact.call}
                                  aria-label={`Ligar para ${item.leadName}`}
                                  title="Ligar"
                                  className={quickActionClass}
                                >
                                  <span aria-hidden="true">📞</span>
                                </a>
                              ) : null}
                              {contact ? (
                                <a
                                  href={contact.whatsapp}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Abrir WhatsApp com ${item.leadName}`}
                                  title="WhatsApp"
                                  className={quickActionClass}
                                >
                                  <span aria-hidden="true">💬</span>
                                </a>
                              ) : null}
                              <button
                                type="button"
                                aria-label={`Preparar abordagem com IA para ${item.leadName}`}
                                title="Preparar com IA"
                                className={quickActionClass}
                                onClick={() =>
                                  openCopilot(
                                    "Prepare uma abordagem curta para esta lead usando apenas o contexto autorizado. Explique a recomendação e não envie mensagem nem altere o CRM.",
                                    {
                                      leadId: item.leadId,
                                      status: item.status,
                                      score: item.score,
                                      reason: item.reason,
                                      nextBestAction: item.nextBestAction,
                                      conversionProbability: item.conversionProbability,
                                    },
                                  )
                                }
                              >
                                <span aria-hidden="true">✦</span>
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <AtlasEmpty
                    reason="completed"
                    title="Fila do dia concluída"
                    description="Sua carteira não possui ação urgente neste momento."
                  />
                )}
              </div>
            </AtlasCard>
          </div>
        </section>
      ) : null}

      {managementQueue ? (
        <section aria-label="Camada gestão" className="[transform-style:preserve-3d]">
          <div className={depthShell}>
            <AtlasCard>
              <AtlasCardHeader
                eyebrow="Camada gestão"
                title={managementQueue.title}
                description={managementQueue.description}
                action={
                  managementQueue.ready ? (
                    <AtlasBadge tone={managementQueue.items.length ? "warning" : "success"}>
                      {managementQueue.items.length
                        ? `${managementQueue.items.length} PARA REVISAR`
                        : "SEM EXCEÇÕES"}
                    </AtlasBadge>
                  ) : undefined
                }
              />
              <div className="border-t border-white/[.06] p-5 sm:p-6">
                {isManager && teamSla ? (
                  <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span className="inline-flex min-h-11 items-center rounded-full border border-white/[.07] px-4">
                      SLA de follow-up:{" "}
                      {teamSla.totals.followUpComplianceRate === null
                        ? "sem amostra"
                        : `${teamSla.totals.followUpComplianceRate}%`}
                    </span>
                    <span className="inline-flex min-h-11 items-center rounded-full border border-white/[.07] px-4">
                      {teamSla.totals.firstContactOverdue} sem primeiro contato
                    </span>
                    <span className="inline-flex min-h-11 items-center rounded-full border border-white/[.07] px-4">
                      {teamSla.totals.brokersWithAlerts} corretor(es) com alerta
                    </span>
                  </div>
                ) : null}
                {!managementQueue.ready ? (
                  <AtlasSkeleton className="h-40 w-full" />
                ) : managementQueue.items.length ? (
                  <ul className="grid gap-2 lg:grid-cols-2">
                    {managementQueue.items.map((item) => (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          className="block h-full rounded-xl border border-white/[.06] bg-white/[.02] p-4 transition-colors hover:border-white/[.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <AtlasBadge tone={interventionTone(item.severity)}>
                              {item.severity === "critical" ? "AGORA" : item.severity === "attention" ? "ATENÇÃO" : "EQUILÍBRIO"}
                            </AtlasBadge>
                            <span className="text-sm font-medium text-white">{item.label}</span>
                          </span>
                          <span className="mt-2 block text-xs leading-5 text-slate-400">{item.reason}</span>
                          <span className="mt-2 block text-xs font-semibold text-[var(--atlas-accent)]">
                            {item.action} →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <AtlasEmpty
                    reason="completed"
                    title="Sem exceções críticas"
                    description="O escopo visível não apresenta intervenção urgente neste momento."
                  />
                )}
              </div>
            </AtlasCard>
          </div>
        </section>
      ) : null}

      <section
        aria-label="Camada operação"
        className={`grid gap-4 [transform-style:preserve-3d] ${isDirector ? "xl:grid-cols-[.95fr_1.05fr]" : ""}`}
      >
        <div className={depthShell}>
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="Camada operação"
              title="Saúde dos módulos"
              description="Estado de leitura e escrita de cada módulo essencial da operação."
            />
            <div className="grid gap-3 border-t border-white/[.06] p-5 sm:grid-cols-2 sm:p-6">
              {moduleHealth.length ? (
                moduleHealth.map((module) => (
                  <Link
                    key={module.id}
                    href={module.href}
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-4 transition-colors hover:border-white/[.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        module.state === "operational"
                          ? "bg-[var(--atlas-success)]"
                          : module.state === "degraded"
                            ? "bg-[var(--atlas-warning)]"
                            : "bg-[var(--atlas-danger)]"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-white">{module.label}</span>
                      <span className="block truncate text-xs text-slate-500">{module.detail}</span>
                    </span>
                    {module.count !== null ? (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                        {module.count}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-600" aria-hidden="true">
                        →
                      </span>
                    )}
                  </Link>
                ))
              ) : (
                <div className="sm:col-span-2">
                  <AtlasEmpty
                    reason="not-configured"
                    title="Saúde dos módulos indisponível"
                    description="Restabeleça a conexão para voltar a acompanhar leitura e escrita dos módulos."
                  />
                </div>
              )}
            </div>
          </AtlasCard>
        </div>

        {isDirector ? (
          <div className={depthShell}>
            <AtlasCard>
              <AtlasCardHeader
                eyebrow="Governança · diretoria"
                title="Pulso do sistema"
                description="Gates críticos, filas e custo medido — visão exclusiva da diretoria."
                action={
                  governance ? (
                    <AtlasBadge tone={governance.status === "ready" ? "success" : governance.status === "blocked" ? "danger" : "warning"}>
                      {governance.status === "ready" ? "PRONTO" : governance.status === "blocked" ? "BLOQUEADO" : "SEM EVIDÊNCIA"}
                    </AtlasBadge>
                  ) : undefined
                }
              />
              <div className="border-t border-white/[.06] p-5 sm:p-6">
                {governanceNote ? (
                  <p className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-sm text-slate-400">
                    {governanceNote}
                  </p>
                ) : !governance ? (
                  <AtlasSkeleton className="h-48 w-full" />
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4">
                        <p className="text-xs text-slate-500">Banco</p>
                        <p className="atlas-metric-number mt-1 text-xl font-semibold text-white">
                          {governance.health.databaseLatencyMs} ms
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {governance.health.databaseOk ? "Consulta aprovada" : "Sem evidência"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4">
                        <p className="text-xs text-slate-500">Fila de integração</p>
                        <p className="atlas-metric-number mt-1 text-xl font-semibold text-white">
                          {governance.queues.pendingOutbox ?? "—"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {governance.queues.failedOutbox ?? "—"} falhas ou dead letter
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4">
                        <p className="text-xs text-slate-500">Custo IA · 30 dias</p>
                        <p className="atlas-metric-number mt-1 text-xl font-semibold text-white">
                          {governance.ai.measured ? `US$ ${governance.ai.estimatedCostUsd30d.toFixed(2)}` : "—"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{governance.ai.calls30d} chamadas medidas</p>
                      </div>
                      <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4">
                        <p className="text-xs text-slate-500">Homologação</p>
                        <p className="atlas-metric-number mt-1 text-xl font-semibold text-white">
                          {governance.homologation.passed ?? "—"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {governance.homologation.failed ?? "—"} reprovações
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2" aria-label="Gates críticos">
                      {Object.entries(governance.critical).map(([key, value]) => (
                        <span
                          key={key}
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[.07] px-4 text-xs text-slate-300"
                        >
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${
                              value === true
                                ? "bg-[var(--atlas-success)]"
                                : value === false
                                  ? "bg-[var(--atlas-danger)]"
                                  : "bg-[var(--atlas-warning)]"
                            }`}
                          />
                          {criticalGateLabels[key] || key}
                        </span>
                      ))}
                    </div>
                    <p className="text-right text-[11px] text-slate-600">
                      Atualizado em {new Date(governance.generatedAt).toLocaleString("pt-BR")} ·{" "}
                      {governance.health.hosting} · {governance.health.environment}
                    </p>
                  </div>
                )}
              </div>
            </AtlasCard>
          </div>
        ) : null}
      </section>

      <p className="text-center text-[11px] text-slate-600">
        A IA sugere e explica; nenhuma ação é executada sem a sua confirmação.
      </p>
    </div>
  );
}
