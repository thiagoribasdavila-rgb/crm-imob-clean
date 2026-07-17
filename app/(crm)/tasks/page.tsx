"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  lead_id: string | null;
  lead?: { id: string; name: string | null; purpose: string | null } | null;
};

function overdue(value: string | null) { return Boolean(value && new Date(value).getTime() < Date.now()); }
function dateLabel(value: string | null) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Sem prazo"; }
function completed(status: string) { return ["concluida", "concluído", "concluido", "done", "completed"].includes(status.toLowerCase()); }

export default function TasksPage() {
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"prioridade" | "vencidas" | "todas">("prioridade");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: loadError } = await supabase.from("tasks").select("id,title,description,due_at,priority,status,lead_id,lead:leads(id,name,purpose)").order("due_at", { ascending: true, nullsFirst: false }).limit(500);
    if (loadError) setError("Não foi possível carregar sua operação diária.");
    setItems((data as unknown as Task[]) ?? []); setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function finish(task: Task) {
    setSavingId(task.id); setError("");
    const { error: updateError } = await supabase.from("tasks").update({ status: "concluida" }).eq("id", task.id);
    if (updateError) setError("Não foi possível concluir a tarefa.");
    else setItems((current) => current.map((item) => item.id === task.id ? { ...item, status: "concluida" } : item));
    setSavingId(null);
  }

  async function postpone(task: Task) {
    setSavingId(task.id); setError("");
    const dueAt = new Date(Date.now() + 86_400_000).toISOString();
    const { error: updateError } = await supabase.from("tasks").update({ due_at: dueAt }).eq("id", task.id);
    if (updateError) setError("Não foi possível reagendar a tarefa.");
    else setItems((current) => current.map((item) => item.id === task.id ? { ...item, due_at: dueAt } : item));
    setSavingId(null);
  }

  const open = useMemo(() => items.filter((item) => !completed(item.status)), [items]);
  const metrics = useMemo(() => ({ open: open.length, overdue: open.filter((item) => overdue(item.due_at)).length, high: open.filter((item) => item.priority.toLowerCase() === "alta").length, today: open.filter((item) => item.due_at && new Date(item.due_at).toDateString() === new Date().toDateString()).length }), [open]);
  const visible = useMemo(() => [...open].filter((item) => view !== "vencidas" || overdue(item.due_at)).sort((a, b) => {
    const weight = (item: Task) => (overdue(item.due_at) ? 300 : 0) + (item.priority.toLowerCase() === "alta" ? 100 : 0) + (item.due_at ? Math.max(0, 80 - Math.floor((new Date(item.due_at).getTime() - Date.now()) / 3_600_000)) : 0);
    return view === "todas" ? new Date(a.due_at || "2999").getTime() - new Date(b.due_at || "2999").getTime() : weight(b) - weight(a);
  }), [open, view]);

  return <div className="space-y-6 pb-8">
    <section><AtlasBadge tone="info">OPERAÇÃO DIÁRIA</AtlasBadge><h1 className="mt-4 text-3xl font-semibold tracking-[-.04em] text-white sm:text-4xl">Tarefas e próximos passos</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Uma fila simples para cumprir combinados, recuperar atrasos e manter cada lead avançando.</p></section>
    {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AtlasMetric label="Pendentes" value={loading ? "—" : metrics.open} detail="Ações em aberto" trend="LIVE" tone="blue"/><AtlasMetric label="Vencidas" value={loading ? "—" : metrics.overdue} detail="Resolver primeiro" trend="SLA" tone="rose"/><AtlasMetric label="Para hoje" value={loading ? "—" : metrics.today} detail="Compromissos do dia" trend="HOJE" tone="amber"/><AtlasMetric label="Alta prioridade" value={loading ? "—" : metrics.high} detail="Maior impacto" trend="FOCO" tone="violet"/></section>
    <AtlasCard><AtlasCardHeader eyebrow="Daily execution" title="Minha fila comercial" description="Vencimentos e prioridades aparecem primeiro. Concluir e reagendar preservam a operação no padrão atual do V3." action={<button type="button" onClick={() => void load()} className="atlas-button-secondary">Atualizar</button>}/><div className="flex gap-2 overflow-x-auto border-t border-white/[.06] p-4 sm:px-6">{([['prioridade','Prioridade inteligente'],['vencidas','Somente vencidas'],['todas','Por prazo']] as const).map(([key,label]) => <button key={key} onClick={() => setView(key)} className={`atlas-kanban-toggle shrink-0 ${view === key ? "is-active" : ""}`}>{label}</button>)}</div><div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">{loading ? [1,2,3,4].map((item) => <AtlasSkeleton key={item} className="h-44"/>) : visible.length ? visible.map((task) => <article key={task.id} className={`rounded-2xl border p-4 ${overdue(task.due_at) ? "border-rose-400/18 bg-rose-400/[.04]" : "border-white/[.07] bg-white/[.02]"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-white">{task.title || "Tarefa comercial"}</h2><p className="mt-1 truncate text-xs text-slate-500">{task.lead?.name || "Sem lead vinculada"}{task.lead?.purpose ? ` · ${task.lead.purpose}` : ""}</p></div><AtlasBadge tone={overdue(task.due_at) ? "danger" : task.priority.toLowerCase() === "alta" ? "warning" : "neutral"}>{overdue(task.due_at) ? "VENCIDA" : task.priority || "NORMAL"}</AtlasBadge></div><p className="mt-4 text-xs leading-5 text-slate-400">{task.description || "Execute a ação e registre o resultado na timeline da lead."}</p><p className={`mt-3 text-xs font-semibold ${overdue(task.due_at) ? "text-rose-300" : "text-sky-300"}`}>{dateLabel(task.due_at)}</p><div className="mt-4 flex flex-wrap gap-2">{task.lead_id ? <Link href={`/leads/${task.lead_id}`} className="atlas-button-secondary">Abrir lead</Link> : null}<button type="button" disabled={savingId === task.id} onClick={() => void postpone(task)} className="atlas-button-secondary disabled:opacity-50">+1 dia</button><button type="button" disabled={savingId === task.id} onClick={() => void finish(task)} className="atlas-button-primary disabled:opacity-50">Concluir</button></div></article>) : <div className="lg:col-span-2"><AtlasEmpty title="Fila em dia" description="Nenhuma tarefa aberta neste filtro."/></div>}</div></AtlasCard>
  </div>;
}
