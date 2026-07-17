"use client";

import { useEffect, useState } from "react";
import { DatabaseBackup, RotateCcw, ShieldCheck } from "lucide-react";
import { AtlasBadge } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Log = { id: string; action: string; entity_type: string | null; entity_id: string | null; created_at: string };
type Backup = { id: string; provider: string; snapshot_reference: string; snapshot_created_at: string; restore_status: "pending" | "passed" | "failed"; restore_tested_at: string | null; restore_duration_minutes: number | null; evidence_reference: string | null; responsible_id: string };
type Form = { provider: string; snapshotReference: string; snapshotCreatedAt: string; restoreStatus: "pending" | "passed" | "failed"; restoreTestedAt: string; restoreDurationMinutes: string; evidenceReference: string; notes: string };

const initialForm: Form = { provider: "Supabase", snapshotReference: "", snapshotCreatedAt: "", restoreStatus: "pending", restoreTestedAt: "", restoreDurationMinutes: "", evidenceReference: "", notes: "" };

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [form, setForm] = useState<Form>(initialForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function token() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
    return data.session.access_token;
  }

  async function loadBackups() {
    const response = await fetch("/api/v1/governance/backups", { headers: { Authorization: `Bearer ${await token()}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || body.error || "Falha ao carregar backups.");
    setBackups(body.data?.records ?? []);
  }

  useEffect(() => {
    void supabase.from("audit_logs").select("id,action,entity_type,entity_id,created_at").order("created_at", { ascending: false }).limit(100).then(({ data }) => setLogs((data ?? []) as Log[]));
    void loadBackups().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao carregar backups."));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/v1/governance/backups", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || body.error || "Falha ao registrar backup.");
      setForm(initialForm); await loadBackups();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao registrar backup."); }
    finally { setSaving(false); }
  }

  return <div className="space-y-6 pb-12">
    <header className="atlas-grid-glow rounded-[30px] border border-sky-400/15 bg-gradient-to-br from-sky-500/[.12] via-violet-500/[.06] to-emerald-500/[.08] p-6 sm:p-8">
      <AtlasBadge tone="info">GOVERNANÇA · FASE 16</AtlasBadge>
      <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Backup com restauração comprovada.</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Registre o snapshot externo antes da publicação. O Atlas guarda referência, responsável e resultado do ensaio — nunca declara um backup que não foi executado.</p>
    </header>

    {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}

    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"><DatabaseBackup className="h-5 w-5 text-sky-300" /><div className="mt-4 text-2xl font-semibold text-white">{backups.length}</div><p className="mt-1 text-xs text-slate-400">Snapshots registrados</p></div>
      <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"><ShieldCheck className="h-5 w-5 text-emerald-300" /><div className="mt-4 text-2xl font-semibold text-white">{backups.filter((item) => item.restore_status === "passed").length}</div><p className="mt-1 text-xs text-slate-400">Restaurações aprovadas</p></div>
      <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"><RotateCcw className="h-5 w-5 text-amber-300" /><div className="mt-4 text-2xl font-semibold text-white">{backups.filter((item) => item.restore_status === "pending").length}</div><p className="mt-1 text-xs text-slate-400">Ensaios pendentes</p></div>
    </section>

    <AtlasCard><AtlasCardHeader eyebrow="Snapshot externo" title="Registrar evidência de backup" description="Use a referência fornecida pelo Supabase ou pela infraestrutura da Hostinger. Não cole senhas ou chaves." />
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        <label className="text-xs text-slate-400">Provedor<input required value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className="atlas-input mt-2 w-full" /></label>
        <label className="text-xs text-slate-400">Referência do snapshot<input required value={form.snapshotReference} onChange={(e) => setForm({ ...form, snapshotReference: e.target.value })} className="atlas-input mt-2 w-full" placeholder="ID ou caminho seguro" /></label>
        <label className="text-xs text-slate-400">Criado em<input required type="datetime-local" value={form.snapshotCreatedAt} onChange={(e) => setForm({ ...form, snapshotCreatedAt: e.target.value })} className="atlas-input mt-2 w-full" /></label>
        <label className="text-xs text-slate-400">Restauração<select value={form.restoreStatus} onChange={(e) => setForm({ ...form, restoreStatus: e.target.value as Form["restoreStatus"] })} className="atlas-input mt-2 w-full"><option value="pending">Pendente</option><option value="passed">Aprovada</option><option value="failed">Falhou</option></select></label>
        <label className="text-xs text-slate-400">Testada em<input type="datetime-local" value={form.restoreTestedAt} onChange={(e) => setForm({ ...form, restoreTestedAt: e.target.value })} className="atlas-input mt-2 w-full" /></label>
        <label className="text-xs text-slate-400">Duração em minutos<input type="number" min="0" value={form.restoreDurationMinutes} onChange={(e) => setForm({ ...form, restoreDurationMinutes: e.target.value })} className="atlas-input mt-2 w-full" /></label>
        <label className="text-xs text-slate-400 sm:col-span-2">Referência da evidência<input value={form.evidenceReference} onChange={(e) => setForm({ ...form, evidenceReference: e.target.value })} className="atlas-input mt-2 w-full" placeholder="Chamado, relatório ou arquivo protegido" /></label>
        <label className="text-xs text-slate-400">Observações<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="atlas-input mt-2 w-full" /></label>
        <div className="sm:col-span-2 lg:col-span-3"><button disabled={saving} className="atlas-button-primary">{saving ? "Registrando…" : "Registrar evidência"}</button></div>
      </form>
    </AtlasCard>

    <AtlasCard><AtlasCardHeader eyebrow="Histórico de recuperação" title="Snapshots e ensaios" description="Aprovação só aparece quando data e evidência da restauração foram informadas." />
      <div className="divide-y divide-white/[.06]">{backups.map((item) => <div key={item.id} className="grid gap-3 p-5 md:grid-cols-[1.2fr_1fr_auto] md:items-center sm:p-6"><div><div className="font-medium text-white">{item.provider} · {item.snapshot_reference}</div><div className="mt-1 text-xs text-slate-500">Snapshot: {new Date(item.snapshot_created_at).toLocaleString("pt-BR")} · Responsável: {item.responsible_id.slice(0, 8)}</div></div><div className="text-xs text-slate-400">{item.evidence_reference || "Restauração ainda sem evidência"}{item.restore_duration_minutes != null ? ` · ${item.restore_duration_minutes} min` : ""}</div><AtlasBadge tone={item.restore_status === "passed" ? "success" : item.restore_status === "failed" ? "danger" : "warning"}>{item.restore_status === "passed" ? "RESTAURADO" : item.restore_status === "failed" ? "FALHOU" : "PENDENTE"}</AtlasBadge></div>)}{!backups.length ? <div className="p-8 text-center text-sm text-slate-500">Nenhum snapshot real registrado.</div> : null}</div>
    </AtlasCard>

    <AtlasCard><AtlasCardHeader eyebrow="Audit trail" title="Ações recentes" description="Rastreabilidade das ações humanas, automações e agentes." /><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-white/[.025] text-slate-500"><tr><th className="p-4 text-left">Data</th><th className="p-4 text-left">Ação</th><th className="p-4 text-left">Entidade</th><th className="p-4 text-left">Identificador</th></tr></thead><tbody className="divide-y divide-white/[.06]">{logs.map((log) => <tr key={log.id}><td className="p-4 text-slate-400">{new Date(log.created_at).toLocaleString("pt-BR")}</td><td className="p-4 font-medium text-white">{log.action}</td><td className="p-4 text-slate-400">{log.entity_type || "—"}</td><td className="p-4 text-xs text-slate-500">{log.entity_id || "—"}</td></tr>)}</tbody></table></div>
    </AtlasCard>
  </div>;
}
