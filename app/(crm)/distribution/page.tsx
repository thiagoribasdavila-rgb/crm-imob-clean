"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Profile = { id: string; full_name: string | null; reports_to: string | null; resolved_role: string };
type Presence = { profile_id: string; availability: string; last_seen_at: string; online: boolean };
type Project = { id: string; name: string; developer_name: string | null; status: string | null };
type Load = { profile_id: string; total: number; by_project: Record<string, number> };
type QueueState = { profile_id: string; development_id: string; enabled: boolean; weight: number; assignments_count: number; last_assigned_at: string | null };
type Payload = { viewer: { id: string; role: string }; projects: Project[]; profiles: Profile[]; presence: Presence[]; loads: Load[]; queue: QueueState[]; unassigned: Record<string, number>; generatedAt: string };

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

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const token = await accessToken();
    const response = await fetch("/api/v1/crm/distribution", { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Falha ao carregar a fila.");
    else {
      setData(result.data);
      setProjectId((current) => current || result.data.projects[0]?.id || "");
      setError("");
    }
    setLoading(false);
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
    else setNotice(`${result.data.distributed} lead${result.data.distributed === 1 ? "" : "s"} distribuída${result.data.distributed === 1 ? "" : "s"} com equilíbrio de carga.`);
    await load(true); setWorking(false);
  }

  const presenceMap = useMemo(() => new Map((data?.presence ?? []).map((item) => [item.profile_id, item])), [data]);
  const loadMap = useMemo(() => new Map((data?.loads ?? []).map((item) => [item.profile_id, item])), [data]);
  const stateMap = useMemo(() => new Map((data?.queue ?? []).filter((item) => item.development_id === projectId).map((item) => [item.profile_id, item])), [data, projectId]);
  const profilesMap = useMemo(() => new Map((data?.profiles ?? []).map((item) => [item.id, item])), [data]);
  const managers = (data?.profiles ?? []).filter((item) => item.resolved_role === "manager" && (data?.viewer.role !== "superintendent" || item.reports_to === data.viewer.id) && presenceMap.get(item.id)?.online);
  const brokers = (data?.profiles ?? []).filter((item) => item.resolved_role === "broker" && presenceMap.get(item.id)?.online && presenceMap.get(item.id)?.availability === "available" && stateMap.get(item.id)?.enabled !== false).sort((a, b) => {
    const aLoad = loadMap.get(a.id)?.by_project[projectId] ?? 0;
    const bLoad = loadMap.get(b.id)?.by_project[projectId] ?? 0;
    if (aLoad !== bLoad) return aLoad - bLoad;
    return (stateMap.get(a.id)?.last_assigned_at || "").localeCompare(stateMap.get(b.id)?.last_assigned_at || "");
  });
  const selectedProject = data?.projects.find((item) => item.id === projectId);
  const unassigned = data?.unassigned[projectId] ?? 0;

  return <div className="space-y-6 pb-10">
    <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.06] to-violet-500/[.1] p-6 shadow-[0_34px_120px_rgba(2,8,23,.42)] sm:p-8">
      <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
        <div><div className="flex flex-wrap gap-2"><AtlasBadge tone="success">FILA AO VIVO</AtlasBadge><AtlasBadge tone="info">PROJETO + CARGA</AtlasBadge><AtlasBadge tone="violet">HIERARQUIA ATIVA</AtlasBadge></div><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Leads no corretor certo, <span className="atlas-gradient-text">no momento certo.</span></h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">O Atlas considera disponibilidade, projeto, carteira atual e tempo desde a última atribuição. Gerentes enxergam apenas sua estrutura; o diretor acompanha toda a operação.</p></div>
        <div className="min-w-[280px] rounded-2xl border border-white/10 bg-[#070d1b]/70 p-4"><label className="atlas-eyebrow" htmlFor="project">Projeto da distribuição</label><select id="project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none"><option value="">Selecione um projeto</option>{data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><p className="mt-3 text-xs text-slate-500">{selectedProject?.developer_name || "Incorporadora não informada"}</p></div>
      </div>
    </section>

    {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
    {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AtlasMetric label="Leads aguardando" value={loading ? "—" : String(unassigned)} detail={selectedProject?.name || "Selecione o projeto"} trend="FILA" tone="amber" />
      <AtlasMetric label="Corretores disponíveis" value={loading ? "—" : String(brokers.length)} detail="Online e elegíveis agora" trend="AO VIVO" tone="green" />
      <AtlasMetric label="Gestores online" value={loading ? "—" : String(managers.length)} detail="Gerentes e superintendentes" trend="LIDERANÇA" tone="blue" />
      <AtlasMetric label="Próximo da fila" value={loading ? "—" : brokers[0]?.full_name || "Sem corretor"} detail="Menor carga no projeto" trend="EQUILÍBRIO" tone="violet" />
    </section>

    <section className="flex flex-col gap-4 rounded-[24px] border border-white/[.07] bg-white/[.025] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="atlas-eyebrow">Minha disponibilidade</p><p className="mt-1 text-sm text-slate-400">O status atualiza a fila em até 15 segundos. Somente “Disponível” participa da distribuição.</p></div>
      <div className="flex flex-wrap gap-2">{([{"key":"available","label":"Disponível"},{"key":"busy","label":"Ocupado"},{"key":"offline","label":"Sair da fila"}] as const).map((option) => <button key={option.key} type="button" onClick={() => void updateAvailability(option.key)} className={availability === option.key ? "atlas-button-primary" : "atlas-button-secondary"} aria-pressed={availability === option.key}>{option.label}</button>)}</div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.5fr_.8fr]">
      <AtlasCard><AtlasCardHeader eyebrow="Fila de corretores" title="Ordem inteligente de recebimento" description="Atualização automática a cada 15 segundos." action={<div className="flex flex-wrap gap-2"><button disabled={working || !projectId || !unassigned} onClick={() => void distribute(1)} className="atlas-button-secondary">Distribuir próximo</button><button disabled={working || !projectId || !unassigned} onClick={() => void distribute(Math.min(100, unassigned))} className="atlas-button-primary">{working ? "Equilibrando..." : "Equilibrar pendentes"}</button></div>} />
        <div className="p-5 sm:p-6">{loading ? <div className="space-y-3">{[1,2,3].map((i) => <AtlasSkeleton key={i} className="h-20 w-full" />)}</div> : brokers.length === 0 ? <AtlasEmpty title="Nenhum corretor disponível" description="O corretor aparece aqui ao acessar o Atlas e manter a disponibilidade ativa." /> : <div className="space-y-3">{brokers.map((broker, index) => { const load = loadMap.get(broker.id); const manager = broker.reports_to ? profilesMap.get(broker.reports_to) : null; const state = stateMap.get(broker.id); return <article key={broker.id} className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className={`grid h-11 w-11 place-items-center rounded-2xl text-sm font-bold ${index === 0 ? "bg-cyan-400 text-slate-950" : "bg-white/[0.06] text-slate-300"}`}>{index + 1}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{broker.full_name || "Corretor"}</h3>{index === 0 ? <AtlasBadge tone="success">PRÓXIMO</AtlasBadge> : null}<span className="flex items-center gap-1 text-xs text-emerald-300"><i className="h-2 w-2 rounded-full bg-emerald-400" /> online</span></div><p className="mt-1 text-xs text-slate-500">Time {manager?.full_name || "comercial"} · última atribuição {state?.last_assigned_at ? new Date(state.last_assigned_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "ainda não recebeu"}</p></div><div className="text-right"><p className="text-xl font-semibold text-white">{load?.by_project[projectId] ?? 0}</p><p className="text-[10px] uppercase tracking-wider text-slate-500">neste projeto</p><p className="mt-1 text-xs text-slate-500">{load?.total ?? 0} total</p></div></article>; })}</div>}</div>
      </AtlasCard>

      <AtlasCard><AtlasCardHeader eyebrow="Fase 35 · Liderança ao vivo" title="Gerentes online" description="Na superintendência, somente os gerentes diretamente subordinados aparecem." /><div className="p-5 sm:p-6">{loading ? <AtlasSkeleton className="h-52 w-full" /> : managers.length === 0 ? <AtlasEmpty title="Nenhum gerente direto online" description="A fila continua protegida pelas regras automáticas." /> : <div className="space-y-3">{managers.map((manager) => { const teamOnline = brokers.filter((broker) => broker.reports_to === manager.id).length; return <div key={manager.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="flex items-center justify-between"><div><p className="font-semibold text-white">{manager.full_name || "Gestor comercial"}</p><p className="mt-1 text-xs text-slate-500">Gerência direta</p></div><span className="flex items-center gap-2 text-xs text-emerald-300"><i className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]" /> online</span></div><div className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-slate-400">{teamOnline} corretor{teamOnline === 1 ? "" : "es"} disponível{teamOnline === 1 ? "" : "is"} no time</div></div>; })}</div>}</div></AtlasCard>
    </section>
  </div>;
}
