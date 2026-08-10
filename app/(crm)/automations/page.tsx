"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { mapLegacyTask, type CompatRow } from "@/lib/compat/legacy-v2";

type Task = { id: string; title: string; status: string; priority: string; due_at: string | null; created_at: string };

type AutomationCard = { name: string; trigger: string; action: string; status: "active" | "ready" | "planned" };

const flows: AutomationCard[] = [
  { name: "Novo lead", trigger: "Lead criado", action: "Score + tarefa de primeiro contato", status: "active" },
  { name: "Lead quente", trigger: "Score acima de 75", action: "Prioridade alta + alerta ao corretor", status: "ready" },
  { name: "Sem resposta", trigger: "48h sem interação", action: "Follow-up automático", status: "ready" },
  { name: "Visita agendada", trigger: "Etapa visita", action: "Calendar + lembrete", status: "planned" },
  { name: "Proposta", trigger: "Etapa proposta", action: "Checklist e aprovação do gestor", status: "ready" },
  { name: "Campanha crítica", trigger: "CPL acima da meta", action: "Alerta e recomendação de otimização", status: "planned" },
];

export default function AutomationsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("tasks").select("id,title,status,priority,due_date,created_at").order("created_at", { ascending: false }).limit(20);
      setTasks(((data ?? []) as unknown as CompatRow[]).map(mapLegacyTask) as Task[]);
      setLoading(false);
    }
    load();
  }, []);

  const stats = useMemo(() => ({
    pending: tasks.filter(t => t.status !== "concluida" && t.status !== "done").length,
    urgent: tasks.filter(t => t.priority === "alta" || t.priority === "high").length,
    overdue: tasks.filter(t => t.due_at && new Date(t.due_at) < new Date() && t.status !== "concluida").length,
  }), [tasks]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">Atlas Automation</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Central de automações</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Orquestração de gatilhos comerciais, follow-ups, alertas, aprovações e ações assistidas por IA.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[["Tarefas pendentes", stats.pending], ["Alta prioridade", stats.urgent], ["Atrasadas", stats.overdue]].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-3 text-3xl font-black">{loading ? "—" : value}</p></article>)}
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {flows.map(flow => <article key={flow.name} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-start justify-between gap-3"><h2 className="font-bold">{flow.name}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] uppercase ${flow.status === "active" ? "bg-emerald-500/10 text-emerald-300" : flow.status === "ready" ? "bg-amber-500/10 text-amber-300" : "bg-zinc-800 text-zinc-400"}`}>{flow.status === "active" ? "Ativa" : flow.status === "ready" ? "Pronta" : "Planejada"}</span></div>
          <div className="mt-4 space-y-3 text-sm"><p><span className="text-zinc-500">Gatilho:</span> <span className="text-zinc-300">{flow.trigger}</span></p><p><span className="text-zinc-500">Ação:</span> <span className="text-zinc-300">{flow.action}</span></p></div>
        </article>)}
      </section>

      <section className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-6">
        <h2 className="font-bold text-violet-100">Regra de segurança</h2>
        <p className="mt-2 text-sm leading-6 text-violet-100/70">Automações podem sugerir, classificar e preparar ações. Publicações, mensagens em massa, contratos e movimentações financeiras permanecem condicionados à aprovação humana.</p>
      </section>
    </div>
  );
}
