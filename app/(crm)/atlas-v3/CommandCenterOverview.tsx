"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtlasBadge, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Payload = {
  status: "ready" | "blocked" | "unknown";
  generatedAt: string;
  health: { databaseOk: boolean; databaseLatencyMs: number; uptimeSeconds: number; environment: string; hosting: string };
  security: { publicSecretExposure: number; valuesReturned: false; governed: boolean };
  integrations: Record<string, { state: "configured" | "pending"; realTestRequired: boolean }>;
  queues: { tasks: number | null; approvals: number | null; pendingOutbox: number | null; failedOutbox: number | null };
  resilience: { restorePassed: number | null; restorePendingOrFailed: number | null };
  homologation: { passed: number | null; failed: number | null };
  ai: { calls30d: number; tokens30d: number; estimatedCostUsd30d: number; averageLatencyMs30d: number; measured: boolean };
  aiEvolution: {
    calibration: { progress: number; status: "initial" | "learning" | "evidence_ready"; scoreCoverage: number; contactCoverage: number; outcomeMaturity: number; activeLeads: number; scoredLeads: number; outcomeExamples: number; targetOutcomeExamples: number; accuracyClaimed: false };
    memory: { coverage: number; contacts: number; classified: number; preparedRows: number; consolidatedDuplicates: number; invalidRows: number; tiers: { focus: number; watch: number; suppress: number }; isolatedFromPipeline: true; automaticContact: false };
    method: { calibrationWeights: { scoreCoverage: number; contactCoverage: number; outcomeMaturity: number }; minimumOutcomeExamples: number; humanApprovalRequired: true; updatedFromRealData: true };
  };
  critical: Record<string, boolean | null>;
};

const labels: Record<string, string> = { database: "Banco", https: "HTTPS", workerSecret: "Workers", failedOutbox: "Fila sem falhas", restoreEvidence: "Restauração" };
const calibrationLabels = { initial: "INICIAL", learning: "EM APRENDIZADO", evidence_ready: "EVIDÊNCIA MADURA" } as const;

