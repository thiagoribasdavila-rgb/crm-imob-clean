"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Target = { id: string; full_name: string | null };
type Project = { id: string; name: string; developer_name: string | null };
type Batch = { id: string; name: string; owner_id: string; development_id: string | null; source_type: string; status: string; quality_status: string; imported_count: number; eligible_count: number; queued_count: number; delivered_count: number; read_count: number; replied_count: number; failed_count: number; created_at: string; summary: Record<string, number> };
type Experience = { id: string; lead_id: string; broker_id: string; severity: string; confidence: number; evidence: string; recommendation: string; suggested_reply: string; created_at: string };
type Payload = { viewer: { id: string; role: string }; targets: Target[]; projects: Project[]; batches: Batch[]; experiences: Experience[] };
type Row = { name: string; phone: string; email?: string };

const inputClass = "w-full rounded-xl border border-white/10 bg-[#080e1a] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/40";

function parseBase(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: Row[] = [];
  lines.slice(0, 501).forEach((line, index) => {
    const cells = line.split(/[;,\t]/).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    if (index === 0 && cells.some((cell) => /nome|telefone|phone|email/i.test(cell))) return;
    if (cells[1]) rows.push({ name: cells[0] || "Lead reativação", phone: cells[1], email: cells[2] || undefined });
  });
  return rows;
}

async function token() { return (await supabase.auth.getSession()).data.session?.access_token || ""; }

