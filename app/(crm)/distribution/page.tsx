"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
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

  return <div className="space-y-6 pb-10" data-phase="51-explainable-distribution">
    <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.06] to-violet-500/[.1] p-6 shadow-[0_34px_120px_rgba(2,8,23,.42)] sm:p-8">
      <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
        <div><div className="flex flex-wrap gap-2"><AtlasBadge tone="success">FILA AO VIVO</AtlasBadge><AtlasBadge tone="info">PROJETO + CARGA</AtlasBadge><AtlasBadge tone="violet">HIERARQUIA ATIVA</AtlasBadge></div><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Leads no corretor certo, <span className="atlas-gradient-text">no momento certo.</span></h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">O Atlas considera disponibilidade, projeto, carteira atual e tempo desde a última atribuição. Gerentes enxergam apenas sua estrutura; o diretor acompanha toda a operação.</p></div>
        <div className="min-w-[280px] rounded-2xl border border-white/10 bg-[#070d1b]/70 p-4"><label className="atlas-eyebrow" htmlFor="project">Projeto da distribuição</label><select id="project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none"><option value="">Selecione um projeto</option>{data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><p className="mt-3 text-xs text-slate-500">{selectedProject?.developer_name || "Incorporadora não informada"}</p></div>
      </div>
    </section>

    {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
    <div data-phase="52-unassigned-lead-queue"><AtlasCard><AtlasCardHeader eyebrow="Fase 52 · Fila sem responsável" title="Recupere leads sem expor dados pessoais" description="A fila usa somente projeto, origem, etapa e tempo de espera. Nada é atribuído sem comando da liderança." action={<button type="button" disabled={working||!projectId||!brokers.length||!unassigned} onClick={()=>void distribute(1)} className="atlas-button-primary disabled:opacity-50">Distribuir próxima</button>}/><div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-2">{data?.unassignedQueue.filter(item=>!projectId||item.developmentId===projectId).slice(0,12).map(item=><article key={item.id} className={`rounded-2xl border p-4 ${item.waitingMinutes>=60?"border-amber-400/20 bg-amber-400/[.04]":"border-white/[.07] bg-white/[.025]"}`}><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-white">Lead {item.id.slice(0,8)}</strong><p className="mt-1 text-xs text-slate-500">{item.source} · {item.status}</p></div><AtlasBadge tone={item.waitingMinutes>=60?"warning":"neutral"}>{item.waitingMinutes<60?`${item.waitingMinutes} MIN`:item.waitingMinutes<1440?`${Math.floor(item.waitingMinutes/60)} H`:`${Math.floor(item.waitingMinutes/1440)} D`}</AtlasBadge></div><p className="mt-3 text-[10px] text-slate-600">Sem nome, telefone ou e-mail nesta fila. A distribuição seleciona atomicamente a lead mais antiga do projeto.</p></article>)}{!data?.unassignedQueue.filter(item=>!projectId||item.developmentId===projectId).length?<div className="lg:col-span-2"><AtlasEmpty reason="completed" eyebrow="Distribuição em dia" title="Fila sem pendências" description="Nenhuma lead sem responsável no projeto selecionado." action={<Link href="/pipeline" className="atlas-button-secondary">Revisar pipeline</Link>}/></div>:null}</div><div className="border-t border-white/[.06] px-5 py-3 text-[10px] text-slate-500">Máximo de 100 metadados visíveis · sem PII · sem atribuição automática · decisão explícita da liderança.</div></AtlasCard></div>
    {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</div> : null}
    <AtlasCard><AtlasCardHeader eyebrow="Fase 51 · Evidência de distribuição" title="Por que cada lead foi atribuída" description="Cada evento preserva projeto, responsável único, carga anterior, peso e algoritmo usado." /><div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-2">{data?.recentAssignments.filter(item=>!projectId||item.development_id===projectId).slice(0,8).map(item=>{const broker=profilesMap.get(item.assigned_to);return <article key={item.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-white">{broker?.full_name||"Corretor"}</strong><p className="mt-1 text-xs text-slate-500">Lead {item.lead_id.slice(0,8)} · {new Date(item.created_at).toLocaleString("pt-BR")}</p></div><AtlasBadge tone="success">ÚNICO RESPONSÁVEL</AtlasBadge></div><p className="mt-3 text-xs leading-5 text-slate-400">Carga anterior {item.score_snapshot?.projectLoadBefore??"—"} ÷ peso {item.score_snapshot?.weight??1} = carga ponderada {item.score_snapshot?.weightedLoadBefore??"—"}.</p></article>})}{!data?.recentAssignments.length?<div className="lg:col-span-2"><AtlasEmpty title="Sem atribuições recentes" description="As próximas distribuições terão justificativa auditável."/></div>:null}</div></AtlasCard>

    {data?.portfolioAudit?<section data-phase="59-portfolio-audit"><AtlasCard><AtlasCardHeader eyebrow="Fase 59 · Livro da carteira" title="Histórico gerencial unificado" description="Distribuições, transferências, reservas, devoluções, ausências e capacidade no mesmo escopo hierárquico, sem nome ou contato da lead." action={<div className="flex gap-2"><AtlasBadge tone="success">SEM PII</AtlasBadge><AtlasBadge tone="info">ATÉ {data.portfolioAudit.maximum}</AtlasBadge></div>}/><div className="grid gap-3 border-b border-white/[.06] p-5 sm:grid-cols-3 sm:p-6 lg:grid-cols-6">{[["Distribuições",data.portfolioAudit.summary.distributions],["Transferências",data.portfolioAudit.summary.transfers],["Reservas",data.portfolioAudit.summary.reservations],["Devoluções",data.portfolioAudit.summary.returns],["Ausências",data.portfolioAudit.summary.absences],["Capacidade",data.portfolioAudit.summary.capacityChanges]].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-white/[.06] bg-white/[.025] p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><strong className="mt-2 block text-xl text-white">{value}</strong></div>)}</div><div className="space-y-2 p-5 sm:p-6">{data.portfolioAudit.events.slice(0,20).map((event,index)=>{const labels:Record<string,string>={distribution:"Distribuição",transfer:"Transferência",reservation_pending:"Reserva criada",reservation_accepted:"Reserva aceita",reservation_expired:"Devolução à fila",reservation_superseded:"Reserva superada",absence:"Cobertura de ausência",capacity:"Limite de capacidade"};return <article key={`${event.eventType}-${event.occurredAt}-${index}`} className="flex flex-col gap-2 rounded-2xl border border-white/[.06] bg-white/[.02] p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm text-white">{labels[event.eventType]||event.eventType}</strong><p className="mt-1 text-xs text-slate-500">{event.brokerId?profilesMap.get(event.brokerId)?.full_name||"Corretor no escopo":"Operação gerencial"}{event.leadId?` · Lead ${event.leadId.slice(0,8)}`:""}</p></div><time className="text-xs text-slate-500">{new Date(event.occurredAt).toLocaleString("pt-BR")}</time></article>})}{!data.portfolioAudit.events.length?<AtlasEmpty title="Histórico ainda vazio" description="Os próximos movimentos aparecerão aqui com rastreabilidade."/>:null}</div><div className="border-t border-white/[.06] px-5 py-3 text-[10px] text-slate-600">Fontes operacionais preservadas · escopo hierárquico · nome, telefone, e-mail e textos livres da lead não expostos.</div></AtlasCard></section>:null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AtlasMetric label="Leads aguardando" value={loading ? "—" : String(unassigned)} detail={selectedProject?.name || "Selecione o projeto"} trend="FILA" tone="amber" />
      <AtlasMetric label="Corretores disponíveis" value={loading ? "—" : String(brokers.length)} detail="Online e elegíveis agora" trend="AO VIVO" tone="green" />
      <AtlasMetric label="Gestores online" value={loading ? "—" : String(managers.length)} detail="Gerentes e superintendentes" trend="LIDERANÇA" tone="blue" />
      <AtlasMetric label="Próximo da fila" value={loading ? "—" : brokers[0]?.full_name || "Sem corretor"} detail="Menor carga no projeto" trend="EQUILÍBRIO" tone="violet" />
    </section>

    {data?.viewer.role === "manager" ? <section className="rounded-[24px] border border-cyan-400/15 bg-gradient-to-r from-cyan-400/[.07] to-blue-400/[.04] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="atlas-eyebrow">Fase 38 · Distribuição equilibrada</p><h2 className="mt-2 text-xl font-semibold text-white">Fila do meu time reconciliada com o motor</h2><p className="mt-2 text-sm text-slate-400">Projeto, presença de 90 segundos, disponibilidade, peso e última atribuição definem a ordem. A operação é atômica.</p></div><div className="flex flex-wrap gap-2"><AtlasBadge tone={balanceGap <= 1 ? "success" : "warning"}>DESVIO {balanceGap}</AtlasBadge><AtlasBadge tone="info">{brokers.length} ELEGÍVEIS</AtlasBadge><AtlasBadge tone="violet">MESMO PROJETO</AtlasBadge></div></div></section> : null}

    {data?.viewer.role === "manager" ? <AtlasCard><AtlasCardHeader eyebrow="Fase 39 · Equilíbrio por projeto" title="Elegibilidade do time neste empreendimento" description="Ativar, pausar e ponderar um corretor aqui não altera nenhum outro projeto." /><div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">{teamBrokers.map((broker) => { const state = stateMap.get(broker.id); const enabled = state?.enabled !== false; const online = presenceMap.get(broker.id)?.online && presenceMap.get(broker.id)?.availability === "available"; return <article key={broker.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{broker.full_name || "Corretor"}</p><p className={`mt-1 text-xs ${online ? "text-emerald-300" : "text-slate-500"}`}>{online ? "Online e disponível" : "Fora da fila agora"}</p></div><AtlasBadge tone={enabled ? "success" : "neutral"}>{enabled ? "ATIVO NO PROJETO" : "PAUSADO"}</AtlasBadge></div><div className="mt-4 flex items-end gap-3"><label className="flex-1 text-[10px] uppercase tracking-wider text-slate-500">Peso<select value={state?.weight || 1} disabled={working} onChange={(event) => void configureMember(broker.id, enabled, Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">{[1,2,3,4,5,6,7,8,9,10].map((weight) => <option key={weight} value={weight}>{weight}</option>)}</select></label><button disabled={working} onClick={() => void configureMember(broker.id, !enabled, state?.weight || 1)} className={enabled ? "atlas-button-secondary" : "atlas-button-primary"}>{enabled ? "Pausar" : "Ativar"}</button></div></article>; })}{!teamBrokers.length ? <div className="sm:col-span-2 xl:col-span-3"><AtlasEmpty title="Nenhum corretor direto" description="Vincule corretores ao gerente antes de configurar projetos." /></div> : null}</div></AtlasCard> : null}

    {data?.viewer.role === "manager" ? <section data-phase="57-distribution-priority"><AtlasCard><AtlasCardHeader eyebrow="Fase 57 · Ordem inteligente da fila" title="Prioridade por SLA e origem" description="A fila considera pressão do SLA, regra da origem e antiguidade. Nome, renda, gênero, idade e outros dados pessoais nunca entram na decisão." /><div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-5"><label className="text-xs text-slate-400">Origem<select value={prioritySource} onChange={(event)=>{const source=event.target.value;setPrioritySource(source);const current=data.priorityRules.find((rule)=>rule.development_id===projectId&&rule.source_key===source);if(current){setSourcePriority(current.priority);setSourceSlaMinutes(current.sla_minutes)}}} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"><option value="">Selecione</option>{data.leadSources.map((source)=><option key={source} value={source}>{source}</option>)}</select></label><label className="text-xs text-slate-400">Prioridade 1–10<input type="number" min={1} max={10} value={sourcePriority} onChange={(event)=>setSourcePriority(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" /></label><label className="text-xs text-slate-400">SLA em minutos<input type="number" min={5} max={10080} value={sourceSlaMinutes} onChange={(event)=>setSourceSlaMinutes(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" /></label><label className="text-xs text-slate-400 lg:col-span-2">Motivo auditável<input value={priorityReason} onChange={(event)=>setPriorityReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ex.: origem com compromisso de contato em 15 minutos" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" /></label><div className="lg:col-span-5 flex flex-col gap-3 rounded-2xl border border-violet-400/15 bg-violet-400/[.035] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs leading-5 text-slate-400">Ordem: maior pressão de SLA → prioridade da origem → lead mais antiga. O destino continua respeitando equipe, presença, projeto, capacidade e carga ponderada.</p><div className="mt-2 flex flex-wrap gap-2">{data.priorityRules.filter((rule)=>rule.development_id===projectId&&rule.enabled).slice(0,8).map((rule)=><AtlasBadge key={rule.source_key} tone="violet">{rule.source_key} · P{rule.priority} · {rule.sla_minutes} MIN</AtlasBadge>)}</div></div><button type="button" disabled={working||!projectId||!prioritySource||priorityReason.trim().length<10} onClick={()=>void configurePriority()} className="atlas-button-primary disabled:opacity-50">{working?"Salvando...":"Salvar prioridade"}</button></div></div></AtlasCard></section> : null}

    {data?.viewer.role === "manager" ? <section data-phase="56-broker-capacity"><AtlasCard><AtlasCardHeader eyebrow="Fase 56 · Proteção contra sobrecarga" title="Limites de carteira por corretor" description="Defina capacidade operacional, não meta nem ranking. Ao atingir o teto, novas distribuições e transferências são bloqueadas no banco." /><div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-5"><label className="text-xs text-slate-400">Corretor<select value={capacityBrokerId} onChange={(event)=>{const id=event.target.value;setCapacityBrokerId(id);const current=capacityMap.get(id);if(current){setMaxActiveLeads(current.max_active_leads);setMaxProjectLeads(current.max_project_leads);setWarningPercent(current.warning_percent)}}} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"><option value="">Selecione</option>{teamBrokers.map((broker)=><option key={broker.id} value={broker.id}>{broker.full_name||"Corretor"}</option>)}</select></label><label className="text-xs text-slate-400">Máximo ativo<input type="number" min={1} max={2000} value={maxActiveLeads} onChange={(event)=>setMaxActiveLeads(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" /></label><label className="text-xs text-slate-400">Máximo por projeto<input type="number" min={1} max={1000} value={maxProjectLeads} onChange={(event)=>setMaxProjectLeads(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" /></label><label className="text-xs text-slate-400">Avisar em %<input type="number" min={50} max={95} value={warningPercent} onChange={(event)=>setWarningPercent(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" /></label><label className="text-xs text-slate-400">Motivo auditável<input value={capacityReason} onChange={(event)=>setCapacityReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ex.: capacidade definida para o período" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" /></label><div className="lg:col-span-5 flex flex-col gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/[.035] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs leading-5 text-slate-400">Carga atual: <strong className="text-white">{capacityBrokerId?loadMap.get(capacityBrokerId)?.total??0:"—"}</strong>. Alerta visual em {warningPercent}% e bloqueio real no teto. Reduzir o limite não retira leads existentes.</p><p className="text-[10px] text-slate-600">Sem comparação pública, punição ou pontuação de pessoas.</p></div><button type="button" disabled={working||!capacityBrokerId||capacityReason.trim().length<10||maxProjectLeads>maxActiveLeads} onClick={()=>void configureCapacity()} className="atlas-button-primary disabled:opacity-50">{working?"Salvando...":"Salvar limites"}</button></div></div></AtlasCard></section> : null}

    {data?.viewer.role === "manager" ? <section data-phase="55-absence-redistribution"><AtlasCard><AtlasCardHeader eyebrow="Fase 55 · Continuidade de atendimento" title="Cobertura por ausência" description="A liderança confirma período e motivo. Somente a carteira ativa é movida para corretores online da mesma equipe; vendas e descartes permanecem intactos." /><div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-4"><label className="text-xs text-slate-400">Corretor ausente<select value={absenceBrokerId} onChange={(event)=>setAbsenceBrokerId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"><option value="">Selecione</option>{teamBrokers.map((broker)=><option key={broker.id} value={broker.id}>{broker.full_name||"Corretor"}</option>)}</select></label><label className="text-xs text-slate-400">Retorno previsto<input type="datetime-local" value={absenceEndsAt} onChange={(event)=>setAbsenceEndsAt(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" /></label><label className="text-xs text-slate-400 lg:col-span-2">Motivo auditável<input value={absenceReason} onChange={(event)=>setAbsenceReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ex.: férias programadas até o retorno informado" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white" /></label><div className="lg:col-span-4 flex flex-col gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/[.04] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-3xl text-xs leading-5 text-slate-400">Não é acionado por simples queda de conexão. A operação exige confirmação humana, preserva responsável único, timeline, tarefas abertas e evidência do lote.</p><button type="button" disabled={working||!absenceBrokerId||!absenceEndsAt||absenceReason.trim().length<10} onClick={()=>void coverAbsence()} className="atlas-button-primary disabled:opacity-50">{working?"Protegendo carteira...":"Ativar cobertura"}</button></div></div></AtlasCard></section> : null}

    <section className="flex flex-col gap-4 rounded-[24px] border border-white/[.07] bg-white/[.025] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="atlas-eyebrow">Minha disponibilidade</p><p className="mt-1 text-sm text-slate-400">O status atualiza a fila em até 15 segundos. Somente “Disponível” participa da distribuição.</p></div>
      <div className="flex flex-wrap gap-2">{([{"key":"available","label":"Disponível"},{"key":"busy","label":"Ocupado"},{"key":"offline","label":"Sair da fila"}] as const).map((option) => <button key={option.key} type="button" onClick={() => void updateAvailability(option.key)} className={availability === option.key ? "atlas-button-primary" : "atlas-button-secondary"} aria-pressed={availability === option.key}>{option.label}</button>)}</div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.5fr_.8fr]">
      <AtlasCard><AtlasCardHeader eyebrow="Fila de corretores" title="Ordem inteligente de recebimento" description="Atualização automática a cada 15 segundos e mesma ordem ponderada do motor." action={<div className="flex flex-wrap gap-2"><button disabled={working || !projectId || !unassigned || !brokers.length} onClick={() => void distribute(1)} className="atlas-button-secondary">Distribuir próximo</button><button disabled={working || !projectId || !unassigned || !brokers.length} onClick={() => void distribute(Math.min(100, unassigned))} className="atlas-button-primary">{working ? "Equilibrando..." : "Equilibrar pendentes"}</button></div>} />
        <div className="p-5 sm:p-6">{loading ? <div className="space-y-3">{[1,2,3].map((i) => <AtlasSkeleton key={i} className="h-20 w-full" />)}</div> : brokers.length === 0 ? <AtlasEmpty reason="not-configured" eyebrow="Fila aguardando disponibilidade" title="Nenhum corretor disponível" description="O corretor aparece aqui ao acessar o Atlas e manter a disponibilidade ativa." action={<Link href="/brokers" className="atlas-button-secondary">Revisar equipe</Link>} /> : <div className="space-y-3">{brokers.map((broker, index) => { const load = loadMap.get(broker.id); const manager = broker.reports_to ? profilesMap.get(broker.reports_to) : null; const state = stateMap.get(broker.id); return <article key={broker.id} className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className={`grid h-11 w-11 place-items-center rounded-2xl text-sm font-bold ${index === 0 ? "bg-cyan-400 text-slate-950" : "bg-white/[0.06] text-slate-300"}`}>{index + 1}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{broker.full_name || "Corretor"}</h3>{index === 0 ? <AtlasBadge tone="success">PRÓXIMO</AtlasBadge> : null}<span className="flex items-center gap-1 text-xs text-emerald-300"><i className="h-2 w-2 rounded-full bg-emerald-400" /> online</span></div><p className="mt-1 text-xs text-slate-500">Time {manager?.full_name || "comercial"} · peso {state?.weight || 1} · última atribuição {state?.last_assigned_at ? new Date(state.last_assigned_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "ainda não recebeu"}</p></div><div className="text-right"><p className="text-xl font-semibold text-white">{load?.by_project[projectId] ?? 0}</p><p className="text-[10px] uppercase tracking-wider text-slate-500">neste projeto</p><p className="mt-1 text-xs text-slate-500">carga ponderada {Math.round(((load?.by_project[projectId] ?? 0) / (state?.weight || 1)) * 10) / 10}</p></div></article>; })}</div>}</div>
      </AtlasCard>

      <AtlasCard><AtlasCardHeader eyebrow="Fase 35 · Liderança ao vivo" title="Gerentes online" description="Na superintendência, somente os gerentes diretamente subordinados aparecem." /><div className="p-5 sm:p-6">{loading ? <AtlasSkeleton className="h-52 w-full" /> : managers.length === 0 ? <AtlasEmpty title="Nenhum gerente direto online" description="A fila continua protegida pelas regras automáticas." /> : <div className="space-y-3">{managers.map((manager) => { const teamOnline = brokers.filter((broker) => broker.reports_to === manager.id).length; return <div key={manager.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="flex items-center justify-between"><div><p className="font-semibold text-white">{manager.full_name || "Gestor comercial"}</p><p className="mt-1 text-xs text-slate-500">Gerência direta</p></div><span className="flex items-center gap-2 text-xs text-emerald-300"><i className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]" /> online</span></div><div className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-slate-400">{teamOnline} corretor{teamOnline === 1 ? "" : "es"} disponível{teamOnline === 1 ? "" : "is"} no time</div></div>; })}</div>}</div></AtlasCard>
    </section>
  </div>;
}
