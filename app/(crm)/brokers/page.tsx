"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { EmptyState } from "@/components/atlas/empty-state";
import { LoadingState } from "@/components/atlas/loading-state";
import { MetricCard } from "@/components/atlas/metric-card";
import { StatusBadge } from "@/components/atlas/status-badge";
import { AtlasRecoverableError } from "@/components/ui/AtlasUI";

type Member = { id: string; fullName: string; role: string; reportsTo: string | null; active: boolean; portfolio: number; hotLeads: number; overdue: number; withoutNextAction: number; hotWithoutNextAction: number; won: number };
type Payload = { members: Member[]; supportQueue: Member[]; summary: { activePeople: number; brokers: number; portfolio: number; overdue: number }; method: { peopleRanking: boolean } };
const roleLabel: Record<string, string> = { director: "Diretor", superintendent: "Superintendente", manager: "Gerente", broker: "Corretor", admin: "Diretor" };

export default function BrokersPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) { setError("Sua sessão expirou."); setLoading(false); return; }
    const response = await fetch("/api/v1/crm/team/conversion", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const payload = await response.json();
    if (response.ok) setData(payload.data); else setError(payload.error?.message || "A equipe não pôde ser carregada.");
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const memberMap = useMemo(() => new Map((data?.members ?? []).map((member) => [member.id, member])), [data?.members]);
  function openCopilot(member: Member) { window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: { prompt: `Prepare um plano de apoio para uma carteira comercial com ${member.portfolio} leads ativos, ${member.hotLeads} quentes, ${member.overdue} atrasados e ${member.withoutNextAction} sem próxima ação. Não compare pessoas, não envie mensagens e não altere registros.`, context: { module: "team-conversion", role: member.role } } })); }

  return <div className="space-y-6 pb-10" data-evolution-phase="45" data-team-layout="conversion-support">
    <section className="atlas-leads-hero"><div><div className="flex flex-wrap gap-2"><StatusBadge tone="violet">GESTÃO QUE REMOVE BLOQUEIOS</StatusBadge><StatusBadge tone="success">SEM RANKING PUNITIVO</StatusBadge></div><h1>Ajude cada carteira a avançar.</h1><p>Diretoria e gestores enxergam apenas sua estrutura. O Atlas destaca atrasos e ausência de próxima ação para orientar apoio, não para rotular pessoas.</p><div className="atlas-command-actions"><Link className="atlas-button-primary" href="/distribution">Distribuir leads</Link><Link className="atlas-button-secondary" href="/reports">Ver resultados</Link></div></div></section>
    <section className="atlas-leads-metrics"><MetricCard label="Pessoas visíveis" value={loading ? "—" : data?.summary.activePeople ?? 0} detail="Dentro do seu escopo" trend="TIME"/><MetricCard label="Corretores" value={loading ? "—" : data?.summary.brokers ?? 0} detail="Ativos na operação" trend="CAMPO"/><MetricCard label="Leads na estrutura" value={loading ? "—" : data?.summary.portfolio ?? 0} detail="Carteiras sob gestão" trend="CARTEIRA" tone="warning"/><MetricCard label="Ações atrasadas" value={loading ? "—" : data?.summary.overdue ?? 0} detail="Precisam de apoio" trend="SLA" tone="violet"/></section>
    {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading}/> : null}
    {data?.supportQueue.length ? <section className="atlas-leads-table-panel"><div className="atlas-leads-table-head"><div><strong>Onde a liderança pode ajudar agora</strong><span>Até três carteiras com bloqueios observáveis; isto não é um ranking de pessoas.</span></div><StatusBadge tone="warning">APOIO À CONVERSÃO</StatusBadge></div><div className="grid gap-3 p-4 lg:grid-cols-3">{data.supportQueue.map((member) => <article key={member.id} className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4"><h2 className="font-semibold text-white">{member.fullName}</h2><p className="mt-1 text-xs text-slate-500">{roleLabel[member.role] || member.role}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><span className="rounded-xl bg-white/[.04] p-3 text-slate-300"><b className="block text-lg text-white">{member.overdue}</b>atrasados</span><span className="rounded-xl bg-white/[.04] p-3 text-slate-300"><b className="block text-lg text-white">{member.hotWithoutNextAction}</b>quentes sem ação</span></div><button type="button" onClick={() => openCopilot(member)} className="atlas-button-secondary mt-4 w-full">Preparar apoio com IA</button></article>)}</div></section> : null}
    {!error ? <section className="atlas-leads-table-panel"><div className="atlas-leads-table-head"><div><strong>Estrutura do time</strong><span>Responsável direto, função e sinais da carteira</span></div><StatusBadge tone="info">ACESSO POR NÍVEL</StatusBadge></div>{loading ? <div className="p-5"><LoadingState rows={5}/></div> : !data?.members.length ? <EmptyState title="Nenhuma pessoa no seu escopo" description="Vincule os perfis na hierarquia comercial para montar o time."/> : <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{data.members.map((member) => { const leader = member.reportsTo ? memberMap.get(member.reportsTo) : null; return <article key={member.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="atlas-lead-avatar">{member.fullName.slice(0, 2).toUpperCase()}</span><div><strong className="block text-white">{member.fullName}</strong><span className="text-xs text-slate-400">{roleLabel[member.role] || member.role}</span></div></div><StatusBadge tone={member.active ? "success" : "danger"}>{member.active ? "Ativo" : "Inativo"}</StatusBadge></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-white/5 p-3"><span className="block text-xs text-slate-500">Liderança</span><strong className="text-slate-200">{leader?.fullName || "Topo da estrutura"}</strong></div><div className="rounded-xl bg-white/5 p-3"><span className="block text-xs text-slate-500">Carteira ativa</span><strong className="text-slate-200">{member.portfolio} leads</strong></div><div className="rounded-xl bg-white/5 p-3"><span className="block text-xs text-slate-500">Quentes</span><strong className="text-slate-200">{member.hotLeads}</strong></div><div className="rounded-xl bg-white/5 p-3"><span className="block text-xs text-slate-500">Sem próxima ação</span><strong className="text-slate-200">{member.withoutNextAction}</strong></div></div></article>; })}</div>}</section> : null}
  </div>;
}