export default function ImportLeadsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [raw, setRaw] = useState("");
  const [form, setForm] = useState({ name: "", ownerId: "", developmentId: "", sourceType: "company_legacy", consentBasis: "", consentConfirmed: false });
  const [activation, setActivation] = useState({ batchId: "", templateName: "", templateLanguage: "pt_BR", dailyCap: 100, intervalSeconds: 30 });
  const [experienceReasons, setExperienceReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/crm/reactivation", { headers: { Authorization: `Bearer ${await token()}` } });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Falha ao carregar bases.");
    else { setData(result.data); setForm((current) => ({ ...current, ownerId: current.ownerId || result.data.viewer.id })); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const rows = useMemo(() => parseBase(raw), [raw]);
  const isBroker = data?.viewer.role === "broker";
  const targetMap = useMemo(() => new Map((data?.targets ?? []).map((item) => [item.id, item.full_name || "Corretor"])), [data]);
  const projectMap = useMemo(() => new Map((data?.projects ?? []).map((item) => [item.id, item.name])), [data]);

  async function importBase() {
    setWorking(true); setError(""); setNotice("");
    const response = await fetch("/api/v1/crm/reactivation", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", ...form, rows }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível importar.");
    else { setNotice(`${result.data.imported} contatos processados: ${result.data.eligible} elegíveis e ${result.data.blocked} bloqueados.`); setRaw(""); setForm((current) => ({ ...current, name: "", consentBasis: "", consentConfirmed: false })); await load(); }
    setWorking(false);
  }

  async function activate() {
    setWorking(true); setError(""); setNotice("");
    const response = await fetch("/api/v1/crm/reactivation", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate", ...activation }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível preparar a campanha.");
    else { setNotice(`${result.data.prepared} contatos preparados. A campanha está aguardando uma aprovação gerencial.`); setActivation({ batchId: "", templateName: "", templateLanguage: "pt_BR", dailyCap: 100, intervalSeconds: 30 }); await load(); }
    setWorking(false);
  }

  async function control(batchId: string, command: "pause" | "resume") {
    setWorking(true); setError("");
    const response = await fetch("/api/v1/crm/reactivation", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "control", batchId, command }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível controlar a campanha.");
    else { setNotice(command === "pause" ? "Campanha pausada imediatamente." : "Campanha retomada sob monitoramento."); await load(); }
    setWorking(false);
  }

  async function decideExperience(signalId: string, experienceDecision: "keep" | "change_requested") {
    setWorking(true); setError("");
    const response = await fetch("/api/v1/crm/reactivation", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "experience_decision", signalId, experienceDecision, reason: experienceReasons[signalId] || "" }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível registrar a decisão.");
    else { setNotice(experienceDecision === "keep" ? "Corretor mantido com recuperação acompanhada." : "Troca solicitada para decisão e escolha do novo corretor."); await load(); }
    setWorking(false);
  }

  function readFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) { setError("O arquivo deve ter no máximo 2 MB."); return; }
    const reader = new FileReader(); reader.onload = () => setRaw(String(reader.result || "")); reader.readAsText(file);
  }

  const totals = (data?.batches ?? []).reduce((sum, batch) => ({ contacts: sum.contacts + batch.imported_count, eligible: sum.eligible + batch.eligible_count, replies: sum.replies + (batch.summary.replied || 0) }), { contacts: 0, eligible: 0, replies: 0 });
  const protectionTotals = (data?.batches ?? []).reduce((sum, batch) => ({ optOut: sum.optOut + (batch.summary["blocked:opt_out"] || 0) + (batch.summary["blocked:opt_out_before_activation"] || 0), duplicates: sum.duplicates + (batch.summary["blocked:duplicado_no_arquivo"] || 0) + (batch.summary["blocked:lead_ja_existente"] || 0) }), { optOut: 0, duplicates: 0 });

  return <div className="space-y-6 pb-10">
    <section className="atlas-grid-glow rounded-[30px] border border-violet-400/10 bg-gradient-to-br from-violet-500/[.13] via-cyan-500/[.06] to-blue-500/[.09] p-6 sm:p-8"><div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between"><div><div className="flex flex-wrap gap-2"><AtlasBadge tone="violet">REATIVAÇÃO INTELIGENTE</AtlasBadge><AtlasBadge tone="success">WHATSAPP PROTEGIDO</AtlasBadge><AtlasBadge tone="info">BASE DO CORRETOR</AtlasBadge></div><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Transforme bases paradas em <span className="atlas-gradient-text">novas conversas.</span></h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">Importe contatos antigos, distribua para o time ou trabalhe sua própria base. O Atlas deduplica, respeita pedidos de saída e usa templates aprovados do WhatsApp.</p></div><a href="#nova-base" className="atlas-button-primary">Adicionar uma base</a></div></section>

    {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}{notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AtlasMetric label="Contatos importados" value={loading ? "—" : String(totals.contacts)} detail="Bases antigas e externas" trend="BASE" tone="violet" /><AtlasMetric label="Elegíveis" value={loading ? "—" : String(totals.eligible)} detail="Com autorização registrada" trend="ATIVÁVEIS" tone="green" /><AtlasMetric label="Respostas" value={loading ? "—" : String(totals.replies)} detail="Conversas recuperadas" trend="WHATSAPP" tone="blue" /><AtlasMetric label="Taxa de resposta" value={totals.eligible ? `${Math.round((totals.replies / totals.eligible) * 100)}%` : "0%"} detail="Sobre contatos elegíveis" trend="APRENDIZADO" tone="amber" /></section>

    <section className="rounded-[24px] border border-emerald-400/15 bg-gradient-to-r from-emerald-400/[.07] to-cyan-400/[.04] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="atlas-eyebrow">Fase 36 · Proteção comprovada</p><h2 className="mt-2 text-xl font-semibold text-white">Consentimento, duplicidade e opt-out conferidos em duas etapas</h2><p className="mt-2 text-sm text-slate-400">O Atlas verifica na importação e novamente antes da aprovação. Nenhuma lead existente é transferida silenciosamente.</p></div><div className="flex gap-3"><AtlasBadge tone="danger">{protectionTotals.optOut} OPT-OUTS</AtlasBadge><AtlasBadge tone="warning">{protectionTotals.duplicates} DUPLICADOS</AtlasBadge></div></div></section>

    {data?.experiences.length ? <AtlasCard><AtlasCardHeader eyebrow="Fase 41 · Decisão humana" title="Atendimentos que pedem decisão" description="A IA explica o atrito, mas nunca troca o corretor. A decisão e o motivo ficam auditados; pedidos de troca seguem para aprovação." /><div className="space-y-3 p-5 sm:p-6">{data.experiences.map((item) => { const reason = experienceReasons[item.id] || ""; return <article key={item.id} className="rounded-2xl border border-amber-400/15 bg-amber-400/[.045] p-4"><div className="grid gap-4 lg:grid-cols-[1fr_.8fr]"><div><div className="flex gap-2"><AtlasBadge tone={item.severity === "critical" ? "danger" : "warning"}>{item.severity}</AtlasBadge><AtlasBadge tone="info">{item.confidence}% confiança</AtlasBadge></div><p className="mt-3 font-semibold text-white">{item.evidence}</p><p className="mt-2 text-sm text-slate-400">Sugestão ao cliente: “{item.suggested_reply}”</p><p className="mt-2 text-xs text-slate-500">Corretor atual: {targetMap.get(item.broker_id) || "Responsável atual"}</p></div><div><textarea value={reason} onChange={(event) => setExperienceReasons((current) => ({ ...current, [item.id]: event.target.value }))} className={`${inputClass} min-h-20`} placeholder="Motivo da decisão (obrigatório)" maxLength={500} /><div className="mt-3 flex flex-wrap gap-2"><button disabled={working || reason.trim().length < 5} onClick={() => void decideExperience(item.id, "keep")} className="atlas-button-secondary disabled:opacity-40">Manter e recuperar</button><button disabled={working || reason.trim().length < 5} onClick={() => void decideExperience(item.id, "change_requested")} className="atlas-button-primary disabled:opacity-40">Solicitar troca</button></div><p className="mt-2 text-[10px] text-slate-500">Solicitar troca não altera o responsável atual.</p></div></div></article>; })}</div></AtlasCard> : null}

    <section id="nova-base" className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <AtlasCard><AtlasCardHeader eyebrow="1 · Importação" title={isBroker ? "Minha base externa" : "Nova base para ativação"} description="Formato: nome; telefone; e-mail. Até 500 contatos por base." /><div className="space-y-4 p-5 sm:p-6"><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome da base" />{!isBroker ? <select className={inputClass} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}><option value="">Corretor responsável</option>{data?.targets.map((item) => <option key={item.id} value={item.id}>{item.full_name || "Corretor"}</option>)}</select> : null}<select className={inputClass} value={form.developmentId} onChange={(e) => setForm({ ...form, developmentId: e.target.value })}><option value="">Projeto ainda não definido</option>{data?.projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.developer_name || "Incorporadora"}</option>)}</select>{!isBroker ? <select className={inputClass} value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}><option value="company_legacy">Base antiga da empresa</option><option value="broker_external">Base externa do corretor</option></select> : null}</div><textarea className={`${inputClass} min-h-40 font-mono`} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"Maria Silva; 11999999999; maria@email.com\nJoão Souza; 11988888888"} /><label className="block cursor-pointer rounded-xl border border-dashed border-cyan-400/25 bg-cyan-400/[.04] p-4 text-center text-sm text-cyan-200">Selecionar CSV ou TXT<input className="sr-only" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} /></label><div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-sm font-semibold text-white">{rows.length} contatos reconhecidos</p><p className="mt-1 text-xs text-slate-500">A prévia é processada somente após sua confirmação.</p></div><textarea className={inputClass} value={form.consentBasis} onChange={(e) => setForm({ ...form, consentBasis: e.target.value })} placeholder="Como e quando estes contatos autorizaram mensagens?" /><label className="flex gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[.05] p-4 text-sm text-slate-300"><input type="checkbox" checked={form.consentConfirmed} onChange={(e) => setForm({ ...form, consentConfirmed: e.target.checked })} /><span>Confirmo que esta base possui autorização válida para contato e que não contém contatos comprados sem consentimento.</span></label><button disabled={working || !rows.length || !form.name.trim() || !form.consentConfirmed} onClick={() => void importBase()} className="atlas-button-primary w-full disabled:opacity-40">{working ? "Processando..." : "Importar e proteger a base"}</button></div></AtlasCard>

      <AtlasCard><AtlasCardHeader eyebrow="2 · WhatsApp API" title="Preparar campanha de reativação" description="Use o nome técnico de um template já aprovado no Meta WhatsApp Manager." /><div className="space-y-4 p-5 sm:p-6"><select className={inputClass} value={activation.batchId} onChange={(e) => setActivation({ ...activation, batchId: e.target.value })}><option value="">Selecione uma base importada</option>{data?.batches.filter((item) => item.status === "imported" && item.eligible_count > 0).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.eligible_count} elegíveis</option>)}</select><input className={inputClass} value={activation.templateName} onChange={(e) => setActivation({ ...activation, templateName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="reativacao_imovel_01" /><select className={inputClass} value={activation.templateLanguage} onChange={(e) => setActivation({ ...activation, templateLanguage: e.target.value })}><option value="pt_BR">Português (Brasil)</option><option value="en_US">Inglês</option><option value="es">Espanhol</option></select><div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Limite diário<input type="number" min="10" max="1000" className={`${inputClass} mt-2`} value={activation.dailyCap} onChange={(e) => setActivation({ ...activation, dailyCap: Number(e.target.value) })} /></label><label className="text-xs text-slate-400">Intervalo (segundos)<input type="number" min="10" max="3600" className={`${inputClass} mt-2`} value={activation.intervalSeconds} onChange={(e) => setActivation({ ...activation, intervalSeconds: Number(e.target.value) })} /></label></div><div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.05] p-4 text-sm leading-6 text-slate-300"><strong className="text-cyan-200">Fluxo protegido:</strong> aprovação única, envio gradual a partir das 9h, limite diário, opt-out em tempo real e pausa por qualidade.</div><button disabled={working || !activation.batchId || !activation.templateName} onClick={() => void activate()} className="atlas-button-primary w-full disabled:opacity-40">Enviar para aprovação</button></div></AtlasCard>
    </section>

      <AtlasCard><AtlasCardHeader eyebrow="Histórico" title="Bases e campanhas" description="Acompanhe importação, bloqueios, envios e respostas." /><div className="p-5 sm:p-6">{loading ? <AtlasSkeleton className="h-56 w-full" /> : !data?.batches.length ? <AtlasEmpty title="Nenhuma base importada" description="Adicione a primeira base para iniciar a reativação." /> : <div className="space-y-3">{data.batches.map((batch) => <article key={batch.id} className="grid gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 md:grid-cols-[1.3fr_.8fr_1fr_auto] md:items-center"><div><p className="font-semibold text-white">{batch.name}</p><p className="mt-1 text-xs text-slate-500">{targetMap.get(batch.owner_id) || "Corretor"} · {batch.development_id ? projectMap.get(batch.development_id) : "Sem projeto"}</p></div><div><p className="text-sm text-slate-300">{batch.eligible_count} elegíveis</p><p className="text-xs text-slate-500">{batch.imported_count - batch.eligible_count} bloqueados · {batch.summary["blocked:opt_out"] || 0} opt-outs · {(batch.summary["blocked:duplicado_no_arquivo"] || 0) + (batch.summary["blocked:lead_ja_existente"] || 0)} duplicados</p></div><div><p className="text-sm text-slate-300">{batch.delivered_count || 0} entregues · {batch.read_count || 0} lidas · {batch.replied_count || 0} respostas</p><p className="text-xs text-slate-500">Saúde {batch.quality_status || "unknown"} · {batch.failed_count || 0} falhas</p></div><div className="flex items-center gap-2"><AtlasBadge tone={batch.quality_status === "red" || batch.status === "rejected" ? "danger" : batch.quality_status === "yellow" || batch.status === "pending_approval" ? "warning" : batch.status === "completed" ? "success" : "info"}>{batch.status.replaceAll("_", " ")}</AtlasBadge>{["queued", "running"].includes(batch.status) && batch.quality_status !== "red" ? <button disabled={working} onClick={() => void control(batch.id, "pause")} className="text-xs text-rose-300">Pausar</button> : null}{batch.quality_status === "red" && data.viewer.role !== "broker" ? <button disabled={working} onClick={() => void control(batch.id, "resume")} className="text-xs text-emerald-300">Retomar</button> : null}</div></article>)}</div>}</div></AtlasCard>
  </div>;
}
