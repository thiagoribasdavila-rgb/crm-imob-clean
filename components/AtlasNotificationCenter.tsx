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

type BrokerLineRequest = {
  id: string;
  brokerProfileId: string | null;
  brokerName: string;
  displayPhone: string | null;
  phoneNumberIdMasked: string;
  requestedAt: string | null;
};

type HealthTask = Record<string, unknown> & { id?: string; title?: string; priority?: string | null; status?: string | null; due_at?: string | null };
type HealthInsight = Record<string, unknown> & { id?: string; title?: string; content?: string | null; count?: number | null };

function timeLabel(value: string | null | undefined, now: number) {
  if (!value) return "Sem prazo";
  const diff = new Date(value).getTime() - now;
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
  const [brokerLineRequests, setBrokerLineRequests] = useState<BrokerLineRequest[]>([]);
  const [referenceTime, setReferenceTime] = useState(0);

  async function load() {
    setLoading(true);
    setReferenceTime(Date.now());
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setTasks([]);
      setDecisions([]);
      setInsights([]);
      setFailures([]);
      setBrokerLineRequests([]);
      setLoading(false);
      return;
    }

    const [healthResult, decisionResult, failureResult, brokerLineResult] = await Promise.allSettled([
      fetch("/api/v1/core-v2/module-health", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      supabase
        .from("atlas_decisions")
        .select("id,title,priority,status,confidence,created_at")
        .in("status", ["proposed", "pending_approval", "approved"])
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("dead_letter_events")
        .select("id,topic,error_message,resolved,created_at")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(5),
      fetch("/api/v1/integrations/whatsapp/pending-lines", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    ]);

    if (healthResult.status === "fulfilled" && healthResult.value.ok) {
      const payload = await healthResult.value.json().catch(() => null);
      const snapshot = payload?.data?.snapshot ?? {};
      setTasks(((snapshot.tasks ?? []) as HealthTask[]).map((task) => ({
        id: String(task.id ?? crypto.randomUUID()),
        title: String(task.title ?? "Tarefa sem título"),
        priority: task.priority ?? null,
        status: task.status ?? null,
        due_at: typeof task.due_at === "string" ? task.due_at : null,
      })).slice(0, 8));
      setInsights(((snapshot.insights ?? []) as HealthInsight[]).map((insight) => ({
        id: String(insight.id ?? crypto.randomUUID()),
        title: String(insight.title ?? "Insight Atlas"),
        recommendation: insight.content ?? "Revisar o contexto e definir a próxima ação.",
        score: Number(insight.count ?? 0),
        created_at: new Date().toISOString(),
      })).slice(0, 5));
    } else {
      setTasks([]);
      setInsights([]);
    }

    const decisionRes = decisionResult.status === "fulfilled" ? decisionResult.value : null;
    const failureRes = failureResult.status === "fulfilled" ? failureResult.value : null;
    setDecisions((decisionRes?.data ?? []) as DecisionItem[]);
    setFailures((failureRes?.data ?? []) as DlqItem[]);
    if (brokerLineResult.status === "fulfilled" && brokerLineResult.value.ok) {
      const payload = await brokerLineResult.value.json().catch(() => null);
      setBrokerLineRequests((payload?.data?.requests ?? []) as BrokerLineRequest[]);
    } else {
      // Corretores e gerentes não recebem esse aviso de diretoria.
      setBrokerLineRequests([]);
    }
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
    const overdue = tasks.filter((task) => task.due_at && new Date(task.due_at).getTime() < referenceTime).length;
    const highPriority = decisions.filter((decision) => ["high", "critical"].includes((decision.priority ?? "").toLowerCase())).length;
    return overdue + highPriority + failures.length + brokerLineRequests.length;
  }, [brokerLineRequests.length, decisions, failures.length, referenceTime, tasks]);

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
          {brokerLineRequests.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-100">Aprovações da diretoria</h3>
                <Link href="/integrations/whatsapp" className="text-xs font-semibold text-amber-300">Revisar linhas →</Link>
              </div>
              <div className="space-y-2">
                {brokerLineRequests.map((request) => (
                  <Link key={request.id} href="/integrations/whatsapp" className="block rounded-2xl border border-amber-300/15 bg-amber-300/[0.055] p-4 transition hover:border-amber-200/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-amber-50">Linha oficial solicitada por {request.brokerName}</p>
                        <p className="mt-1 text-xs leading-5 text-amber-100/65">{request.displayPhone || request.phoneNumberIdMasked} · aguarda sua validação na Meta Business.</p>
                      </div>
                      <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">PENDENTE</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Tarefas e prazos</h3>
              <Link href="/tasks" className="text-xs font-semibold text-sky-300">Ver tarefas →</Link>
            </div>
            <div className="space-y-2">
              {loading ? <div className="atlas-skeleton h-20 rounded-2xl" /> : tasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">Nenhuma tarefa pendente.</div>
              ) : tasks.slice(0, 5).map((task) => {
                const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < referenceTime);
                return (
                  <Link key={task.id} href="/tasks" className="block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-sky-400/20 hover:bg-sky-400/[0.04]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-500">Prioridade {task.priority || "média"}</p>
                      </div>
                      <span className={`text-xs font-semibold ${overdue ? "text-rose-300" : "text-amber-200"}`}>{timeLabel(task.due_at, referenceTime)}</span>
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
                    <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold text-violet-200">{decision.confidence === null ? "REVISAR" : `${Math.round(Number(decision.confidence) * (Number(decision.confidence) <= 1 ? 100 : 1))}%`}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Inteligência recente</h3>
              <Link href="/ai-dashboard" className="text-xs font-semibold text-sky-300">Ver inteligência →</Link>
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
                <h3 className="text-sm font-semibold text-rose-200">Fila de integração</h3>
                <Link href="/integrations/health" className="text-xs font-semibold text-rose-300">Tratar falhas →</Link>
              </div>
              <div className="space-y-2">
                {failures.map((failure) => (
                  <article key={failure.id} className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-4">
                    <p className="text-sm font-medium text-rose-100">{failure.topic}</p>
                    <p className="mt-2 text-xs leading-5 text-rose-200/65">Falha terminal após tentativas automáticas. Abra a fila para diagnóstico sanitizado e ação segura.</p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-rose-300/70">Revisão da diretoria</p>
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
