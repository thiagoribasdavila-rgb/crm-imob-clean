"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { supabase } from "@/lib/supabase";

type Profile = { id: string; full_name: string | null; reports_to: string | null; resolved_role: string };
type Presence = { profile_id: string; availability: string; last_seen_at: string; online: boolean };
type Project = { id: string; name: string; developer_name: string | null; status: string | null };
type Load = { profile_id: string; total: number; by_project: Record<string, number> };
type QueueState = { profile_id: string; development_id: string; enabled: boolean; weight: number; assignments_count: number; last_assigned_at: string | null };
type Capacity = { profile_id:string;max_active_leads:number;max_project_leads:number;warning_percent:number;updated_at:string };
type PriorityRule={development_id:string;source_key:string;priority:number;sla_minutes:number;enabled:boolean;updated_at:string};
type PortfolioAudit={events:Array<{occurredAt:string;eventType:string;brokerId:string|null;leadId:string|null;developmentId:string|null;actorId:string;details:Record<string,unknown>}>;summary:{total:number;distributions:number;transfers:number;reservations:number;returns:number;absences:number;capacityChanges:number};maximum:number;hierarchicalScope:boolean;piiExposed:boolean;immutableSources:boolean;generatedAt:string};
type Assignment = { id:string;development_id:string;lead_id:string;assigned_to:string;created_at:string;score_snapshot:{algorithm?:string;projectLoadBefore?:number;weight?:number;weightedLoadBefore?:number} };
type UnassignedLead={id:string;developmentId:string|null;source:string;status:string;createdAt:string;waitingMinutes:number};
type Payload = { viewer: { id: string; role: string }; rules: { algorithm: string; presenceWindowSeconds: number; onlineOnly: boolean; projectScoped: boolean; weightedLoad: boolean; atomicLock: boolean;singleOwner:boolean;explainable:boolean }; projects: Project[]; profiles: Profile[]; presence: Presence[]; loads: Load[]; queue: QueueState[];capacity:Capacity[];priorityRules:PriorityRule[];leadSources:string[];portfolioAudit:PortfolioAudit;recentAssignments:Assignment[];unassignedQueue:UnassignedLead[];unassignedPolicy:{metadataOnly:boolean;piiExposed:boolean;automaticAssignment:boolean;explicitLeadershipAction:boolean;maximumVisible:number}; unassigned: Record<string, number>; generatedAt: string };

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

/* CC-6: campo, rótulo e chip-botão padronizados; tempo de espera em unidade
   única honesta (min/h/d) reusado no herói e na fila sem responsável. */
const FIELD_CLASS =
  "mt-2 w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3 py-2.5 text-sm text-[#e8eef8] outline-none transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] disabled:opacity-50";
const LABEL_CLASS = "block text-xs text-[#6b7890]";
const CHIP_ACTIVE = "border-[color:var(--atlas-accent)]! text-[#e8eef8]!";
const CHIP_IDLE = "hover:border-[rgba(148,163,184,0.35)]! hover:text-[#e8eef8]!";

function waitLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

const AUDIT_EVENT_LABELS: Record<string, string> = {
  distribution: "Distribuição",
  transfer: "Transferência",
  reservation_pending: "Reserva criada",
  reservation_accepted: "Reserva aceita",
  reservation_expired: "Devolução à fila",
  reservation_superseded: "Reserva superada",
  absence: "Cobertura de ausência",
  capacity: "Limite de capacidade",
};

