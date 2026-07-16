"use client";

import { FormEvent, useEffect, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Source = { id: string; page_id: string; form_id: string | null; name: string; active: boolean; default_owner_id: string | null; conversion_sharing_enabled: boolean; consent_basis: string | null };
type ConversionConfig = { dataset_id: string; mode: "test"; enabled: boolean; test_event_code: string | null; consent_required: boolean } | null;
type Payload = { sources: Source[]; summary: Record<string, number>; conversionConfig: ConversionConfig; conversionSummary: Record<string, number>; conversionFunnel: Record<string, number>; internalFunnel: Record<string, number>; funnelInsights: { qualifiedRate: number; visitRate: number; proposalRate: number; convertedRate: number; lost: number; buyerProfiles: number }; readiness: { webhookSecret: boolean; graphToken: boolean; conversionsToken: boolean; cronWorker: boolean }; canManage: boolean };

const inputClass = "w-full rounded-xl border border-white/10 bg-white/[.035] px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/40";

export default function MetaIntegration() {
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState({ name: "", pageId: "", formId: "", conversionSharingEnabled: false, consentBasis: "" });
  const [conversion, setConversion] = useState({ datasetId: "", testEventCode: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function request(init?: RequestInit) {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.access_token) throw new Error("Sessão expirada.");
    const response = await fetch("/api/v1/integrations/meta", { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Falha na integração Meta.");
    return body;
  }

  async function load() {
    try {
      const payload = await request() as Payload;
      setData(payload);
      if (payload.conversionConfig) setConversion({ datasetId: payload.conversionConfig.dataset_id, testEventCode: payload.conversionConfig.test_event_code || "" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na integração Meta."); }
  }

  useEffect(() => { void load(); }, []);

  async function saveSource(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await request({ method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", pageId: "", formId: "", conversionSharingEnabled: false, consentBasis: "" });
      setNotice("Origem conectada com segurança."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar fonte."); } finally { setSaving(false); }
  }

  async function saveConversion(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await request({ method: "POST", body: JSON.stringify({ action: "conversion_config", ...conversion }) });
      setNotice("Conversions API ativada em ambiente de teste. Produção continua bloqueada."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao configurar conversões."); } finally { setSaving(false); }
  }

  const ready = data ? Object.values(data.readiness).filter(Boolean).length : 0;
  return <div className="space-y-6 pb-12">
    <section className="atlas-grid-glow rounded-[30px] border border-blue-400/15 bg-gradient-to-br from-blue-500/[.14] via-violet-500/[.08] to-transparent p-6 sm:p-8">
      <div className="flex flex-wrap gap-2"><AtlasBadge tone="info">META LEAD ADS</AtlasBadge><AtlasBadge tone="violet">CICLO DE APRENDIZADO</AtlasBadge><AtlasBadge tone="warning">CONVERSÕES EM TESTE</AtlasBadge></div>
      <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Da campanha ao CRM, do CRM à otimização.</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Receba leads reais, preserve a origem e devolva sinais de qualidade à Meta com consentimento, rastreabilidade e controle humano.</p>
    </section>
    {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
    {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <AtlasMetric label="Prontidão técnica" value={data ? `${ready}/4` : "—"} detail="Webhook, tokens e worker" trend="META" tone={ready === 4 ? "green" : "amber"} />
      <AtlasMetric label="Fontes ativas" value={data?.sources.filter((item) => item.active).length ?? "—"} detail="Páginas e formulários" trend="LEADS" tone="blue" />
      <AtlasMetric label="Leads importados" value={data?.summary.imported ?? 0} detail="Últimos 100 eventos" trend="CRM" tone="green" />
      <AtlasMetric label="Sinais entregues" value={data?.conversionSummary.delivered ?? 0} detail="Somente eventos de teste" trend="CAPI" tone="violet" />
      <AtlasMetric label="Perfis compradores" value={data?.funnelInsights.buyerProfiles ?? "—"} detail="Compraram em outro lugar" trend="LEARN" tone="rose" />
    </section>
    <section className="grid gap-6 xl:grid-cols-2">
      <AtlasCard><AtlasCardHeader eyebrow="Configuração segura" title="Fontes de leads" description="Cada origem controla separadamente se seus dados podem alimentar conversões." /><div className="p-5 sm:p-6">{!data ? <AtlasSkeleton className="h-48" /> : !data.sources.length ? <AtlasEmpty title="Nenhuma fonte cadastrada" description="Cadastre a primeira Página e Formulário para aceitar webhooks." /> : <div className="space-y-3">{data.sources.map((source) => <div key={source.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex justify-between gap-3"><div><strong className="text-white">{source.name}</strong><p className="mt-1 text-xs text-slate-500">Página {source.page_id} · Formulário {source.form_id || "todos"}</p></div><div className="flex flex-wrap justify-end gap-2"><AtlasBadge tone={source.active ? "success" : "warning"}>{source.active ? "ATIVA" : "PAUSADA"}</AtlasBadge><AtlasBadge tone={source.conversion_sharing_enabled ? "info" : "warning"}>{source.conversion_sharing_enabled ? "SINAL AUTORIZADO" : "SEM COMPARTILHAMENTO"}</AtlasBadge></div></div>{source.consent_basis ? <p className="mt-3 text-xs leading-5 text-slate-400">Base registrada: {source.consent_basis}</p> : null}</div>)}</div>}</div></AtlasCard>
      <AtlasCard><AtlasCardHeader eyebrow="Nova origem" title="Conectar Página/Formulário" description="O compartilhamento com conversões nasce desligado e depende de base registrada." /><form onSubmit={saveSource} className="space-y-3 p-5 sm:p-6"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome da origem, ex.: ARVO Julho" className={inputClass} /><input required inputMode="numeric" value={form.pageId} onChange={(event) => setForm({ ...form, pageId: event.target.value })} placeholder="ID da Página Meta" className={inputClass} /><input inputMode="numeric" value={form.formId} onChange={(event) => setForm({ ...form, formId: event.target.value })} placeholder="ID do formulário (opcional)" className={inputClass} /><label className="flex items-start gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-sm text-slate-300"><input type="checkbox" checked={form.conversionSharingEnabled} onChange={(event) => setForm({ ...form, conversionSharingEnabled: event.target.checked })} className="mt-1" /><span>Esta origem possui autorização válida para enviar sinais de conversão à Meta.</span></label>{form.conversionSharingEnabled ? <textarea required value={form.consentBasis} onChange={(event) => setForm({ ...form, consentBasis: event.target.value })} placeholder="Registre a base de autorização, política ou formulário aplicado" className={`${inputClass} min-h-24 resize-y`} /> : null}<button disabled={!data?.canManage || saving} className="atlas-button-primary w-full disabled:opacity-40">{saving ? "Salvando..." : "Ativar fonte de leads"}</button>{!data?.canManage ? <p className="text-xs text-amber-300">Somente gestão pode alterar esta integração.</p> : null}</form></AtlasCard>
      <AtlasCard><AtlasCardHeader eyebrow="Conversions API" title="Validar retorno de qualidade" description="O sistema aceita exclusivamente o código de eventos de teste nesta etapa de homologação." /><form onSubmit={saveConversion} className="space-y-3 p-5 sm:p-6"><div className="rounded-xl border border-amber-400/20 bg-amber-400/[.07] p-4 text-xs leading-5 text-amber-200">Modo produção bloqueado. Nenhum sinal real será usado para otimizar campanhas até a homologação e o aceite explícito.</div><input required inputMode="numeric" value={conversion.datasetId} onChange={(event) => setConversion({ ...conversion, datasetId: event.target.value })} placeholder="Dataset ID da Meta" className={inputClass} /><input required value={conversion.testEventCode} onChange={(event) => setConversion({ ...conversion, testEventCode: event.target.value })} placeholder="Código de evento de teste" className={inputClass} /><button disabled={!data?.canManage || saving} className="atlas-button-primary w-full disabled:opacity-40">{saving ? "Validando..." : "Ativar validação em teste"}</button></form></AtlasCard>
      <AtlasCard><AtlasCardHeader eyebrow="Saúde da conexão" title="Checklist e aprendizado" description="Acompanhe a conexão, a conversão acumulada e os sinais produzidos por avanços reais." /><div className="space-y-2 p-5 text-xs text-slate-400 sm:p-6">{data ? <><div className="mb-4 grid grid-cols-2 gap-2">{[["Lead", "Novo lead", null], ["Contact", "Contato", null], ["QualifiedLead", "Qualificado", data.funnelInsights.qualifiedRate], ["Schedule", "Visita", data.funnelInsights.visitRate], ["SubmitApplication", "Proposta", data.funnelInsights.proposalRate], ["ConvertedLead", "Convertido", data.funnelInsights.convertedRate]].map(([key, label, rate]) => <div key={String(key)} className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"><span className="block text-slate-500">{label}</span><div className="mt-1 flex items-end justify-between gap-2"><strong className="block text-lg text-white">{data.conversionFunnel[String(key)] ?? 0}</strong>{typeof rate === "number" ? <span className="text-emerald-300">{rate}% dos leads</span> : null}</div></div>)}</div><div className="mb-4 flex items-center justify-between rounded-xl border border-rose-400/15 bg-rose-400/[.06] p-3"><span>Perdas registradas somente para aprendizado interno</span><strong className="text-base text-rose-200">{data.funnelInsights.lost}</strong></div>{Object.entries(data.readiness).map(([key, value]) => <div key={key} className="flex justify-between rounded-xl bg-white/[.03] p-3"><span>{key === "webhookSecret" ? "Assinatura do webhook" : key === "graphToken" ? "Token de captura de leads" : key === "conversionsToken" ? "Token de conversões" : "Worker Hostinger"}</span><AtlasBadge tone={value ? "success" : "warning"}>{value ? "PRONTO" : "PENDENTE"}</AtlasBadge></div>)}</> : <AtlasSkeleton className="h-48" />}</div></AtlasCard>
    </section>
  </div>;
}
