"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Batch = { id: string; name: string; status: string; quality_status: string; daily_cap: number; interval_seconds: number; maximum_attempts: number; cooling_off_hours: number; eligible_count: number; queued_count: number; deliveryRate: number; replyRate: number; stopRequired: boolean; paused_reason: string | null };
type Decision = { severity: "critical" | "opportunity" | "attention"; title: string; evidence: string; nextAction: string; batchId: string };
type Payload = { batches: Batch[]; decisionQueue: Decision[]; summary: { batches: number; running: number; paused: number; replies: number } };

export default function ReactivationGovernancePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ quality: "unknown", dailyCap: 100, intervalSeconds: 30, consent: true, template: true, contacts: 100, officialApi: true });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) { setError("Sua sessão expirou. Entre novamente para revisar a base."); setLoading(false); return; }
    const response = await fetch("/api/v1/crm/reactivation/governance", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const payload = await response.json();
    if (response.ok) setData(payload.data);
    else setError(payload.error?.message || "A central não pôde ser atualizada.");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function simulate() {
    setError("");
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) { setError("Sua sessão expirou."); return; }
    const response = await fetch("/api/v1/crm/reactivation/governance", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(form) });
    const payload = await response.json();
    if (response.ok) setPreview(payload.data);
    else setError(payload.error?.message || "A simulação não pôde ser concluída.");
  }

  function openCopilot(decision: Decision) {
    window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: { prompt: `Prepare um plano humano e seguro para esta decisão de reativação: ${decision.title}. Evidência agregada: ${decision.evidence}. Próxima ação sugerida: ${decision.nextAction}. Não envie mensagens, não atribua leads e não execute mudanças.`, context: { module: "reactivation", severity: decision.severity } } }));
  }

  return <div className="space-y-6 pb-10" data-evolution-phase="43" data-reactivation-layout="decision-first">
    <section className="atlas-grid-glow rounded-[30px] border border-emerald-400/10 bg-gradient-to-br from-emerald-500/[.1] via-blue-500/[.08] to-violet-500/[.1] p-6 sm:p-8">
      <div className="flex flex-wrap gap-2"><AtlasBadge tone="success">BASE FRIA SEPARADA</AtlasBadge><AtlasBadge tone="info">IA SUGERE</AtlasBadge><AtlasBadge tone="violet">HUMANO DECIDE</AtlasBadge></div>
      <h1 className="mt-5 text-3xl font-semibold text-white sm:text-5xl">Recupere oportunidades sem perder confiança.</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">A base histórica fica fora da carteira ativa. O Atlas prioriza respostas, bloqueios e qualidade; nenhum contato, envio ou transferência acontece sem consentimento e aprovação humana.</p>
      <div className="mt-6 flex flex-wrap gap-3"><Link href="/leads/import" className="atlas-button-primary">Importar base autorizada</Link><Link href="/leads/reactivation" className="atlas-button-secondary">Abrir central operacional</Link></div>
    </section>
    {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
    {data?.decisionQueue.length ? <AtlasCard><AtlasCardHeader eyebrow="Decisão antes do volume" title="O que protege conversão agora" description="Até três situações explicáveis. A IA prepara o plano; a liderança aprova qualquer ação."/><div className="grid gap-3 p-5 pt-0 lg:grid-cols-3">{data.decisionQueue.map((decision) => <article key={decision.batchId} className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4"><AtlasBadge tone={decision.severity === "critical" ? "danger" : decision.severity === "opportunity" ? "success" : "warning"}>{decision.severity}</AtlasBadge><h3 className="mt-3 font-semibold text-white">{decision.title}</h3><p className="mt-2 text-xs leading-5 text-slate-400">{decision.evidence}</p><p className="mt-3 text-xs text-sky-200">{decision.nextAction}</p><button type="button" onClick={() => openCopilot(decision)} className="atlas-button-secondary mt-4 w-full">Preparar decisão com IA</button></article>)}</div></AtlasCard> : null}
    {data ? <section className="grid gap-4 sm:grid-cols-4"><AtlasMetric label="Bases" value={data.summary.batches} detail="Fora da carteira ativa" trend="RLS" tone="blue"/><AtlasMetric label="Em operação" value={data.summary.running} detail="Aprovadas ou enfileiradas" trend="OFICIAL" tone="green"/><AtlasMetric label="Pausadas" value={data.summary.paused} detail="Qualidade ou controle humano" trend="SEGURANÇA" tone="amber"/><AtlasMetric label="Respostas" value={data.summary.replies} detail="Cadência interrompida" trend="CONVERSÃO" tone="violet"/></section> : loading ? <AtlasSkeleton className="h-40 w-full" /> : null}
    <section className="grid gap-6 xl:grid-cols-[.65fr_1.35fr]">
      <AtlasCard><AtlasCardHeader eyebrow="Simulador sem envio" title="Calibrar cadência" description="Confira o limite antes de solicitar aprovação."/><div className="space-y-3 p-5"><select value={form.quality} onChange={(event) => setForm({ ...form, quality: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#0a1120] p-3 text-white"><option value="green">Qualidade verde</option><option value="yellow">Qualidade amarela</option><option value="unknown">Ainda desconhecida</option><option value="red">Qualidade vermelha</option></select><label className="block text-xs text-slate-400">Limite diário solicitado<input type="number" value={form.dailyCap} onChange={(event) => setForm({ ...form, dailyCap: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.035] p-3 text-white"/></label><label className="block text-xs text-slate-400">Intervalo em segundos<input type="number" value={form.intervalSeconds} onChange={(event) => setForm({ ...form, intervalSeconds: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.035] p-3 text-white"/></label>{[["consent", "Consentimento documentado"], ["template", "Template aprovado"], ["officialApi", "API oficial pronta"]].map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={Boolean(form[key as keyof typeof form])} onChange={(event) => setForm({ ...form, [key]: event.target.checked })}/>{label}</label>)}<button type="button" onClick={() => void simulate()} className="atlas-button-primary w-full">Simular política</button>{preview ? <pre className="max-h-64 overflow-auto rounded-xl bg-[#050a14] p-3 text-xs text-slate-400">{JSON.stringify(preview, null, 2)}</pre> : null}</div></AtlasCard>
      <AtlasCard><AtlasCardHeader eyebrow="Operação" title="Bases governadas" description="Qualidade, entrega, resposta e pausa em uma visão simples."/><div className="space-y-3 p-5">{data?.batches.map((batch) => <article key={batch.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex flex-wrap items-center gap-2"><b className="text-white">{batch.name}</b><AtlasBadge tone={batch.quality_status === "green" ? "success" : batch.quality_status === "red" ? "danger" : "warning"}>{batch.quality_status}</AtlasBadge><AtlasBadge tone="info">{batch.status}</AtlasBadge>{batch.stopRequired ? <AtlasBadge tone="danger">PAUSAR</AtlasBadge> : null}</div><div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400 sm:grid-cols-4"><span>{batch.eligible_count} elegíveis</span><span>{batch.daily_cap}/dia</span><span>{batch.interval_seconds}s intervalo</span><span>{batch.replyRate}% resposta</span></div><p className="mt-3 text-[11px] text-slate-500">Máximo {batch.maximum_attempts} tentativas · espera {batch.cooling_off_hours}h · {batch.paused_reason || "sem bloqueio ativo"}</p></article>)}{data && !data.batches.length ? <AtlasEmpty title="Nenhuma base ativa" description="Importe uma base autorizada para iniciar com segurança." /> : null}</div></AtlasCard>
    </section>
  </div>;
}