export function CommandCenterOverview() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/governance/command-center", { cache: "no-store", headers: { Authorization: `Bearer ${session.session?.access_token || ""}` } });
      const body = await response.json();
      if (!active) return;
      if (response.status === 403) { setError("Visão executiva disponível somente para a diretoria."); return; }
      if (!response.ok) { setError(body.error?.message || "Command Center indisponível."); return; }
      setData(body.data);
    });
    return () => { active = false; };
  }, []);

  if (error) return <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5 text-sm text-slate-400">{error}</div>;
  if (!data) return <AtlasSkeleton className="h-[620px] w-full" />;

  const calibration = data.aiEvolution.calibration;
  const memory = data.aiEvolution.memory;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="atlas-page-eyebrow">Fase 10 · visão executiva</p><h2 className="mt-1 text-2xl font-semibold text-white">Command Center consolidado</h2></div><AtlasBadge tone={data.status === "ready" ? "success" : data.status === "blocked" ? "danger" : "warning"}>{data.status === "ready" ? "PRONTO" : data.status === "blocked" ? "BLOQUEADO" : "SEM EVIDÊNCIA COMPLETA"}</AtlasBadge></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AtlasMetric label="Banco" value={`${data.health.databaseLatencyMs} ms`} detail={data.health.databaseOk ? "Consulta aprovada" : "Sem evidência"} trend="HEALTH" tone={data.health.databaseOk ? "green" : "amber"}/><AtlasMetric label="Fila de integração" value={data.queues.pendingOutbox ?? "—"} detail={`${data.queues.failedOutbox ?? "—"} falhas/dead letter`} trend="OUTBOX" tone={data.queues.failedOutbox === 0 ? "green" : "amber"}/><AtlasMetric label="Custo IA · 30 dias" value={data.ai.measured ? `US$ ${data.ai.estimatedCostUsd30d.toFixed(2)}` : "—"} detail={`${data.ai.calls30d} chamadas medidas`} trend="AI" tone="blue"/><AtlasMetric label="Homologação" value={data.homologation.passed ?? "—"} detail={`${data.homologation.failed ?? "—"} reprovações`} trend="GATE" tone={data.homologation.failed === 0 ? "green" : "amber"}/></div>

    <AtlasCard>
      <AtlasCardHeader eyebrow="Evolução real das IAs" title="Calibragem preditiva e memória comercial" description="Percentuais calculados com cobertura, resultados observados e registros classificados — nunca como alegação de precisão." action={<AtlasBadge tone={calibration.status === "evidence_ready" ? "success" : calibration.status === "learning" ? "info" : "warning"}>{calibrationLabels[calibration.status]}</AtlasBadge>}/>
      <div className="grid gap-5 border-t border-white/[.06] p-5 lg:grid-cols-2 sm:p-6">
        <article className="rounded-3xl border border-violet-400/15 bg-violet-400/[.045] p-5">
          <div className="flex items-end justify-between gap-4"><div><p className="atlas-eyebrow">Calibragem</p><h3 className="mt-2 text-lg font-semibold text-white">Evidência para prever conversão</h3></div><strong className="text-4xl text-violet-200">{calibration.progress}%</strong></div>
          <div className="mt-5"><AtlasProgress value={calibration.progress} label="Evolução medida" /></div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-white/[.06] p-3"><strong className="text-lg text-white">{calibration.scoreCoverage}%</strong><span className="mt-1 block text-[10px] text-slate-500">SCORE COBERTO</span></div><div className="rounded-xl border border-white/[.06] p-3"><strong className="text-lg text-white">{calibration.contactCoverage}%</strong><span className="mt-1 block text-[10px] text-slate-500">CONTATO ÚTIL</span></div><div className="rounded-xl border border-white/[.06] p-3"><strong className="text-lg text-white">{calibration.outcomeMaturity}%</strong><span className="mt-1 block text-[10px] text-slate-500">AMOSTRA FINAL</span></div></div>
          <p className="mt-4 text-xs leading-5 text-slate-400">{calibration.outcomeExamples} resultados finais de {calibration.targetOutcomeExamples} necessários para maturidade inicial. {calibration.scoredLeads} de {calibration.activeLeads} leads operacionais possuem score.</p>
        </article>
        <article className="rounded-3xl border border-cyan-400/15 bg-cyan-400/[.04] p-5">
          <div className="flex items-end justify-between gap-4"><div><p className="atlas-eyebrow">Memória</p><h3 className="mt-2 text-lg font-semibold text-white">Base histórica classificada</h3></div><strong className="text-4xl text-cyan-200">{memory.coverage}%</strong></div>
          <div className="mt-5"><AtlasProgress value={memory.coverage} label="Cobertura da memória" /></div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-white/[.06] p-3"><strong className="text-lg text-emerald-200">{memory.tiers.focus.toLocaleString("pt-BR")}</strong><span className="mt-1 block text-[10px] text-slate-500">FOCUS</span></div><div className="rounded-xl border border-white/[.06] p-3"><strong className="text-lg text-sky-200">{memory.tiers.watch.toLocaleString("pt-BR")}</strong><span className="mt-1 block text-[10px] text-slate-500">WATCH</span></div><div className="rounded-xl border border-white/[.06] p-3"><strong className="text-lg text-slate-300">{memory.tiers.suppress.toLocaleString("pt-BR")}</strong><span className="mt-1 block text-[10px] text-slate-500">SUPPRESS</span></div></div>
          <p className="mt-4 text-xs leading-5 text-slate-400">{memory.classified.toLocaleString("pt-BR")} contatos classificados em {memory.preparedRows.toLocaleString("pt-BR")} registros preparados; {memory.consolidatedDuplicates.toLocaleString("pt-BR")} duplicidades consolidadas. Base isolada e sem contato automático.</p>
        </article>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.06] px-5 py-4 text-[11px] text-slate-500 sm:px-6"><span>Método: score 35% · contato 25% · resultados 40% · aprovação humana obrigatória</span><Link href="/atlas-v3/conversion-calibration" className="font-semibold text-cyan-200">Abrir calibragem detalhada →</Link></div>
    </AtlasCard>

    <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><AtlasCard><AtlasCardHeader eyebrow="Gates críticos" title="O que bloqueia produção" description="Ausência de evidência nunca aparece como aprovado."/><div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">{Object.entries(data.critical).map(([key, value]) => <div key={key} className="flex items-center justify-between rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="text-sm text-white">{labels[key] || key}</span><AtlasBadge tone={value === true ? "success" : value === false ? "danger" : "warning"}>{value === true ? "OK" : value === false ? "BLOQUEIO" : "SEM EVIDÊNCIA"}</AtlasBadge></div>)}</div></AtlasCard><AtlasCard><AtlasCardHeader eyebrow="Ações da diretoria" title="Atalhos operacionais" description="Cada detalhe permanece no módulo responsável."/><div className="grid gap-3 p-5 sm:p-6">{[["Segurança e segredos", "/atlas-v3/governance"], ["Saúde Hostinger", "/integrations/hostinger"], ["Backups e rollback", "/atlas-v3/audit"], ["Homologação por perfil", "/atlas-v3/homologation"], ["Custos e modelos de IA", "/settings/ai"], ["Aprovações pendentes", "/approvals"]].map(([label, href]) => <Link key={href} href={href} className="flex items-center justify-between rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3 text-sm text-slate-300 transition hover:border-sky-400/20 hover:text-white"><span>{label}</span><span>→</span></Link>)}</div></AtlasCard></div>
    <div className="text-right text-[11px] text-slate-600">Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")} · {data.health.hosting} · {data.health.environment}</div>
  </section>;
}
