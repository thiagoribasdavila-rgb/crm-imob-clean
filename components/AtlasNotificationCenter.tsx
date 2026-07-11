"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type TaskItem = {
  id: string;
  title: string;
  priority: string | null;
  status: string | null;
  due_at: string | null;
};

type DecisionItem = {
  id: string;
  title: string;
  priority: string | null;
  status: string | null;
  confidence: number | null;
  created_at: string;
};

type InsightItem = {
  id: string;
  title: string;
  recommendation: string | null;
  score: number | null;
  created_at: string;
};

type DlqItem = {
  id: string;
  topic: string;
  error_message: string;
  resolved: boolean;
  created_at: string;
};

function timeLabel(value?: string | null) {
  if (!value) return "Sem prazo";
  const date = new Date(value);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const hours = Math.round(diff / 3_600_000);
  if (hours < -24) return `${Math.abs(Math.round(hours / 24))}d atrasado`;
  if (hours < 0) return `${Math.abs(hours)}h atrasado`;
  if (hours < 24) return `em ${hours}h`;
  return `em ${Math.round(hours / 24)}d`;
}

export default function AtlasNotificationCenter() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [failures, setFailures] = useState<DlqItem[]>([]);

  async function load() {
    setLoading(true);
    const [taskRes, decisionRes, insightRes, failureRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,priority,status,due_at")
        .not("status", "in", "(done,concluido,concluída)")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(8),
      supabase
        .from("atlas_decisions")
        .select("id,title,priority,status,confidence,created_at")
        .in("status", ["proposed", "pending_approval", "approved"])
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("ai_insights")
        .select("id,title,recommendation,score,created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("dead_letter_events")
        .select("id,topic,error_message,resolved,created_at")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    setTasks((taskRes.data ?? []) as TaskItem[]);
    setDecisions((decisionRes.data ?? []) as DecisionItem[]);
    setInsights((insightRes.data ?? []) as InsightItem[]);
    setFailures((failureRes.data ?? []) as DlqItem[]);
    setLoading(false);
  }

  useEffect(() => {
    const openPanel = () => {
      setOpen(true);
      void load();
    };
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openPanel();
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("atlas:open-notifications", openPanel);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("atlas:open-notifications", openPanel);
      window.removeEventListener("keydown", keydown);
    };
  }, []);

  const criticalCount = useMemo(() => {
    const overdue = tasks.filter((task) => task.due_at && new Date(task.due_at).getTime() < Date.now()).length;
    const highPriority = decisions.filter((decision) => ["high", "critical"].includes((decision.priority ?? "").toLowerCase())).length;
    return overdue + highPriority + failures.length;
  }, [decisions, failures.length, tasks]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-[460px] overflow-y-auto border-l border-white/10 bg-[#070b16]/97 shadow-[-30px_0_90px_rgba(0,0,0,.45)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#070b16]/90 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="atlas-eyebrow">Operational awareness</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Central de notificações</h2>
            </div>
            <button className="atlas-icon-button" onClick={() => setOpen(false)} aria-label="Fechar notificações">×</button>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Prioridades operacionais</p>
              <p className="mt-1 text-xs text-slate-500">Atualização em tempo real dos fluxos críticos.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${criticalCount > 0 ? "bg-rose-400/15 text-rose-200" : "bg-emerald-400/15 text-emerald-200"}`}>
              {criticalCount > 0 ? `${criticalCount} críticas` : "Tudo sob controle"}
            </span>
          </div>
        </div>

        <div className="space-y-7 p-5">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Tarefas e prazos</h3>
              <Link href="/tasks" className="text-xs font-semibold text-sky-300">Ver tarefas →</Link>
            </div>
            <div className="space-y-2">
              {loading ? <div className="atlas-skeleton h-20 rounded-2xl" /> : tasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">Nenhuma tarefa pendente.</div>
              ) : tasks.slice(0, 5).map((task) => {
                const overdue = task.due_at && new Date(task.due_at).getTime() < Date.now();
                return (
                  <Link key={task.id} href="/tasks" className="block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-sky-400/20 hover:bg-sky-400/[0.04]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-500">Prioridade {task.priority || "média"}</p>
                      </div>
                      <span className={`text-xs font-semibold ${overdue ? "text-rose-300" : "text-amber-200"}`}>{timeLabel(task.due_at)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Decisões Atlas</h3>
              <Link href="/decision-center" className="text-xs font-semibold text-violet-300">Abrir decisões →</Link>
            </div>
            <div className="space-y-2">
              {loading ? <div className="atlas-skeleton h-20 rounded-2xl" /> : decisions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">Nenhuma decisão aguardando ação.</div>
              ) : decisions.map((decision) => (
                <Link key={decision.id} href="/decision-center" className="block rounded-2xl border border-violet-400/10 bg-violet-400/[0.035] p-4 transition hover:border-violet-300/25">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">{decision.title}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">{decision.status?.replaceAll("_", " ")}</p>
                    </div>
                    <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold text-violet-200">{Math.round(Number(decision.confidence ?? 0) * (Number(decision.confidence ?? 0) <= 1 ? 100 : 1))}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Inteligência recente</h3>
              <Link href="/intelligence" className="text-xs font-semibold text-sky-300">Ver inteligência →</Link>
            </div>
            <div className="space-y-2">
              {loading ? <div className="atlas-skeleton h-20 rounded-2xl" /> : insights.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">Nenhum insight novo.</div>
              ) : insights.slice(0, 3).map((insight) => (
                <article key={insight.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-sm font-medium text-white">{insight.title}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{insight.recommendation || "Revisar o contexto e definir a próxima ação."}</p>
                </article>
              ))}
            </div>
          </section>

          {failures.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-rose-200">Falhas de integração</h3>
                <Link href="/atlas-v3/audit" className="text-xs font-semibold text-rose-300">Abrir auditoria →</Link>
              </div>
              <div className="space-y-2">
                {failures.map((failure) => (
                  <article key={failure.id} className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-4">
                    <p className="text-sm font-medium text-rose-100">{failure.topic}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-rose-200/65">{failure.error_message}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
