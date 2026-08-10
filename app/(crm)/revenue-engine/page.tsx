"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type State = { state: "operational" | "configured" | "pending" | "blocked"; detail: string };
type Payload = { infrastructure: Record<string, State>; policy: Record<string, unknown>; summary: Record<string, { value: number; available: boolean }>; funnel: { key: string; label: string; value: number }[] };
const labels: Record<string, string> = { metaApi: "Meta API", leadAds: "Lead Ads", webhook: "Webhook", conversionApi: "Conversion API", andromeda: "Feedback Andromeda", nightSales: "Sales Desk 24/7" };
const tones: Record<State["state"], "success" | "info" | "warning" | "danger"> = { operational: "success", configured: "info", pending: "warning", blocked: "danger" };

export default function RevenueEnginePage() {
  const [data, setData] = useState<Payload | null>(null); const [error, setError] = useState("");
  async function load() { setError(""); const token = (await supabase.auth.getSession()).data.session?.access_token; if (!token) return; const response = await fetch("/api/v1/revenue-engine", { headers: { Authorization: `Bearer ${token}` } }); const payload = await response.json(); if (response.ok) setData(payload.data); else setError(payload.error?.message || "Revenue Engine temporariamente indisponível."); }
  useEffect(() => { void load(); }, []);
  return <div className="space-y-6 pb-10" data-product="atlas-ai-revenue-engine">
    <section className="atlas-grid-glow rounded-[32px] border border-cyan-300/10 bg-gradient-to-br from-blue-500/[.18] via-indigo-500/[.11] to-violet-500/[.12] p-6 sm:p-9">
      <div className="flex flex-wrap gap-2"><AtlasBadge tone="success">CONVERSÃO 24/7</AtlasBadge><AtlasBadge tone="info">META + CRM</AtlasBadge><AtlasBadge tone="violet">HUMANO NO CONTROLE</AtlasBadge></div>
      <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-.045em] text-white sm:text-6xl">Nenhuma oportunidade esfria sem resposta.</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">O Atlas recebe, prioriza e prepara a conversa; o corretor assume com contexto, próxima ação e histórico. À noite, a operação funciona das 22h às 07h com consentimento, template oficial e aprovação.</p>
      <div className="mt-6 flex flex-wrap gap-3"><Link href="/leads/nightly-handoffs" className="atlas-button-primary">Abrir handoffs da manhã</Link><Link href="/integrations/meta/andromeda" className="atlas-button-secondary">Qualidade dos sinais Meta</Link><Link href="/leads/reactivation-governance" className="atlas-button-secondary">Reativar base</Link></div>
    </section>
    {error ? <AtlasEmpty title="Revenue Engine em preparação" description={error} action={<button className="atlas-button-secondary" onClick={() => void load()}>Tentar novamente</button>} /> : null}
    {!data && !error ? <AtlasSkeleton className="h-72 w-full" /> : null}
    {data ? <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AtlasMetric label="Leads · 30 dias" value={data.summary.leads.value} detail="Recebidos na operação" trend="ENTRADA" tone="blue"/><AtlasMetric label="Jornadas IA" value={data.summary.journeys.value} detail="Atendimentos preparados" trend="24/7" tone="violet"/><AtlasMetric label="Handoffs" value={data.summary.handoffs.value} detail="Contexto entregue ao corretor" trend="MANHÃ" tone="green"/><AtlasMetric label="Eventos Meta" value={data.summary.delivered.value} detail={`${data.summary.conversions.value} eventos registrados`} trend="FEEDBACK" tone="amber"/></section>
      <AtlasCard><AtlasCardHeader eyebrow="Auditoria viva" title="Meta, Andromeda e atendimento" description="Credencial detectada não significa integração aprovada: o status só evolui após teste real."/><div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(data.infrastructure).map(([key, item]) => <article key={key} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-center justify-between gap-3"><b className="text-sm text-white">{labels[key] || key}</b><AtlasBadge tone={tones[item.state]}>{item.state}</AtlasBadge></div><p className="mt-3 text-xs leading-5 text-slate-400">{item.detail}</p></article>)}</div></AtlasCard>
      <AtlasCard><AtlasCardHeader eyebrow="Da mídia à receita" title="Funil de aprendizado" description="A Meta aprende com resultados profundos; o Atlas preserva a decisão e o contexto comercial."/><div className="grid gap-3 p-5 sm:grid-cols-3 xl:grid-cols-6">{data.funnel.map((stage, index) => <article key={stage.key} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="text-[10px] font-bold text-cyan-300">0{index + 1}</span><p className="mt-2 text-xs text-slate-400">{stage.label}</p><strong className="mt-3 block text-2xl text-white">{stage.value}</strong></article>)}</div></AtlasCard>
      <section className="grid gap-6 lg:grid-cols-2"><AtlasCard><AtlasCardHeader eyebrow="Night Sales · 22h–07h" title="Acolher, descobrir e qualificar" description="Sem proposta automática, sem troca silenciosa de corretor e sem mensagem fora das regras."/><div className="space-y-3 p-5 text-sm text-slate-300"><p>1. Consentimento, opt-out, telefone e template são validados.</p><p>2. Projeto e materiais atuais entram no contexto.</p><p>3. A IA prepara a qualificação e registra o que aprendeu.</p><p>4. Pela manhã, o corretor exclusivo recebe resumo e próxima ação.</p></div></AtlasCard><AtlasCard><AtlasCardHeader eyebrow="Reactivation Engine" title="Recuperar sem poluir a carteira" description="A base antiga permanece isolada até elegibilidade e aprovação."/><div className="p-5"><AtlasMetric label="Contatos governados" value={data.summary.reactivation.value} detail="Deduplicação, opt-out e telefone inválido preservados" trend="PROTEGIDO" tone="green"/></div></AtlasCard></section>
    </> : null}
  </div>;
}

