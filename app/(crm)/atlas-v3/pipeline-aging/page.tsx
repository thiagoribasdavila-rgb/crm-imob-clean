"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Aging = {
  summary: { active: number; stalled: number; critical: number; medianDays: number; movementCount30d: number; withoutNextAction: number };
  byStage: Array<{ key: string; label: string; leads: number; averageDays: number; oldestDays: number; stalled: number; stalledRate: number; limitDays: number }>;
  priorityQueue: Array<{ id: string; name: string; stageLabel: string; ageDays: number; limitDays: number; severity: "critical" | "stalled" | "attention"; score: number; nextActionAt: string | null; source: "stage_move" | "lead_created" }>;
  quality: { withRecordedEntry: number; estimatedEntry: number; coverage: number };
  governance: { readOnly: true; hierarchicalRls: true; automaticTransfer: false; velocityClaimed: boolean };
};

export default function PipelineAgingPage() {
  const [data, setData] = useState<Aging | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    const { data: session } = await supabase.auth.getSession();
    const response = await fetch("/api/v1/analytics/pipeline-aging", { headers: { Authorization: `Bearer ${session.session?.access_token || ""}` }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) setError(body.error?.message || body.error || "Não foi possível carregar o aging."); else setData(body.data || body);
  })(); }, []);

  return <div className="space-y-6 pb-10" data-phase="39-pipeline-aging">
    <header><AtlasBadge tone="warning">FASE 39 · AGING DO PIPELINE</AtlasBadge><h1 className="mt-4 text-3xl font-semibold tracking-[-.04em] text-white">Onde o pipeline está parando</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Tempo real em cada etapa, gargalos e uma fila objetiva para o corretor agir agora.</p></header>
    {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
    {!data && !error ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(i => <AtlasSkeleton key={i} className="h-32" />)}</div> : null}
    {data ? <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AtlasMetric label="Leads ativos" value={data.summary.active} detail={`${data.summary.medianDays} dias de mediana`} trend="CARTEIRA" tone="blue" /><AtlasMetric label="Estagnados" value={data.summary.stalled} detail={`${data.summary.withoutNextAction} sem próxima ação`} trend="AGIR" tone="amber" /><AtlasMetric label="Críticos" value={data.summary.critical} detail="Acima de 2× o prazo da etapa" trend="RISCO" tone="rose" /><AtlasMetric label="Movimentos em 30 dias" value={data.summary.movementCount30d} detail={data.governance.velocityClaimed ? "Velocidade observada" : "Sem histórico suficiente"} trend="RITMO" tone="violet" /></section>
      <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <AtlasCard><AtlasCardHeader eyebrow="Gargalos" title="Tempo e estagnação por etapa" description="O limite segue o SLA canônico de cada etapa." /><div className="space-y-3 p-5 sm:p-6">{data.byStage.filter(stage => stage.leads).map(stage => <div key={stage.key} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-center justify-between"><div><strong className="text-sm text-white">{stage.label}</strong><p className="mt-1 text-xs text-slate-500">{stage.leads} leads · média {stage.averageDays} dias · limite {stage.limitDays}</p></div><span className={`text-sm font-bold ${stage.stalled ? "text-amber-200" : "text-emerald-200"}`}>{stage.stalledRate}% parados</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-400" style={{ width: `${Math.min(100, stage.stalledRate)}%` }} /></div><p className="mt-2 text-[10px] text-slate-600">Mais antigo: {stage.oldestDays} dias</p></div>)}{!data.byStage.some(stage => stage.leads) ? <AtlasEmpty title="Pipeline sem leads ativos" description="Os tempos aparecerão quando houver leads em etapas abertas." /> : null}</div></AtlasCard>
        <AtlasCard><AtlasCardHeader eyebrow="Próxima ação" title="Fila prioritária" description="Prioridade por atraso; nenhuma transferência é automática." /><div className="space-y-2 p-5 sm:p-6">{data.priorityQueue.slice(0, 12).map(item => <Link href={`/leads/${item.id}`} key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] p-3 transition hover:border-cyan-400/20"><div><strong className="text-xs text-white">{item.name}</strong><p className="mt-1 text-[10px] text-slate-500">{item.stageLabel} · score {item.score} · {item.nextActionAt ? "com próxima ação" : "sem próxima ação"}</p></div><span className={`shrink-0 text-xs font-bold ${item.severity === "critical" ? "text-rose-200" : "text-amber-200"}`}>{item.ageDays} dias</span></Link>)}{!data.priorityQueue.length ? <AtlasEmpty title="Nenhum gargalo relevante" description="A carteira visível está dentro do prazo das etapas." /> : null}<Link href="/pipeline" className="atlas-button-secondary mt-3 text-center">Abrir Kanban</Link></div></AtlasCard>
      </div>
      <p className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.05] p-4 text-xs leading-5 text-slate-400">Cobertura do horário real de entrada: <strong className="text-cyan-200">{data.quality.coverage}%</strong>. {data.quality.estimatedEntry} registros antigos usam a criação da lead como estimativa. Aging orienta ação humana e não altera carteira ou responsável.</p>
    </> : null}
  </div>;
}