export default function DistributionPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [availability, setAvailability] = useState<"available" | "busy" | "offline">("available");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [absenceBrokerId, setAbsenceBrokerId] = useState("");
  const [absenceEndsAt, setAbsenceEndsAt] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  const [capacityBrokerId, setCapacityBrokerId] = useState("");
  const [maxActiveLeads, setMaxActiveLeads] = useState(100);
  const [maxProjectLeads, setMaxProjectLeads] = useState(50);
  const [warningPercent, setWarningPercent] = useState(80);
  const [capacityReason, setCapacityReason] = useState("");
  const [prioritySource,setPrioritySource]=useState("");
  const [sourcePriority,setSourcePriority]=useState(5);
  const [sourceSlaMinutes,setSourceSlaMinutes]=useState(60);
  const [priorityReason,setPriorityReason]=useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const token = await accessToken();
      const response = await fetch("/api/v1/crm/distribution", { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) setError(result.error?.message || "Falha ao carregar a fila.");
      else {
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

  const heartbeat = useCallback(async (nextAvailability: "available" | "busy" | "offline" = availability) => {
    const token = await accessToken();
    await fetch("/api/v1/crm/distribution", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "heartbeat", availability: nextAvailability }),
    });
  }, [availability]);

  useEffect(() => {
    void heartbeat().then(() => load());
    const beat = window.setInterval(() => void heartbeat(), 30_000);
    const refresh = window.setInterval(() => void load(true), 15_000);
    return () => { window.clearInterval(beat); window.clearInterval(refresh); };
  }, [heartbeat, load]);

  async function updateAvailability(next: "available" | "busy" | "offline") {
    setAvailability(next);
    await heartbeat(next);
    await load(true);
  }

  async function distribute(limit: number) {
    if (!projectId) return;
    setWorking(true); setError(""); setNotice("");
    const token = await accessToken();
    const response = await fetch("/api/v1/crm/distribution", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "distribute", developmentId: projectId, limit }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível distribuir.");
    else setNotice(`${result.data.distributed} lead${result.data.distributed === 1 ? "" : "s"} distribuída${result.data.distributed === 1 ? "" : "s"}. Responsável único preservado; escolha explicada por carga ponderada e última atribuição.`);
    await load(true); setWorking(false);
  }

  async function configureMember(profileId: string, enabled: boolean, weight: number) {
    if (!projectId) return;
    setWorking(true); setError(""); setNotice("");
    const response = await fetch("/api/v1/crm/distribution", { method: "POST", headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "configure_member", developmentId: projectId, profileId, enabled, weight }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível atualizar a elegibilidade.");
    else setNotice(`Elegibilidade atualizada somente para ${selectedProject?.name || "o projeto selecionado"}.`);
    await load(true); setWorking(false);
  }

  async function coverAbsence() {
    if (!absenceBrokerId || !absenceEndsAt || absenceReason.trim().length < 10) return;
    if (!window.confirm("Confirmar a cobertura? A carteira comercial ativa será redistribuída dentro da mesma equipe.")) return;
    setWorking(true); setError(""); setNotice("");
    const response = await fetch("/api/v1/crm/distribution", { method: "POST", headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "cover_absence", profileId: absenceBrokerId, endsAt: new Date(absenceEndsAt).toISOString(), reason: absenceReason.trim(), limit: 200 }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível ativar a cobertura.");
    else { setNotice(`Cobertura registrada: ${result.data.transferred} lead(s) ativa(s) redistribuída(s), com histórico e tarefas preservados.`); setAbsenceBrokerId(""); setAbsenceEndsAt(""); setAbsenceReason(""); }
    await load(true); setWorking(false);
  }

  async function configureCapacity() {
    if (!capacityBrokerId || capacityReason.trim().length < 10 || maxProjectLeads > maxActiveLeads) return;
    setWorking(true); setError(""); setNotice("");
    const response = await fetch("/api/v1/crm/distribution", { method:"POST", headers:{ Authorization:`Bearer ${await accessToken()}`, "Content-Type":"application/json" }, body:JSON.stringify({ action:"configure_capacity", profileId:capacityBrokerId, maxActiveLeads, maxProjectLeads, warningPercent, reason:capacityReason.trim() }) });
    const result=await response.json();
    if(!response.ok)setError(result.error?.message||"Não foi possível atualizar a capacidade.");
    else { setNotice(`Capacidade atualizada: ${result.data.maxActiveLeads} leads ativas e ${result.data.maxProjectLeads} por projeto.${result.data.currentlyOverLimit?" A carteira atual já está acima do novo limite; novas entradas foram bloqueadas.":""}`);setCapacityReason(""); }
    await load(true);setWorking(false);
  }

  async function configurePriority(){
    if(!projectId||!prioritySource||priorityReason.trim().length<10)return;
    setWorking(true);setError("");setNotice("");
    const response=await fetch("/api/v1/crm/distribution",{method:"POST",headers:{Authorization:`Bearer ${await accessToken()}`,"Content-Type":"application/json"},body:JSON.stringify({action:"configure_priority",developmentId:projectId,sourceKey:prioritySource,priority:sourcePriority,slaMinutes:sourceSlaMinutes,enabled:true,reason:priorityReason.trim()})});
    const result=await response.json();if(!response.ok)setError(result.error?.message||"Não foi possível salvar a prioridade.");else{setNotice(`Regra salva para ${result.data.sourceKey}: prioridade ${result.data.priority}, SLA ${result.data.slaMinutes} minutos.`);setPriorityReason("");}await load(true);setWorking(false);
  }

  const presenceMap = useMemo(() => new Map((data?.presence ?? []).map((item) => [item.profile_id, item])), [data]);
  const loadMap = useMemo(() => new Map((data?.loads ?? []).map((item) => [item.profile_id, item])), [data]);
  const stateMap = useMemo(() => new Map((data?.queue ?? []).filter((item) => item.development_id === projectId).map((item) => [item.profile_id, item])), [data, projectId]);
  const capacityMap = useMemo(() => new Map((data?.capacity ?? []).map((item) => [item.profile_id,item])),[data]);
  const profilesMap = useMemo(() => new Map((data?.profiles ?? []).map((item) => [item.id, item])), [data]);
  const managers = (data?.profiles ?? []).filter((item) => item.resolved_role === "manager" && (data?.viewer.role !== "superintendent" || item.reports_to === data.viewer.id) && presenceMap.get(item.id)?.online);
  const teamBrokers = (data?.profiles ?? []).filter((item) => item.resolved_role === "broker" && (data?.viewer.role !== "manager" || item.reports_to === data.viewer.id));
  const brokers = (data?.profiles ?? []).filter((item) => item.resolved_role === "broker" && presenceMap.get(item.id)?.online && presenceMap.get(item.id)?.availability === "available" && stateMap.get(item.id)?.enabled !== false).sort((a, b) => {
    const aLoad = (loadMap.get(a.id)?.by_project[projectId] ?? 0) / (stateMap.get(a.id)?.weight || 1);
    const bLoad = (loadMap.get(b.id)?.by_project[projectId] ?? 0) / (stateMap.get(b.id)?.weight || 1);
    if (aLoad !== bLoad) return aLoad - bLoad;
    return (stateMap.get(a.id)?.last_assigned_at || "").localeCompare(stateMap.get(b.id)?.last_assigned_at || "");
  });
  const selectedProject = data?.projects.find((item) => item.id === projectId);
  const unassigned = data?.unassigned[projectId] ?? 0;
  const weightedLoads = brokers.map((broker) => (loadMap.get(broker.id)?.by_project[projectId] ?? 0) / (stateMap.get(broker.id)?.weight || 1));
  const balanceGap = weightedLoads.length > 1 ? Math.round((Math.max(...weightedLoads) - Math.min(...weightedLoads)) * 10) / 10 : 0;
  const selectedQueue = (data?.unassignedQueue ?? []).filter((item) => !projectId || item.developmentId === projectId);
  const oldestWaitingMinutes = selectedQueue.reduce((maximum, item) => Math.max(maximum, item.waitingMinutes), 0);
  const brokersNearCapacity = teamBrokers.filter((broker) => {
    const capacity = capacityMap.get(broker.id);
    if (!capacity) return false;
    const currentLoad = loadMap.get(broker.id)?.total ?? 0;
    return currentLoad >= capacity.max_active_leads * (capacity.warning_percent / 100);
  }).length;
  const conversionSignals = [
    unassigned > 0 ? { title: "Leads aguardando responsável", value: String(unassigned), detail: "A liderança decide quando liberar a próxima distribuição." } : null,
    oldestWaitingMinutes >= 60 ? { title: "SLA de entrada pressionado", value: oldestWaitingMinutes < 1440 ? `${Math.floor(oldestWaitingMinutes / 60)} h` : `${Math.floor(oldestWaitingMinutes / 1440)} d`, detail: "Tempo da lead mais antiga na fila selecionada." } : null,
    unassigned > 0 && brokers.length === 0 ? { title: "Sem capacidade online", value: "AÇÃO", detail: "Há demanda, mas nenhum corretor elegível está disponível agora." } : null,
    brokersNearCapacity > 0 ? { title: "Carteiras próximas do limite", value: String(brokersNearCapacity), detail: "Apoie o time antes de distribuir novos atendimentos." } : null,
    balanceGap > 1 ? { title: "Desvio de carga no projeto", value: String(balanceGap), detail: "Revise peso, presença e capacidade antes de um novo lote." } : null,
  ].filter((signal): signal is { title: string; value: string; detail: string } => Boolean(signal)).slice(0, 3);

  function openCapacityCopilot() {
    window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: {
      prompt: `Analise uma fila comercial do projeto ${selectedProject?.name || "selecionado"} com ${unassigned} leads aguardando, ${brokers.length} corretores disponíveis, espera máxima de ${oldestWaitingMinutes} minutos, ${brokersNearCapacity} carteiras próximas do limite e desvio de carga ${balanceGap}. Sugira até três decisões para proteger velocidade e conversão. Não distribua leads, não altere capacidade e não envie mensagens.`,
      context: { module: "distribution-capacity", projectId: projectId || null, humanApprovalRequired: true },
    } }));
  }

  const heroMetrics = [
    { label: "aguardando no projeto", value: loading ? "—" : String(unassigned), ink: !loading && unassigned > 0 ? "cc6-warn" : "" },
    { label: "corretores disponíveis", value: loading ? "—" : String(brokers.length), ink: !loading && !brokers.length && unassigned > 0 ? "cc6-crit" : "" },
    { label: "gestores online", value: loading ? "—" : String(managers.length), ink: "" },
    { label: "espera máxima", value: loading || !selectedQueue.length ? "—" : waitLabel(oldestWaitingMinutes), ink: !loading && oldestWaitingMinutes >= 60 ? "cc6-warn" : "" },
    { label: "desvio de carga", value: loading || weightedLoads.length < 2 ? "—" : String(balanceGap), ink: !loading && balanceGap > 1 ? "cc6-warn" : "" },
  ];

  return (
    <div className="space-y-4 pb-10" data-phase="51-explainable-distribution" data-evolution-phase="46" data-distribution-layout="capacity-first">
      <PageHeader
        eyebrow="Distribuição comercial · Fila ao vivo"
        title="Quem recebe a próxima lead"
        description="Disponibilidade, projeto, carteira e última atribuição definem a ordem — cada gestor enxerga somente a própria estrutura."
      />

      {/* Herói de comando: projeto, números decisivos e a minha presença na
          fila em um único painel — as listas abaixo só detalham. */}
      <section aria-label="Contexto e números da distribuição">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6" delayMs={0}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 lg:max-w-sm lg:flex-1">
              <label className="cc6-eyebrow" htmlFor="project">Projeto da distribuição</label>
              <select id="project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className={FIELD_CLASS}>
                <option value="">Selecione um projeto</option>
                {data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <p className="mt-2 text-xs text-[#6b7890]">{selectedProject?.developer_name || "Incorporadora não informada"}</p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4" aria-busy={loading}>
              {heroMetrics.map((metric) => (
                <div key={metric.label}>
                  <p className={`cc6-metric-value text-2xl leading-none ${metric.ink}`}>{metric.value}</p>
                  <p className="cc6-metric-label mt-1.5">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="cc6-hairline mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
            <p className="cc6-eyebrow text-[10px]!">Minha disponibilidade</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Minha disponibilidade na fila">
              {([{ key: "available", label: "Disponível" }, { key: "busy", label: "Ocupado" }, { key: "offline", label: "Sair da fila" }] as const).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => void updateAvailability(option.key)}
                  aria-pressed={availability === option.key}
                  className={`cc6-chip cursor-pointer transition-colors ${availability === option.key ? CHIP_ACTIVE : CHIP_IDLE}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#6b7890]">Atualiza a fila em até 15 s · somente “Disponível” recebe leads.</p>
          </div>
        </TiltShell>
      </section>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
      {notice ? <div className="cc6-panel-quiet cc6-ok px-4 py-3 text-sm leading-6" role="status" aria-live="polite">{notice}</div> : null}

      <section data-phase="46-distribution-capacity-decision">
        <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "60ms" }}>
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <p className="cc6-eyebrow">Fase 46 · Proteção da conversão</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Antes de distribuir</h2>
            </div>
            <button type="button" onClick={openCapacityCopilot} disabled={!projectId || loading} className="cc6-ghost-btn disabled:opacity-50">
              ✦ Preparar decisão com IA
            </button>
          </header>
          {conversionSignals.length ? (
            conversionSignals.map((signal, index) => (
              <article
                key={signal.title}
                className="cc6-reveal cc6-hairline cc6-sev-band flex items-baseline gap-4 px-5 py-3"
                style={{ animationDelay: `${100 + index * 60}ms`, "--cc6-sev": "#f5b544" } as CSSProperties}
              >
                <span className="cc6-metric-value w-14 shrink-0 text-right text-lg cc6-warn">{signal.value}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-[#e8eef8]">{signal.title}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">{signal.detail}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="cc6-hairline px-5 py-4 text-sm leading-6 text-[#6b7890]">
              Sem pressão crítica na fila selecionada — presença, espera e carga seguem monitoradas.
            </p>
          )}
          <p className="cc6-hairline px-5 py-2.5 text-[10px] leading-4 text-[#6b7890]">
            IA analisa sem PII · distribuir, alterar limites e aprovar continuam decisões humanas.
          </p>
        </div>
      </section>

      <section data-phase="52-unassigned-lead-queue">
        <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "100ms" }}>
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <p className="cc6-eyebrow">Fase 52 · Fila sem responsável</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Leads aguardando distribuição</h2>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                disabled={working || !projectId || !brokers.length || !unassigned}
                onClick={() => void distribute(Math.min(100, unassigned))}
                className="cc6-ghost-btn disabled:opacity-50"
              >
                {working ? "Equilibrando..." : "Equilibrar pendentes"}
              </button>
              <button
                type="button"
                disabled={working || !projectId || !brokers.length || !unassigned}
                onClick={() => void distribute(1)}
                className="atlas-button-primary disabled:opacity-50"
              >
                Distribuir próxima
              </button>
            </div>
          </header>
          {selectedQueue.length ? (
            selectedQueue.slice(0, 12).map((item, index) => {
              const pressured = item.waitingMinutes >= 60;
              return (
                <article
                  key={item.id}
                  className={`cc6-reveal cc6-hairline flex items-center gap-4 px-5 py-3 ${pressured ? "cc6-sev-band" : ""}`}
                  style={{ animationDelay: `${120 + Math.min(index, 8) * 45}ms`, ...(pressured ? { "--cc6-sev": "#f5b544" } : {}) } as CSSProperties}
                >
                  <strong className="cc6-num shrink-0 text-sm font-medium text-[#e8eef8]">Lead {item.id.slice(0, 8)}</strong>
                  <span className="min-w-0 flex-1 truncate text-xs text-[#6b7890]">{item.source} · {item.status}</span>
                  <span className={`cc6-num shrink-0 text-xs ${pressured ? "cc6-warn" : "text-[#aab6ca]"}`}>{waitLabel(item.waitingMinutes)}</span>
                </article>
              );
            })
          ) : (
            <p className="cc6-hairline px-5 py-4 text-sm leading-6 text-[#6b7890]">
              Fila sem pendências no projeto selecionado.{" "}
              <Link href="/pipeline" className="font-medium text-[color:var(--atlas-accent)] hover:underline">Revisar pipeline</Link>
            </p>
          )}
          <p className="cc6-hairline px-5 py-2.5 text-[10px] leading-4 text-[#6b7890]">
            Somente metadados, até 100 visíveis — sem nome, telefone ou e-mail · a distribuição atribui atomicamente a lead mais antiga do projeto, sempre por decisão explícita da liderança.
          </p>
        </div>
      </section>

      {/* Quem recebe: a ordem ponderada com nomes fortes; liderança ao lado. */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="cc6-panel cc6-reveal self-start overflow-hidden" style={{ animationDelay: "140ms" }} aria-labelledby="distribution-order-title">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <p className="cc6-eyebrow">Fila de corretores</p>
              <h2 id="distribution-order-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Ordem de recebimento</h2>
            </div>
            {!loading && weightedLoads.length > 1 ? (
              <span className={`cc6-chip ${balanceGap > 1 ? "cc6-warn border-[rgba(245,181,68,0.28)]!" : ""}`} title="Diferença entre a maior e a menor carga ponderada dos corretores elegíveis neste projeto.">
                desvio {balanceGap}
              </span>
            ) : null}
          </header>
          <div aria-busy={loading}>
            {loading ? (
              <div className="cc6-hairline space-y-2 p-5">
                {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-14" />)}
              </div>
            ) : brokers.length === 0 ? (
              <p className="cc6-hairline px-5 py-5 text-sm leading-6 text-[#6b7890]">
                Nenhum corretor disponível — o corretor entra na fila ao acessar o Atlas com disponibilidade ativa.{" "}
                <Link href="/brokers" className="font-medium text-[color:var(--atlas-accent)] hover:underline">Revisar equipe</Link>
              </p>
            ) : (
              brokers.map((broker, index) => {
                const brokerLoad = loadMap.get(broker.id);
                const manager = broker.reports_to ? profilesMap.get(broker.reports_to) : null;
                const state = stateMap.get(broker.id);
                const projectLoad = brokerLoad?.by_project[projectId] ?? 0;
                return (
                  <article
                    key={broker.id}
                    className="cc6-reveal cc6-hairline flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[rgba(75,141,248,0.04)]"
                    style={{ animationDelay: `${160 + Math.min(index, 8) * 45}ms` }}
                  >
                    <span className={`cc6-metric-value w-8 shrink-0 text-center text-lg ${index === 0 ? "text-[color:var(--atlas-accent)]!" : "text-[#6b7890]!"}`} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#e8eef8]">{broker.full_name || "Corretor"}</h3>
                        {index === 0 ? <StatusBadge tone="info">Próximo</StatusBadge> : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#6b7890]">
                        Time {manager?.full_name || "comercial"} · peso {state?.weight || 1} · última atribuição {state?.last_assigned_at ? new Date(state.last_assigned_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "ainda não recebeu"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="cc6-metric-value text-lg leading-none">{projectLoad}</p>
                      <p className="cc6-metric-label mt-1" title="Leads ativas neste projeto · carga ÷ peso">
                        no projeto · pond. <span className="cc6-num">{Math.round((projectLoad / (state?.weight || 1)) * 10) / 10}</span>
                      </p>
                    </div>
                  </article>
                );
              })
            )}
          </div>
          <p className="cc6-hairline px-5 py-2.5 text-[10px] leading-4 text-[#6b7890]">
            Somente corretores online, disponíveis e elegíveis no projeto · ordem por carga ponderada e última atribuição, a mesma do motor.
          </p>
        </div>

        <div className="cc6-panel-quiet cc6-reveal self-start p-4" style={{ animationDelay: "180ms" }} aria-labelledby="distribution-managers-title">
          <p className="cc6-eyebrow">Fase 35 · Liderança ao vivo</p>
          <h2 id="distribution-managers-title" className="mt-1 text-sm font-semibold tracking-tight text-[#e8eef8]">Gerentes online</h2>
          <div className="mt-2 flex flex-col" aria-busy={loading}>
            {loading ? (
              <AtlasSkeleton className="h-24" />
            ) : managers.length === 0 ? (
              <p className="py-2 text-xs leading-5 text-[#6b7890]">Nenhum gerente direto online — as regras automáticas seguem protegendo a fila.</p>
            ) : (
              managers.map((manager, index) => {
                const teamOnline = brokers.filter((broker) => broker.reports_to === manager.id).length;
                return (
                  <div key={manager.id} className={`flex items-baseline justify-between gap-3 py-2.5 ${index ? "cc6-hairline" : ""}`}>
                    <span className="min-w-0 truncate text-xs font-medium text-[#e8eef8]">{manager.full_name || "Gestor comercial"}</span>
                    <span className="cc6-num shrink-0 text-[11px] text-[#6b7890]">
                      <span className={teamOnline ? "cc6-ok" : ""}>{teamOnline}</span> disponíve{teamOnline === 1 ? "l" : "is"} no time
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <p className="cc6-hairline mt-1 pt-2.5 text-[10px] leading-4 text-[#6b7890]">
            Na superintendência aparecem somente os gerentes diretamente subordinados.
          </p>
        </div>
      </section>

      <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "220ms" }} aria-labelledby="distribution-evidence-title">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <p className="cc6-eyebrow">Fase 51 · Evidência de distribuição</p>
            <h2 id="distribution-evidence-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Por que cada lead foi atribuída</h2>
          </div>
          <span className="cc6-chip" title="Cada evento preserva projeto, responsável único, carga anterior, peso e algoritmo usado.">responsável único</span>
        </header>
        {data?.recentAssignments.filter((item) => !projectId || item.development_id === projectId).length ? (
          data.recentAssignments.filter((item) => !projectId || item.development_id === projectId).slice(0, 8).map((item, index) => {
            const broker = profilesMap.get(item.assigned_to);
            return (
              <article key={item.id} className="cc6-reveal cc6-hairline flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3" style={{ animationDelay: `${240 + Math.min(index, 8) * 45}ms` }}>
                <strong className="text-sm font-semibold text-[#e8eef8]">{broker?.full_name || "Corretor"}</strong>
                <span className="cc6-num min-w-0 truncate text-xs text-[#6b7890]">Lead {item.lead_id.slice(0, 8)} · {new Date(item.created_at).toLocaleString("pt-BR")}</span>
                <span className="cc6-num ml-auto shrink-0 text-xs text-[#aab6ca]" title="Carga anterior no projeto ÷ peso = carga ponderada no momento da escolha.">
                  {item.score_snapshot?.projectLoadBefore ?? "—"} ÷ {item.score_snapshot?.weight ?? 1} = {item.score_snapshot?.weightedLoadBefore ?? "—"}
                </span>
              </article>
            );
          })
        ) : (
          <p className="cc6-hairline px-5 py-4 text-sm leading-6 text-[#6b7890]">
            Sem atribuições recentes — as próximas distribuições terão justificativa auditável.
          </p>
        )}
      </div>

      {data?.portfolioAudit ? (
        <section data-phase="59-portfolio-audit">
          <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "260ms" }} aria-labelledby="distribution-audit-title">
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <div>
                <p className="cc6-eyebrow">Fase 59 · Livro da carteira</p>
                <h2 id="distribution-audit-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Histórico gerencial unificado</h2>
              </div>
              <span className="cc6-chip">até {data.portfolioAudit.maximum} eventos</span>
            </header>
            <div className="mt-3 flex flex-wrap gap-1.5 px-5 pb-4" aria-label="Resumo por tipo de movimento">
              {([["distribuições", data.portfolioAudit.summary.distributions], ["transferências", data.portfolioAudit.summary.transfers], ["reservas", data.portfolioAudit.summary.reservations], ["devoluções", data.portfolioAudit.summary.returns], ["ausências", data.portfolioAudit.summary.absences], ["capacidade", data.portfolioAudit.summary.capacityChanges]] as const).map(([label, value]) => (
                <span key={label} className="cc6-chip">
                  {label} <strong className="font-semibold text-[#e8eef8]">{value}</strong>
                </span>
              ))}
            </div>
            {data.portfolioAudit.events.length ? (
              data.portfolioAudit.events.slice(0, 20).map((event, index) => (
                <article key={`${event.eventType}-${event.occurredAt}-${index}`} className="cc6-hairline flex items-baseline gap-3 px-5 py-2.5">
                  <strong className="shrink-0 text-xs font-medium text-[#e8eef8]">{AUDIT_EVENT_LABELS[event.eventType] || event.eventType}</strong>
                  <span className="min-w-0 flex-1 truncate text-xs text-[#6b7890]">
                    {event.brokerId ? profilesMap.get(event.brokerId)?.full_name || "Corretor no escopo" : "Operação gerencial"}
                    {event.leadId ? ` · Lead ${event.leadId.slice(0, 8)}` : ""}
                  </span>
                  <time className="cc6-num shrink-0 text-[11px] text-[#6b7890]">{new Date(event.occurredAt).toLocaleString("pt-BR")}</time>
                </article>
              ))
            ) : (
              <p className="cc6-hairline px-5 py-4 text-sm leading-6 text-[#6b7890]">
                Histórico ainda vazio — os próximos movimentos aparecem aqui com rastreabilidade.
              </p>
            )}
            <p className="cc6-hairline px-5 py-2.5 text-[10px] leading-4 text-[#6b7890]">
              Escopo hierárquico · fontes operacionais preservadas · nome, telefone, e-mail e textos livres da lead não expostos.
            </p>
          </div>
        </section>
      ) : null}

      {data?.viewer.role === "manager" ? (
        <section aria-label="Fase 39: elegibilidade por projeto">
          <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "300ms" }} aria-labelledby="distribution-eligibility-title">
            <header className="px-5 pt-5 pb-3">
              <p className="cc6-eyebrow">Fase 39 · Equilíbrio por projeto</p>
              <h2 id="distribution-eligibility-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Elegibilidade do time neste empreendimento</h2>
              <p className="mt-1 text-xs leading-5 text-[#6b7890]">Ativar, pausar ou ponderar aqui vale somente para {selectedProject?.name || "o projeto selecionado"}.</p>
            </header>
            {teamBrokers.length ? (
              teamBrokers.map((broker) => {
                const state = stateMap.get(broker.id);
                const enabled = state?.enabled !== false;
                const online = presenceMap.get(broker.id)?.online && presenceMap.get(broker.id)?.availability === "available";
                return (
                  <article key={broker.id} className="cc6-hairline flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#e8eef8]">{broker.full_name || "Corretor"}</h3>
                        {!enabled ? <StatusBadge tone="neutral">Pausado</StatusBadge> : null}
                      </div>
                      <p className={`mt-0.5 text-xs ${online ? "cc6-ok" : "text-[#6b7890]"}`}>{online ? "Online e disponível" : "Fora da fila agora"}</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-[11px] text-[#6b7890]">
                      Peso
                      <select
                        value={state?.weight || 1}
                        disabled={working}
                        onChange={(event) => void configureMember(broker.id, enabled, Number(event.target.value))}
                        className="rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-2.5 py-1.5 text-sm text-[#e8eef8] outline-none transition-colors focus:border-[color:var(--atlas-accent)] disabled:opacity-50"
                      >
                        {[1,2,3,4,5,6,7,8,9,10].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void configureMember(broker.id, !enabled, state?.weight || 1)}
                      className={enabled ? "cc6-ghost-btn disabled:opacity-50" : "atlas-button-primary disabled:opacity-50"}
                    >
                      {enabled ? "Pausar" : "Ativar"}
                    </button>
                  </article>
                );
              })
            ) : (
              <p className="cc6-hairline px-5 py-4 text-sm leading-6 text-[#6b7890]">
                Nenhum corretor direto — vincule corretores ao gerente antes de configurar projetos.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {data?.viewer.role === "manager" ? (
        <section data-phase="57-distribution-priority">
          <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "340ms" }} aria-labelledby="distribution-priority-title">
            <header className="px-5 pt-5 pb-3">
              <p className="cc6-eyebrow">Fase 57 · Ordem inteligente da fila</p>
              <h2 id="distribution-priority-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Prioridade por SLA e origem</h2>
              <p className="mt-1 text-xs leading-5 text-[#6b7890]">Ordem: maior pressão de SLA → prioridade da origem → lead mais antiga · dados pessoais nunca entram na decisão.</p>
            </header>
            <div className="cc6-hairline grid gap-4 p-5 lg:grid-cols-5">
              <label className={LABEL_CLASS}>
                Origem
                <select
                  value={prioritySource}
                  onChange={(event)=>{const source=event.target.value;setPrioritySource(source);const current=data.priorityRules.find((rule)=>rule.development_id===projectId&&rule.source_key===source);if(current){setSourcePriority(current.priority);setSourceSlaMinutes(current.sla_minutes)}}}
                  className={FIELD_CLASS}
                >
                  <option value="">Selecione</option>
                  {data.leadSources.map((source)=><option key={source} value={source}>{source}</option>)}
                </select>
              </label>
              <label className={LABEL_CLASS}>
                Prioridade 1–10
                <input type="number" min={1} max={10} value={sourcePriority} onChange={(event)=>setSourcePriority(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                SLA em minutos
                <input type="number" min={5} max={10080} value={sourceSlaMinutes} onChange={(event)=>setSourceSlaMinutes(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={`${LABEL_CLASS} lg:col-span-2`}>
                Motivo auditável
                <input value={priorityReason} onChange={(event)=>setPriorityReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ex.: origem com compromisso de contato em 15 minutos" className={FIELD_CLASS} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-5">
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {data.priorityRules.filter((rule)=>rule.development_id===projectId&&rule.enabled).slice(0,8).map((rule)=>(
                    <span key={rule.source_key} className="cc6-chip">{rule.source_key} · P{rule.priority} · {rule.sla_minutes} min</span>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={working||!projectId||!prioritySource||priorityReason.trim().length<10}
                  onClick={()=>void configurePriority()}
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {working?"Salvando...":"Salvar prioridade"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {data?.viewer.role === "manager" ? (
        <section data-phase="56-broker-capacity">
          <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "380ms" }} aria-labelledby="distribution-capacity-title">
            <header className="px-5 pt-5 pb-3">
              <p className="cc6-eyebrow">Fase 56 · Proteção contra sobrecarga</p>
              <h2 id="distribution-capacity-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Limites de carteira por corretor</h2>
              <p className="mt-1 text-xs leading-5 text-[#6b7890]">Capacidade operacional, não meta nem ranking — no teto, o banco bloqueia novas distribuições e transferências.</p>
            </header>
            <div className="cc6-hairline grid gap-4 p-5 lg:grid-cols-5">
              <label className={LABEL_CLASS}>
                Corretor
                <select
                  value={capacityBrokerId}
                  onChange={(event)=>{const id=event.target.value;setCapacityBrokerId(id);const current=capacityMap.get(id);if(current){setMaxActiveLeads(current.max_active_leads);setMaxProjectLeads(current.max_project_leads);setWarningPercent(current.warning_percent)}}}
                  className={FIELD_CLASS}
                >
                  <option value="">Selecione</option>
                  {teamBrokers.map((broker)=><option key={broker.id} value={broker.id}>{broker.full_name||"Corretor"}</option>)}
                </select>
              </label>
              <label className={LABEL_CLASS}>
                Máximo ativo
                <input type="number" min={1} max={2000} value={maxActiveLeads} onChange={(event)=>setMaxActiveLeads(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                Máximo por projeto
                <input type="number" min={1} max={1000} value={maxProjectLeads} onChange={(event)=>setMaxProjectLeads(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                Avisar em %
                <input type="number" min={50} max={95} value={warningPercent} onChange={(event)=>setWarningPercent(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                Motivo auditável
                <input value={capacityReason} onChange={(event)=>setCapacityReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ex.: capacidade definida para o período" className={FIELD_CLASS} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-5">
                <p className="min-w-0 text-xs leading-5 text-[#6b7890]">
                  Carga atual <strong className="cc6-num text-[#e8eef8]">{capacityBrokerId ? loadMap.get(capacityBrokerId)?.total ?? 0 : "—"}</strong> · alerta em {warningPercent}% e bloqueio real no teto · reduzir o limite não retira leads existentes.
                </p>
                <button
                  type="button"
                  disabled={working||!capacityBrokerId||capacityReason.trim().length<10||maxProjectLeads>maxActiveLeads}
                  onClick={()=>void configureCapacity()}
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {working?"Salvando...":"Salvar limites"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {data?.viewer.role === "manager" ? (
        <section data-phase="55-absence-redistribution">
          <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "420ms" }} aria-labelledby="distribution-absence-title">
            <header className="px-5 pt-5 pb-3">
              <p className="cc6-eyebrow">Fase 55 · Continuidade de atendimento</p>
              <h2 id="distribution-absence-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Cobertura por ausência</h2>
              <p className="mt-1 text-xs leading-5 text-[#6b7890]">Não é acionada por queda de conexão — exige confirmação humana com período e motivo.</p>
            </header>
            <div className="cc6-hairline grid gap-4 p-5 lg:grid-cols-4">
              <label className={LABEL_CLASS}>
                Corretor ausente
                <select value={absenceBrokerId} onChange={(event)=>setAbsenceBrokerId(event.target.value)} className={FIELD_CLASS}>
                  <option value="">Selecione</option>
                  {teamBrokers.map((broker)=><option key={broker.id} value={broker.id}>{broker.full_name||"Corretor"}</option>)}
                </select>
              </label>
              <label className={LABEL_CLASS}>
                Retorno previsto
                <input type="datetime-local" value={absenceEndsAt} onChange={(event)=>setAbsenceEndsAt(event.target.value)} className={FIELD_CLASS} />
              </label>
              <label className={`${LABEL_CLASS} lg:col-span-2`}>
                Motivo auditável
                <input value={absenceReason} onChange={(event)=>setAbsenceReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ex.: férias programadas até o retorno informado" className={FIELD_CLASS} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-4">
                <p className="min-w-0 max-w-3xl text-xs leading-5 text-[#6b7890]">
                  Move somente a carteira ativa para corretores online da mesma equipe — responsável único, timeline, tarefas abertas e evidência do lote preservados; vendas e descartes intactos.
                </p>
                <button
                  type="button"
                  disabled={working||!absenceBrokerId||!absenceEndsAt||absenceReason.trim().length<10}
                  onClick={()=>void coverAbsence()}
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {working?"Protegendo carteira...":"Ativar cobertura"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
