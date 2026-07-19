"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AtlasBadge,
  AtlasEmpty,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
import {
  AtlasCard,
  AtlasCardHeader,
  AtlasMetric,
} from "@/components/ui/AtlasCard";

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  lead_id: string | null;
  assigned_to: string | null;
  recurrence_id?: string | null;
  assigneeName: string;
  mine: boolean;
  overdue: boolean;
  today: boolean;
  priorityScore: number;
  lead?: { id: string; name: string | null; purpose: string | null } | null;
};

type Center = {
  scope: { role: string; actorId: string };
  summary: {
    open: number;
    completed: number;
    overdue: number;
    today: number;
    high: number;
    withoutDueDate: number;
    unassigned: number;
    mine: number;
  };
  tasks: Task[];
  byOwner: Array<{
    id: string;
    name: string;
    open: number;
    overdue: number;
    today: number;
    high: number;
  }>;
  creationOptions: {
    leads: Array<{
      id: string;
      name: string | null;
      assigned_to: string | null;
      status: string | null;
    }>;
    assignees: Array<{ id: string; full_name: string | null }>;
    defaults: { assigneeId: string; priority: string };
  };
};

type DailyAssistant = {
  summary: { steps: number; now: number; today: number; planned: number };
  sequence: Array<{
    id: string;
    position: number;
    kind: "task" | "lead" | "visit";
    title: string;
    reason: string;
    action: string;
    href: string;
    dueAt: string | null;
    urgency: "now" | "today" | "planned";
  }>;
  method: {
    llmCost: number;
    explainable: boolean;
    humanDecisionRequired: boolean;
  };
};

const TASK_VIEWS = [
  ["priority", "Prioridade"],
  ["overdue", "Vencidas"],
  ["today", "Hoje"],
  ["mine", "Minha fila"],
  ["team", "Equipe visível"],
  ["no_due", "Sem prazo"],
] as const;

type View = (typeof TASK_VIEWS)[number][0];

const EMPTY_FORM = {
  title: "",
  description: "",
  dueAt: "",
  priority: "media",
  leadId: "",
  assigneeId: "",
  cadence: "",
  endsAt: "",
  maxOccurrences: 10,
};

const KIND_LABEL = {
  task: "Tarefa",
  lead: "Lead",
  visit: "Visita",
} as const;

