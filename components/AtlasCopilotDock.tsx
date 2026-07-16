"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Insight = {
  id: string;
  title: string;
  recommendation: string | null;
  score: number | null;
  confidence: number | null;
};

type Task = {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_at: string | null;
};

type OpenCopilotDetail = {
  prompt?: string;
  context?: Record<string, unknown>;
};

function confidenceLabel(value: number | null) {
  const normalized = Number(value ?? 0);
  const percentage = normalized <= 1 ? normalized * 100 : normalized;
  return `${Math.round(percentage)}%`;
}

export default function AtlasCopilotDock() {
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState("");
  const [externalContext, setExternalContext] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenCopilotDetail>).detail;
      if (detail?.prompt) setPrompt(detail.prompt);
      if (detail?.context) setExternalContext(detail.context);
      setOpen(true);
    };
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener("atlas:open-copilot", handleOpen);
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("atlas:open-copilot", handleOpen);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function load() {
      setLoading(true);
      const [insightResult, taskResult] = await Promise.all([
        supabase
          .from("ai_insights")
          .select("id,title,recommendation,score,confidence")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("tasks")
          .select("id,title,priority,status,due_at")
          .not("status", "in", '("done","concluido","concluída")')
          .order("due_at", { ascending: true })
          .limit(5),
      ]);

      if (!active) return;
      setInsights((insightResult.data ?? []) as Insight[]);
      setTasks((taskResult.data ?? []) as Task[]);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [open]);

  const nextAction = useMemo(() => {
    if (insights[0]) return insights[0].recommendation || insights[0].title;
    if (tasks[0]) return tasks[0].title;
    return "Cadastre novos leads para o Atlas começar a priorizar ações.";
  }, [insights, tasks]);

  async function askCopilot() {
    const question = prompt.trim();
    if (!question) return;

    setCopilotLoading(true);
    setCopilotError("");
    setCopilotAnswer("");

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para usar o Atlas Copilot.");

      const response = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: question,
          context: {
            dashboard: externalContext,
            nextAction,
            insights: insights.map((insight) => ({
              title: insight.title,
              recommendation: insight.recommendation,
              score: insight.score,
              confidence: insight.confidence,
            })),
            tasks: tasks.map((task) => ({
              title: task.title,
              priority: task.priority,
              status: task.status,
              due_at: task.due_at,
            })),
          },
        }),
      });

      const payload = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao consultar o Atlas Copilot.");
      setCopilotAnswer(payload.answer || "Sem resposta do modelo.");
    } catch (error) {
      setCopilotError(error instanceof Error ? error.message : "Falha ao consultar o Atlas Copilot.");
    } finally {
      setCopilotLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 hidden items-center gap-3 rounded-2xl border border-sky-400/20 bg-[#07111f]/90 px-4 py-3 text-left shadow-[0_24px_80px_rgba(2,8,23,.55)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-sky-300/35 lg:flex"
        aria-label="Abrir Atlas Copilot"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400/20 to-violet-500/20 text-sky-300">✦</span>
        <span>
          <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">Atlas Copilot</span>
          <span className="mt-0.5 block max-w-48 truncate text-xs text-slate-400">Próxima melhor ação</span>
        </span>
        <kbd className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500">⌘J</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/70 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-white/[0.08] bg-[#060b16]/98 p-5 shadow-[-24px_0_100px_rgba(2,8,23,.6)]"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Atlas Copilot"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-sky-300">Atlas Intelligence</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-white">Copilot operacional</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">Decisões, riscos e próximas ações reunidos em uma única camada.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="atlas-icon-button" aria-label="Fechar copilot">×</button>
            </div>

            <section className="mt-6 rounded-3xl border border-sky-400/15 bg-gradient-to-br from-sky-500/[.12] to-violet-500/[.08] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">Ação recomendada</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
              </div>
              <p className="mt-4 text-lg font-medium leading-7 text-white">{loading ? "Analisando a operação..." : nextAction}</p>
              <div className="mt-5 flex gap-2">
                <Link href="/decision-center" onClick={() => setOpen(false)} className="atlas-button-primary">Abrir decisão</Link>
                <Link href="/tasks" onClick={() => setOpen(false)} className="atlas-button-secondary">Ver tarefas</Link>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Perguntar ao Atlas Copilot</h3>
                <span className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">AI Gateway</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">Use o contexto seguro do CRM para transformar indicadores em próximos passos, riscos e mensagens operacionais.</p>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={2000}
                rows={4}
                className="mt-4 w-full resize-none rounded-2xl border border-white/[0.08] bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-400/40"
                placeholder="Ex.: o que devo priorizar hoje para converter mais leads?"
              />
              {copilotError ? <p className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-100">{copilotError}</p> : null}
              {copilotAnswer ? <div className="mt-3 rounded-2xl border border-sky-400/15 bg-sky-400/10 px-4 py-3 text-sm leading-6 text-sky-50 whitespace-pre-wrap">{copilotAnswer}</div> : null}
              <button
                type="button"
                onClick={askCopilot}
                disabled={copilotLoading || !prompt.trim()}
                className="atlas-button-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copilotLoading ? "Consultando o Atlas Copilot..." : "Perguntar"}
              </button>
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Insights ativos</h3>
                <Link href="/intelligence" onClick={() => setOpen(false)} className="text-xs font-semibold text-sky-300">Ver todos →</Link>
              </div>
              <div className="mt-3 space-y-3">
                {loading ? [1, 2, 3].map((item) => <div key={item} className="atlas-skeleton h-24 rounded-2xl" />) : insights.length ? insights.map((insight) => (
                  <article key={insight.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{insight.title}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-400">{insight.recommendation || "Revisar contexto e executar a próxima ação sugerida."}</p>
                      </div>
                      <span className="atlas-badge atlas-badge-violet">{confidenceLabel(insight.confidence)}</span>
                    </div>
                  </article>
                )) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">Ainda não existem insights ativos. Eles surgirão conforme o Atlas analisar sua operação.</div>}
              </div>
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Fila de execução</h3>
                <span className="text-xs text-slate-500">{tasks.length} pendentes</span>
              </div>
              <div className="mt-3 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4">
                {tasks.length ? tasks.map((task) => (
                  <Link key={task.id} href="/tasks" onClick={() => setOpen(false)} className="flex items-center gap-3 py-4 transition hover:translate-x-1">
                    <span className={`h-2.5 w-2.5 rounded-full ${task.priority === "high" ? "bg-rose-400" : task.priority === "medium" ? "bg-amber-400" : "bg-sky-400"}`} />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{task.title}</span>
                    <span className="text-xs text-slate-600">→</span>
                  </Link>
                )) : <p className="py-5 text-sm text-slate-500">Nenhuma tarefa pendente.</p>}
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </>
  );
}
