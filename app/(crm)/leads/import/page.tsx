"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Target = { id: string; full_name: string | null };
type Project = { id: string; name: string; developer_name: string | null };
type Batch = { id: string; name: string; owner_id: string; development_id: string | null; source_type: string; status: string; imported_count: number; eligible_count: number; queued_count: number; created_at: string; summary: Record<string, number> };
type Payload = { viewer: { id: string; role: string }; targets: Target[]; projects: Project[]; batches: Batch[] };
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
  const [activation, setActivation] = useState({ batchId: "", templateName: "", templateLanguage: "pt_BR" });

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
    else { setNotice(`${result.data.prepared} contatos preparados. A campanha está aguardando uma aprovação gerencial.`); setActivation({ batchId: "", templateName: "", templateLanguage: "pt_BR" }); await load(); }
    setWorking(false);
  }

  function readFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) { setError("O arquivo deve ter no máximo 2 MB."); return; }
    const reader = new FileReader(); reader.onload = () => setRaw(String(reader.result || "")); reader.readAsText(file);
  }

  const totals = (data?.batches ?? []).reduce((sum, batch) => ({ contacts: sum.contacts + batch.imported_count, eligible: sum.eligible + batch.eligible_count, replies: sum.replies + (batch.summary.replied || 0) }), { contacts: 0, eligible: 0, replies: 0 });

  return <div className="space-y-6 pb-10">
    <section className="atlas-grid-glow rounded-[30px] border border-violet-400/10 bg-gradient-to-br from-violet-500/[.13] via-cyan-500/[.06] to-blue-500/[.09] p-6 sm:p-8"><div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between"><div><div className="flex flex-wrap gap-2"><AtlasBadge tone="violet">REATIVAÇÃO INTELIGENTE</AtlasBadge><AtlasBadge tone="success">WHATSAPP PROTEGIDO</AtlasBadge><AtlasBadge tone="info">BASE DO CORRETOR</AtlasBadge></div><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Transforme bases paradas em <span className="atlas-gradient-text">novas conversas.</span></h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">Importe contatos antigos, distribua para o time ou trabalhe sua própria base. O Atlas deduplica, respeita pedidos de saída e usa templates aprovados do WhatsApp.</p></div><a href="#nova-base" className="atlas-button-primary">Adicionar uma base</a></div></section>

    {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}{notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AtlasMetric label="Contatos importados" value={loading ? "—" : String(totals.contacts)} detail="Bases antigas e externas" trend="BASE" tone="violet" /><AtlasMetric label="Elegíveis" value={loading ? "—" : String(totals.eligible)} detail="Com autorização registrada" trend="ATIVÁVEIS" tone="green" /><AtlasMetric label="Respostas" value={loading ? "—" : String(totals.replies)} detail="Conversas recuperadas" trend="WHATSAPP" tone="blue" /><AtlasMetric label="Taxa de resposta" value={totals.eligible ? `${Math.round((totals.replies / totals.eligible) * 100)}%` : "0%"} detail="Sobre contatos elegíveis" trend="APRENDIZADO" tone="amber" /></section>

    <section id="nova-base" className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <AtlasCard><AtlasCardHeader eyebrow="1 · Importação" title={isBroker ? "Minha base externa" : "Nova base para ativação"} description="Formato: nome; telefone; e-mail. Até 500 contatos por base." /><div className="space-y-4 p-5 sm:p-6"><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome da base" />{!isBroker ? <select className={inputClass} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}><option value="">Corretor responsável</option>{data?.targets.map((item) => <option key={item.id} value={item.id}>{item.full_name || "Corretor"}</option>)}</select> : null}<select className={inputClass} value={form.developmentId} onChange={(e) => setForm({ ...form, developmentId: e.target.value })}><option value="">Projeto ainda não definido</option>{data?.projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.developer_name || "Incorporadora"}</option>)}</select>{!isBroker ? <select className={inputClass} value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}><option value="company_legacy">Base antiga da empresa</option><option value="broker_external">Base externa do corretor</option></select> : null}</div><textarea className={`${inputClass} min-h-40 font-mono`} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"Maria Silva; 11999999999; maria@email.com\nJoão Souza; 11988888888"} /><label className="block cursor-pointer rounded-xl border border-dashed border-cyan-400/25 bg-cyan-400/[.04] p-4 text-center text-sm text-cyan-200">Selecionar CSV ou TXT<input className="sr-only" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} /></label><div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-sm font-semibold text-white">{rows.length} contatos reconhecidos</p><p className="mt-1 text-xs text-slate-500">A prévia é processada somente após sua confirmação.</p></div><textarea className={inputClass} value={form.consentBasis} onChange={(e) => setForm({ ...form, consentBasis: e.target.value })} placeholder="Como e quando estes contatos autorizaram mensagens?" /><label className="flex gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[.05] p-4 text-sm text-slate-300"><input type="checkbox" checked={form.consentConfirmed} onChange={(e) => setForm({ ...form, consentConfirmed: e.target.checked })} /><span>Confirmo que esta base possui autorização válida para contato e que não contém contatos comprados sem consentimento.</span></label><button disabled={working || !rows.length || !form.name.trim() || !form.consentConfirmed} onClick={() => void importBase()} className="atlas-button-primary w-full disabled:opacity-40">{working ? "Processando..." : "Importar e proteger a base"}</button></div></AtlasCard>

      <AtlasCard><AtlasCardHeader eyebrow="2 · WhatsApp API" title="Preparar campanha de reativação" description="Use o nome técnico de um template já aprovado no Meta WhatsApp Manager." /><div className="space-y-4 p-5 sm:p-6"><select className={inputClass} value={activation.batchId} onChange={(e) => setActivation({ ...activation, batchId: e.target.value })}><option value="">Selecione uma base importada</option>{data?.batches.filter((item) => item.status === "imported" && item.eligible_count > 0).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.eligible_count} elegíveis</option>)}</select><input className={inputClass} value={activation.templateName} onChange={(e) => setActivation({ ...activation, templateName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="reativacao_imovel_01" /><select className={inputClass} value={activation.templateLanguage} onChange={(e) => setActivation({ ...activation, templateLanguage: e.target.value })}><option value="pt_BR">Português (Brasil)</option><option value="en_US">Inglês</option><option value="es">Espanhol</option></select><div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.05] p-4 text-sm leading-6 text-slate-300"><strong className="text-cyan-200">Fluxo protegido:</strong> o Atlas cria uma campanha, solicita uma única aprovação gerencial e só então entrega os templates à fila da API oficial.</div><button disabled={working || !activation.batchId || !activation.templateName} onClick={() => void activate()} className="atlas-button-primary w-full disabled:opacity-40">Enviar para aprovação</button></div></AtlasCard>
    </section>

    <AtlasCard><AtlasCardHeader eyebrow="Histórico" title="Bases e campanhas" description="Acompanhe importação, bloqueios, envios e respostas." /><div className="p-5 sm:p-6">{loading ? <AtlasSkeleton className="h-56 w-full" /> : !data?.batches.length ? <AtlasEmpty title="Nenhuma base importada" description="Adicione a primeira base para iniciar a reativação." /> : <div className="space-y-3">{data.batches.map((batch) => <article key={batch.id} className="grid gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 md:grid-cols-[1.3fr_.8fr_1fr_auto] md:items-center"><div><p className="font-semibold text-white">{batch.name}</p><p className="mt-1 text-xs text-slate-500">{targetMap.get(batch.owner_id) || "Corretor"} · {batch.development_id ? projectMap.get(batch.development_id) : "Sem projeto"}</p></div><div><p className="text-sm text-slate-300">{batch.eligible_count} elegíveis</p><p className="text-xs text-slate-500">{batch.imported_count - batch.eligible_count} bloqueados</p></div><div><p className="text-sm text-slate-300">{batch.summary.sent || 0} enviados · {batch.summary.replied || 0} respostas</p><p className="text-xs text-slate-500">{new Date(batch.created_at).toLocaleDateString("pt-BR")}</p></div><AtlasBadge tone={batch.status === "completed" ? "success" : batch.status === "rejected" ? "danger" : batch.status === "pending_approval" ? "warning" : "info"}>{batch.status.replaceAll("_", " ")}</AtlasBadge></article>)}</div>}</div></AtlasCard>
  </div>;
}