function dateLabel(value: string | null) {
  if (!value) return "Sem prazo";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Prazo indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function urgencyLabel(task: Task) {
  if (task.overdue) return "Atrasada";
  if (task.today) return "Hoje";
  if (!task.due_at) return "Sem prazo";
  return "Planejada";
}

export default function TasksPage() {
  const [data, setData] = useState<Center | null>(null);
  const [assistant, setAssistant] = useState<DailyAssistant | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("priority");
  const [form, setForm] = useState(EMPTY_FORM);

  const sessionToken = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token || "";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${await sessionToken()}` };
      const [response, daily] = await Promise.all([
        fetch("/api/v1/tasks", { headers, cache: "no-store" }),
        fetch("/api/v1/productivity/daily", { headers, cache: "no-store" }),
      ]);
      const body = await response.json();
      const dailyBody = await daily.json();
      if (!response.ok) throw new Error(body.error?.message || body.error);
      setData(body.data || body);
      setAssistant(daily.ok ? dailyBody.data || dailyBody : null);
    } catch {
      setError("Não foi possível carregar sua operação diária.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    task: Task,
    action: "complete" | "postpone_one_day" | "cancel_recurrence",
  ) {
    setSavingId(task.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await sessionToken()}`,
        },
        body: JSON.stringify({ id: task.id, action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || body.error);
      setMessage(
        action === "complete"
          ? "Tarefa concluída. O histórico foi preservado."
          : action === "cancel_recurrence"
            ? "Repetição encerrada. As tarefas já criadas foram preservadas."
            : "Tarefa reagendada por um dia.",
      );
      await load();
    } catch {
      setError(
        action === "complete"
          ? "Não foi possível concluir a tarefa."
          : action === "cancel_recurrence"
            ? "Não foi possível encerrar a repetição."
            : "Não foi possível reagendar a tarefa.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function createTask() {
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/tasks", {
        method:"POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await sessionToken()}`,
        },
        body: JSON.stringify({
          ...form,
          dueAt: new Date(form.dueAt).toISOString(),
          endsAt: form.endsAt
            ? new Date(`${form.endsAt}T23:59:59`).toISOString()
            : null,
          assigneeId:
            form.assigneeId || data?.creationOptions.defaults.assigneeId,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || body.error);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setMessage(
        form.cadence
          ? "Tarefa recorrente criada com término e limite definidos."
          : "Tarefa criada e adicionada à fila.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a tarefa.",
      );
    } finally {
      setCreating(false);
    }
  }

  const visible = useMemo(
    () =>
      data?.tasks.filter((task) =>
        view === "overdue"
          ? task.overdue
          : view === "today"
            ? task.today
            : view === "mine"
              ? task.mine
              : view === "team"
                ? !task.mine
                : view === "no_due"
                  ? !task.due_at
                  : true,
      ) ?? [],
    [data, view],
  );

  const viewCounts = useMemo(
    () => ({
      priority: data?.summary.open ?? 0,
      overdue: data?.summary.overdue ?? 0,
      today: data?.summary.today ?? 0,
      mine: data?.summary.mine ?? 0,
      team: data?.tasks.filter((task) => !task.mine).length ?? 0,
      no_due: data?.summary.withoutDueDate ?? 0,
    }),
    [data],
  );

  const leadership = Boolean(
    data &&
      ["admin", "director", "superintendent", "manager"].includes(
        data.scope.role,
      ),
  );
  const primarySteps = assistant?.sequence.slice(0, 3) ?? [];
  const remainingSteps = assistant?.sequence.slice(3) ?? [];

  return (
    <div
      className="space-y-5 pb-8"
      data-phase="38-task-execution-workspace"
      data-task-layout="execution-first"
    >
      <section className="atlas-task-hero" aria-labelledby="atlas-task-title">
        <div className="atlas-task-hero-copy">
          <AtlasBadge tone="violet">FASE 38 · EXECUÇÃO DIÁRIA</AtlasBadge>
          <h1 id="atlas-task-title">O que precisa ser feito agora</h1>
          <p>
            Priorize atrasos, cumpra os combinados de hoje e mantenha o próximo
            passo de cada lead visível.
          </p>
          <div className="atlas-task-hero-actions">
            <button
              type="button"
              onClick={() => setShowCreate((current) => !current)}
              className="atlas-button-primary"
              aria-expanded={showCreate}
              aria-controls="atlas-task-create"
            >
              {showCreate ? "Fechar criação" : "Nova tarefa"}
            </button>
            <Link href="/calendar" className="atlas-button-secondary">
              Abrir agenda
            </Link>
          </div>
        </div>

        <div
          className="atlas-task-signal-grid"
          aria-label="Resumo da execução diária"
          aria-busy={loading}
        >
          <div className="atlas-task-signal" data-tone="danger">
            <span>Vencidas</span>
            <strong>{loading ? "—" : data?.summary.overdue ?? 0}</strong>
            <small>Resolver primeiro</small>
          </div>
          <div className="atlas-task-signal" data-tone="warning">
            <span>Hoje</span>
            <strong>{loading ? "—" : data?.summary.today ?? 0}</strong>
            <small>Compromissos do dia</small>
          </div>
          <div className="atlas-task-signal" data-tone="success">
            <span>Minha fila</span>
            <strong>{loading ? "—" : data?.summary.mine ?? 0}</strong>
            <small>Sob sua responsabilidade</small>
          </div>
          <div className="atlas-task-signal" data-tone="neutral">
            <span>Sem prazo</span>
            <strong>
              {loading ? "—" : data?.summary.withoutDueDate ?? 0}
            </strong>
            <small>Planejar antes de executar</small>
          </div>
        </div>
      </section>

      {error ? (
        <AtlasRecoverableError
          description={error}
          onRetry={() => void load()}
          busy={loading}
        />
      ) : null}
      {message ? (
        <div
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      ) : null}

      {showCreate ? (
        <div id="atlas-task-create" data-phase="42-task-quick-create">
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="FASE 43 · TAREFAS RECORRENTES"
              title="Criar em poucos segundos"
              description="Título, prazo e prioridade vêm primeiro. Vínculo, responsável e repetição ficam disponíveis quando necessários."
            />
            <form
              className="border-t border-white/[.06] p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void createTask();
              }}
            >
            <div className="grid gap-4 sm:grid-cols-2">
              <label
                className="text-xs text-slate-400 sm:col-span-2"
                htmlFor="task-title"
              >
                Título
                <input
                  id="task-title"
                  value={form.title}
                  maxLength={120}
                  required
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                  placeholder="Ex.: Confirmar visita ao empreendimento"
                />
              </label>
              <label className="text-xs text-slate-400" htmlFor="task-due-at">
                Prazo
                <input
                  id="task-due-at"
                  type="datetime-local"
                  value={form.dueAt}
                  required
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dueAt: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                />
              </label>
              <label
                className="text-xs text-slate-400"
                htmlFor="task-priority"
              >
                Prioridade
                <select
                  id="task-priority"
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              </label>
            </div>

            <details className="atlas-task-form-more">
              <summary>Adicionar vínculo, descrição ou repetição</summary>
              <div className="grid gap-4 pt-4 sm:grid-cols-2">
                <label
                  className="text-xs text-slate-400 sm:col-span-2"
                  htmlFor="task-description"
                >
                  Descrição opcional
                  <textarea
                    id="task-description"
                    value={form.description}
                    maxLength={2000}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                  />
                </label>
                <label
                  className="text-xs text-slate-400"
                  htmlFor="task-lead"
                >
                  Lead opcional
                  <select
                    id="task-lead"
                    value={form.leadId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        leadId: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="">Sem lead vinculada</option>
                    {data?.creationOptions.leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.name || "Lead sem nome"}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="text-xs text-slate-400"
                  htmlFor="task-assignee"
                >
                  Responsável
                  <select
                    id="task-assignee"
                    disabled={Boolean(form.leadId)}
                    value={
                      form.assigneeId ||
                      data?.creationOptions.defaults.assigneeId ||
                      ""
                    }
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        assigneeId: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white disabled:opacity-50"
                  >
                    {data?.creationOptions.assignees.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name || "Profissional sem nome"}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[10px] text-slate-600">
                    {form.leadId
                      ? "Definido pelo corretor único da lead."
                      : "Somente profissionais visíveis no seu escopo."}
                  </span>
                </label>
                <label
                  className="text-xs text-slate-400"
                  htmlFor="task-cadence"
                >
                  Repetir tarefa
                  <select
                    id="task-cadence"
                    value={form.cadence}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cadence: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="">Não repetir</option>
                    <option value="daily">Todos os dias</option>
                    <option value="weekly">Toda semana</option>
                    <option value="monthly">Todo mês</option>
                  </select>
                </label>
                {form.cadence ? (
                  <>
                    <label
                      className="text-xs text-slate-400"
                      htmlFor="task-ends-at"
                    >
                      Encerrar em
                      <input
                        id="task-ends-at"
                        type="date"
                        value={form.endsAt}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            endsAt: event.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                      />
                    </label>
                    <label
                      className="text-xs text-slate-400"
                      htmlFor="task-max-occurrences"
                    >
                      Máximo de ocorrências
                      <input
                        id="task-max-occurrences"
                        type="number"
                        min={2}
                        max={100}
                        value={form.maxOccurrences}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxOccurrences: Number(event.target.value),
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                      />
                    </label>
                    <p className="self-end rounded-xl border border-violet-400/15 bg-violet-400/[.05] p-3 text-[10px] leading-4 text-slate-500">
                      A recorrência encerra na primeira condição atingida: data
                      final ou limite.
                    </p>
                  </>
                ) : null}
              </div>
            </details>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={
                  creating ||
                  form.title.trim().length < 3 ||
                  !form.dueAt ||
                  Boolean(
                    form.cadence &&
                      (!form.endsAt ||
                        form.maxOccurrences < 2 ||
                        form.maxOccurrences > 100),
                  )
                }
                className="atlas-button-primary disabled:opacity-50"
              >
                {creating
                  ? "Criando..."
                  : form.cadence
                    ? "Criar recorrência"
                    : "Criar tarefa"}
              </button>
            </div>
            </form>
          </AtlasCard>
        </div>
      ) : null}

      <div data-phase="48-daily-productivity">
        <AtlasCard className="atlas-task-focus border-cyan-400/15">
          <AtlasCardHeader
            eyebrow="Assistente diário"
            title="Comece por aqui"
            description="As três primeiras ações do recorte pessoal, ordenadas por SLA e impacto. Você decide e executa cada passo."
            action={<AtlasBadge tone="success">CUSTO IA ZERO</AtlasBadge>}
          />
          <div
            className="atlas-task-focus-list"
            aria-live="polite"
            aria-busy={loading}
          >
            {loading ? (
              [1, 2, 3].map((item) => (
                <AtlasSkeleton key={item} className="h-28" />
              ))
            ) : primarySteps.length ? (
              primarySteps.map((step) => (
                <Link
                  key={`${step.kind}-${step.id}`}
                  href={step.href}
                  className="atlas-task-focus-item"
                  data-urgency={step.urgency}
                >
                  <span className="atlas-task-focus-position">
                    {step.position}
                  </span>
                  <span className="atlas-task-focus-copy">
                    <small>{KIND_LABEL[step.kind]}</small>
                    <strong>{step.title}</strong>
                    <span>{step.reason}</span>
                  </span>
                  <span className="atlas-task-focus-action">
                    {step.action} <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ))
            ) : (
              <AtlasEmpty
                reason="completed"
                eyebrow="Prioridades concluídas"
                title="Dia sob controle"
                description="Nenhuma prioridade pessoal exige ação neste momento."
                action={
                  <Link href="/calendar" className="atlas-button-secondary">
                    Revisar agenda
                  </Link>
                }
              />
            )}
          </div>
          {remainingSteps.length ? (
            <details className="atlas-task-more-steps">
              <summary>
                Ver outras {remainingSteps.length} ações planejadas
              </summary>
              <div className="atlas-task-more-steps-list">
                {remainingSteps.map((step) => (
                  <Link key={`${step.kind}-${step.id}`} href={step.href}>
                    <span>{step.position}</span>
                    <strong>{step.title}</strong>
                    <small>{step.action}</small>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
          <div className="border-t border-white/[.06] px-5 py-3 text-[10px] leading-4 text-slate-500">
            Ordem explicável por primeiro contato, follow-up, prazo, visita,
            prioridade, temperatura e score. Sem ranking de pessoas e sem execução automática.
          </div>
        </AtlasCard>
      </div>

      <details className="atlas-task-summary-details">
        <summary>Ver indicadores completos da rotina</summary>
        <section className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <AtlasMetric
            label="Pendentes"
            value={loading ? "—" : data?.summary.open ?? 0}
            detail="Ações visíveis"
            trend="LIVE"
            tone="blue"
          />
          <AtlasMetric
            label="Concluídas"
            value={loading ? "—" : data?.summary.completed ?? 0}
            detail="Histórico preservado"
            trend="FEITAS"
            tone="green"
          />
          <AtlasMetric
            label="Alta prioridade"
            value={loading ? "—" : data?.summary.high ?? 0}
            detail="Maior impacto"
            trend="FOCO"
            tone="violet"
          />
          <AtlasMetric
            label="Sem responsável"
            value={loading ? "—" : data?.summary.unassigned ?? 0}
            detail="Exigem revisão humana"
            trend="REVISAR"
            tone="amber"
          />
        </section>
      </details>

      {data?.tasks.some((task) => task.recurrence_id) ? (
        <details className="atlas-task-summary-details">
          <summary>Gerenciar recorrências ativas</summary>
          <AtlasCard className="mt-4">
            <AtlasCardHeader
              eyebrow="Recorrências ativas"
              title="Controle explícito"
              description="Encerre novas ocorrências sem apagar tarefas já criadas."
            />
            <div className="flex flex-wrap gap-2 p-5">
              {data.tasks
                .filter((task) => task.recurrence_id)
                .filter(
                  (task, index, all) =>
                    all.findIndex(
                      (item) => item.recurrence_id === task.recurrence_id,
                    ) === index,
                )
                .map((task) => (
                  <button
                    type="button"
                    key={task.recurrence_id}
                    disabled={savingId === task.id}
                    onClick={() => void act(task,"cancel_recurrence")}
                    className="atlas-button-secondary"
                  >
                    Encerrar repetição · {task.title}
                  </button>
                ))}
            </div>
          </AtlasCard>
        </details>
      ) : null}

      <div
        className={`grid gap-5 ${leadership ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}
      >
        <AtlasCard className="atlas-task-queue-card">
          <AtlasCardHeader
            eyebrow="Execução diária"
            title="Fila comercial priorizada"
            description="Atraso, prazo e prioridade formam uma ordem explicável. A API reconfirma cada alteração no seu escopo."
            action={
              <button
                type="button"
                onClick={() => void load()}
                className="atlas-button-secondary"
                disabled={loading}
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
            }
          />
          <div
            className="atlas-task-filters"
            role="tablist"
            aria-label="Filtrar tarefas"
          >
            {TASK_VIEWS.map(([key, label]) => (
              <button
                key={key}
                id={`task-view-${key}-tab`}
                type="button"
                role="tab"
                aria-selected={view === key}
                aria-controls="task-view-panel"
                onClick={() => setView(key)}
                className={`atlas-kanban-toggle atlas-task-filter ${view === key ? "is-active" : ""}`}
              >
                <span>{label}</span>
                <strong>{viewCounts[key]}</strong>
              </button>
            ))}
          </div>
          <div
            id="task-view-panel"
            className="atlas-task-queue"
            role="tabpanel"
            aria-labelledby={`task-view-${view}-tab`}
            tabIndex={0}
            aria-live="polite"
            aria-busy={loading}
          >
            {loading ? (
              [1, 2, 3, 4].map((item) => (
                <AtlasSkeleton key={item} className="h-32" />
              ))
            ) : visible.length ? (
              visible.map((task) => {
                const busy = savingId === task.id;
                return (
                  <article
                    key={task.id}
                    className={`atlas-task-item ${task.overdue ? "is-overdue" : ""}`}
                    aria-busy={busy}
                  >
                    <div className="atlas-task-item-main">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className="atlas-task-status-dot"
                          data-overdue={task.overdue}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2>{task.title}</h2>
                            <AtlasBadge
                              tone={
                                task.overdue
                                  ? "danger"
                                  : ["alta", "high", "critical"].includes(
                                        task.priority,
                                      )
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {task.overdue
                                ? "VENCIDA"
                                : task.priority || "NORMAL"}
                            </AtlasBadge>
                          </div>
                          <p className="atlas-task-lead-context">
                            {task.lead?.name || "Sem lead vinculada"}
                            {task.lead?.purpose
                              ? ` · ${task.lead.purpose}`
                              : ""}
                          </p>
                          <p className="atlas-task-description">
                            {task.description ||
                              "Execute a ação e registre o resultado na timeline da lead."}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="atlas-task-item-meta">
                      <span data-overdue={task.overdue}>
                        {urgencyLabel(task)}
                      </span>
                      <strong>{dateLabel(task.due_at)}</strong>
                      <small>{task.assigneeName}</small>
                    </div>
                    <div className="atlas-task-item-actions">
                      {task.lead_id ? (
                        <Link
                          href={`/leads/${task.lead_id}`}
                          className="atlas-button-secondary"
                        >
                          Abrir lead
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(task,"postpone_one_day")}
                        className="atlas-button-secondary disabled:opacity-50"
                      >
                        {busy ? "Salvando..." : "Reagendar +1 dia"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(task,"complete")}
                        className="atlas-button-primary disabled:opacity-50"
                      >
                        {busy ? "Salvando..." : "Concluir tarefa"}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <AtlasEmpty
                reason={data?.tasks.length ? "no-results" : "completed"}
                eyebrow={
                  data?.tasks.length
                    ? "Filtro sem pendências"
                    : "Rotina concluída"
                }
                title="Fila em dia"
                description={
                  data?.tasks.length
                    ? "Nenhuma tarefa corresponde a este filtro. Volte às prioridades para revisar a fila completa."
                    : "Nenhuma tarefa aberta exige ação neste momento."
                }
                action={
                  data?.tasks.length ? (
                    <button
                      type="button"
                      className="atlas-button-secondary"
                      onClick={() => setView("priority")}
                    >
                      Ver prioridades
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="atlas-button-primary"
                      onClick={() => setShowCreate(true)}
                    >
                      Nova tarefa
                    </button>
                  )
                }
              />
            )}
          </div>
        </AtlasCard>

        {leadership ? (
          <AtlasCard className="h-fit">
            <AtlasCardHeader
              eyebrow="Equipe visível"
              title="Carga por responsável"
              description="Consolidado operacional para coordenar apoio, não ranking de pessoas."
            />
            <div className="space-y-2 p-5">
              {data?.byOwner.map((owner) => (
                <div
                  key={owner.id}
                  className="rounded-xl border border-white/[.06] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs text-white">{owner.name}</strong>
                    <span
                      className={
                        owner.overdue
                          ? "text-xs font-bold text-rose-200"
                          : "text-xs font-bold text-emerald-200"
                      }
                    >
                      {owner.overdue} vencidas
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {owner.open} abertas · {owner.today} hoje · {owner.high}{" "}
                    prioritárias
                  </p>
                </div>
              ))}
              {!data?.byOwner.length ? (
                <AtlasEmpty
                  reason="completed"
                  eyebrow="Equipe sem pendências"
                  title="Sem tarefas visíveis"
                  description="A equipe ainda não possui ações abertas."
                />
              ) : null}
              <p className="pt-2 text-[10px] leading-4 text-slate-600">
                A central não atribui tarefas automaticamente e não usa volume
                isolado para avaliar desempenho.
              </p>
            </div>
          </AtlasCard>
        ) : null}
      </div>
    </div>
  );
}
