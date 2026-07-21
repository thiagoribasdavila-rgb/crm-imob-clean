"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { supabase } from "@/lib/supabase";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

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

const HIGH_PRIORITY = new Set(["alta", "high", "critical"]);

// Semânticos CC-6: rose para vencido, amber para hoje; futuro fica neutro.
const SEV_INK = { crit: "#fb7185", warn: "#f5b544" } as const;
const STEP_SEV = { now: "crit", today: "warn", planned: null } as const;

const FIELD_CLASS =
  "mt-2 w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3 py-2.5 text-sm text-[#e8eef8] outline-none transition-colors focus:border-[color:var(--atlas-accent)] disabled:opacity-50";
const LABEL_CLASS = "text-xs text-[#6b7890]";

function dateLabel(value: string | null) {
  if (!value) return "Sem prazo";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Prazo indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

// Uma referência temporal por linha: relativa no texto, absoluta no title.
function relativeDue(value: string | null, nowMs: number) {
  if (!value) return "sem prazo";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "sem prazo";
  const diff = time - nowMs;
  const abs = Math.abs(diff);
  if (abs < 60_000) return "agora";
  const span =
    abs < 3_600_000
      ? `${Math.max(1, Math.round(abs / 60_000))}min`
      : abs < 86_400_000
        ? `${Math.round(abs / 3_600_000)}h`
        : `${Math.round(abs / 86_400_000)}d`;
  return diff < 0 ? `há ${span}` : `em ${span}`;
}

function taskSeverity(task: Task): "crit" | "warn" | null {
  if (task.overdue) return "crit";
  if (task.today) return "warn";
  return null;
}

function sevTextClass(sev: "crit" | "warn" | null) {
  return sev === "crit" ? "cc6-crit" : sev === "warn" ? "cc6-warn" : "";
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
  const [nowMs, setNowMs] = useState(0);

  // Relógio de 1min: mantém "há 2d"/"em 3h" frescos sem tocar nos fetches.
  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
        method: "POST",
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

  // Uma tarefa-semente por recorrência ativa (mesma dedupe da versão anterior).
  const recurrenceSeeds = useMemo(() => {
    const seen = new Set<string>();
    return (data?.tasks ?? []).filter((task) => {
      if (!task.recurrence_id || seen.has(task.recurrence_id)) return false;
      seen.add(task.recurrence_id);
      return true;
    });
  }, [data]);

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
      className="space-y-4 pb-8"
      data-phase="38-task-execution-workspace"
      data-task-layout="execution-first"
    >
      <PageHeader
        eyebrow="Central de tarefas · Execução diária"
        title="O que precisa ser feito agora"
        description="Vencidas em rosa, combinados de hoje em âmbar — decida e execute na ordem."
        action={{
          href: "/calendar",
          label: "Abrir agenda",
          priority: "secondary",
        }}
      />

      {error ? (
        <AtlasRecoverableError
          description={error}
          onRetry={() => void load()}
          busy={loading}
        />
      ) : null}
      {message ? (
        <div
          className="cc6-panel-quiet cc6-ok px-4 py-3 text-sm"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      ) : null}

      <section data-phase="48-daily-productivity" aria-labelledby="atlas-daily-focus">
        <TiltShell className="cc6-panel cc6-reveal overflow-hidden" delayMs={40}>
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-1">
            <div>
              <p className="cc6-eyebrow">Assistente diário</p>
              <h2
                id="atlas-daily-focus"
                className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
              >
                Comece por aqui
              </h2>
            </div>
            <StatusBadge tone="success">Custo IA zero</StatusBadge>
          </header>
          <div
            className="mt-2 flex flex-col"
            aria-live="polite"
            aria-busy={loading}
          >
            {loading ? (
              <div className="space-y-2 px-5 pb-5">
                {[1, 2, 3].map((item) => (
                  <AtlasSkeleton key={item} className="h-14" />
                ))}
              </div>
            ) : primarySteps.length ? (
              primarySteps.map((step, index) => {
                const sev = STEP_SEV[step.urgency];
                return (
                  <Link
                    key={`${step.kind}-${step.id}`}
                    href={step.href}
                    className={`cc6-reveal group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[rgba(75,141,248,0.05)] ${index ? "cc6-hairline" : ""} ${sev ? "cc6-sev-band" : ""}`}
                    style={
                      {
                        animationDelay: `${100 + index * 60}ms`,
                        ...(sev ? { "--cc6-sev": SEV_INK[sev] } : {}),
                      } as CSSProperties
                    }
                    data-urgency={step.urgency}
                  >
                    <span
                      className="cc6-metric-value w-6 shrink-0 text-center text-xl"
                      aria-hidden="true"
                    >
                      {step.position}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <strong className="max-w-full truncate text-sm font-medium text-[#e8eef8]">
                          {step.title}
                        </strong>
                        <span className="cc6-eyebrow text-[10px]!">
                          {KIND_LABEL[step.kind]}
                        </span>
                        {step.dueAt ? (
                          <span
                            className={`cc6-num text-[11px] ${sevTextClass(sev) || "text-[#6b7890]"}`}
                            title={dateLabel(step.dueAt)}
                          >
                            {relativeDue(step.dueAt, nowMs)}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#6b7890]">
                        {step.reason}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-[#aab6ca] transition-colors group-hover:text-[color:var(--atlas-accent)]">
                      {step.action} <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className="px-5 pb-5 pt-1">
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
              </div>
            )}
          </div>
          {remainingSteps.length ? (
            <details className="cc6-hairline px-5 py-3">
              <summary className="cc6-eyebrow cursor-pointer list-none text-[10px]! transition-colors hover:text-[#aab6ca]">
                +{remainingSteps.length} planejadas
              </summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {remainingSteps.map((step) => (
                  <Link
                    key={`${step.kind}-${step.id}`}
                    href={step.href}
                    className="flex items-baseline gap-2 text-xs text-[#aab6ca] transition-colors hover:text-[#e8eef8]"
                  >
                    <span className="cc6-num text-[#6b7890]">
                      {step.position}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{step.title}</span>
                    <span className="shrink-0 text-[#6b7890]">
                      {step.action}
                    </span>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
          <p className="cc6-hairline px-5 py-2.5 text-[10px] leading-4 text-[#6b7890]">
            Ordem explicável por contato, follow-up, prazo, visita, prioridade,
            temperatura e score · sem ranking de pessoas · sem execução
            automática.
          </p>
        </TiltShell>
      </section>

      {showCreate ? (
        <div id="atlas-task-create" data-phase="42-task-quick-create">
          <section
            className="cc6-panel cc6-reveal overflow-hidden"
            aria-labelledby="atlas-task-create-title"
          >
            <header className="px-5 pt-5">
              <p className="cc6-eyebrow">Nova tarefa · Recorrência opcional</p>
              <h2
                id="atlas-task-create-title"
                className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
              >
                Criar em poucos segundos
              </h2>
            </header>
            <form
              className="cc6-hairline mt-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                void createTask();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  className={`${LABEL_CLASS} sm:col-span-2`}
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
                    className={FIELD_CLASS}
                    placeholder="Ex.: Confirmar visita ao empreendimento"
                  />
                </label>
                <label className={LABEL_CLASS} htmlFor="task-due-at">
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
                    className={FIELD_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS} htmlFor="task-priority">
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
                    className={FIELD_CLASS}
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </label>
              </div>

              <details className="mt-4">
                <summary className="cc6-eyebrow cursor-pointer list-none text-[10px]! transition-colors hover:text-[#aab6ca]">
                  Adicionar vínculo, descrição ou repetição
                </summary>
                <div className="grid gap-4 pt-4 sm:grid-cols-2">
                  <label
                    className={`${LABEL_CLASS} sm:col-span-2`}
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
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className={LABEL_CLASS} htmlFor="task-lead">
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
                      className={FIELD_CLASS}
                    >
                      <option value="">Sem lead vinculada</option>
                      {data?.creationOptions.leads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name || "Lead sem nome"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={LABEL_CLASS} htmlFor="task-assignee">
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
                      className={FIELD_CLASS}
                    >
                      {data?.creationOptions.assignees.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.full_name || "Profissional sem nome"}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[10px] text-[#6b7890]">
                      {form.leadId
                        ? "Definido pelo corretor único da lead."
                        : "Somente profissionais visíveis no seu escopo."}
                    </span>
                  </label>
                  <label className={LABEL_CLASS} htmlFor="task-cadence">
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
                      className={FIELD_CLASS}
                    >
                      <option value="">Não repetir</option>
                      <option value="daily">Todos os dias</option>
                      <option value="weekly">Toda semana</option>
                      <option value="monthly">Todo mês</option>
                    </select>
                  </label>
                  {form.cadence ? (
                    <>
                      <label className={LABEL_CLASS} htmlFor="task-ends-at">
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
                          className={FIELD_CLASS}
                        />
                      </label>
                      <label
                        className={LABEL_CLASS}
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
                          className={FIELD_CLASS}
                        />
                      </label>
                      <p className="cc6-panel-quiet self-end p-3 text-[10px] leading-4 text-[#6b7890]">
                        A recorrência encerra na primeira condição atingida:
                        data final ou limite.
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
          </section>
        </div>
      ) : null}

      {recurrenceSeeds.length ? (
        <details
          className="cc6-panel-quiet cc6-reveal px-4 py-3"
          style={{ animationDelay: "140ms" }}
        >
          <summary className="cc6-eyebrow cursor-pointer list-none text-[10px]! transition-colors hover:text-[#aab6ca]">
            Recorrências ativas · {recurrenceSeeds.length}
          </summary>
          <p className="mt-2 text-[10px] leading-4 text-[#6b7890]">
            Encerrar preserva as tarefas já criadas.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recurrenceSeeds.map((task) => (
              <button
                type="button"
                key={task.recurrence_id}
                disabled={savingId === task.id}
                onClick={() => void act(task, "cancel_recurrence")}
                className="cc6-ghost-btn disabled:opacity-50"
              >
                Encerrar · {task.title}
              </button>
            ))}
          </div>
        </details>
      ) : null}

      <div
        className={`grid gap-4 ${leadership ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}
      >
        <section
          className="cc6-panel cc6-reveal self-start overflow-hidden"
          style={{ animationDelay: "180ms" }}
          aria-labelledby="atlas-task-queue-title"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <p className="cc6-eyebrow">Fila comercial</p>
              <h2
                id="atlas-task-queue-title"
                className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
              >
                Priorizada por atraso e prazo
              </h2>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="cc6-ghost-btn disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate((current) => !current)}
                className="atlas-button-primary"
                aria-expanded={showCreate}
                aria-controls="atlas-task-create"
              >
                {showCreate ? "Fechar criação" : "Nova tarefa"}
              </button>
            </div>
          </header>
          <div
            className="mt-4 flex flex-wrap gap-1.5 px-5 pb-4"
            role="tablist"
            aria-label="Filtrar tarefas"
          >
            {TASK_VIEWS.map(([key, label]) => {
              const active = view === key;
              const count = viewCounts[key];
              return (
                <button
                  key={key}
                  id={`task-view-${key}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="task-view-panel"
                  onClick={() => setView(key)}
                  className={`cc6-chip cursor-pointer transition-colors ${
                    active
                      ? "border-[color:var(--atlas-accent)]! text-[#e8eef8]!"
                      : "hover:border-[rgba(148,163,184,0.35)]! hover:text-[#e8eef8]!"
                  }`}
                >
                  {label}
                  <strong
                    className={`font-semibold ${
                      key === "overdue" && count
                        ? "cc6-crit"
                        : key === "today" && count
                          ? "cc6-warn"
                          : ""
                    }`}
                  >
                    {count}
                  </strong>
                </button>
              );
            })}
          </div>
          <div
            id="task-view-panel"
            className="flex flex-col focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]"
            role="tabpanel"
            aria-labelledby={`task-view-${view}-tab`}
            tabIndex={0}
            aria-live="polite"
            aria-busy={loading}
          >
            {loading ? (
              <div className="space-y-2 px-5 pb-5">
                {[1, 2, 3, 4].map((item) => (
                  <AtlasSkeleton key={item} className="h-12" />
                ))}
              </div>
            ) : visible.length ? (
              visible.map((task, index) => {
                const busy = savingId === task.id;
                const sev = taskSeverity(task);
                return (
                  <article
                    key={task.id}
                    className={`cc6-reveal cc6-hairline group relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-[rgba(75,141,248,0.04)] ${sev ? "cc6-sev-band" : ""}`}
                    style={
                      {
                        animationDelay: `${Math.min(index, 8) * 45}ms`,
                        ...(sev ? { "--cc6-sev": SEV_INK[sev] } : {}),
                      } as CSSProperties
                    }
                    aria-busy={busy}
                    data-urgency={
                      task.overdue
                        ? "overdue"
                        : task.today
                          ? "today"
                          : task.due_at
                            ? "planned"
                            : "no-due"
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 max-w-full truncate text-sm font-medium text-[#e8eef8]">
                          {task.title}
                        </h3>
                        {HIGH_PRIORITY.has(task.priority) ? (
                          <StatusBadge tone="warning">Alta</StatusBadge>
                        ) : null}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#6b7890]">
                        <span
                          className={`cc6-num ${sevTextClass(sev)}`}
                          title={dateLabel(task.due_at)}
                        >
                          {relativeDue(task.due_at, nowMs)}
                        </span>
                        {task.lead_id ? (
                          <Link
                            href={`/leads/${task.lead_id}`}
                            className="max-w-full truncate font-medium text-[color:var(--atlas-accent)] hover:underline"
                          >
                            {task.lead?.name || "Abrir lead"}
                          </Link>
                        ) : null}
                        {!task.mine ? (
                          <span className="max-w-full truncate">
                            {task.assigneeName}
                          </span>
                        ) : null}
                      </p>
                      {task.description ? (
                        <p className="mt-1 truncate text-xs text-[#6b7890]">
                          {task.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(task, "postpone_one_day")}
                        className="cc6-ghost-btn disabled:opacity-50"
                        title="Reagendar para amanhã"
                        aria-label={`Reagendar ${task.title} em um dia`}
                      >
                        +1 dia
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(task, "complete")}
                        className="cc6-ghost-btn disabled:opacity-50"
                        aria-label={`Concluir ${task.title}`}
                      >
                        {busy ? "Salvando..." : "Concluir"}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="cc6-hairline px-5 py-6">
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
                        onClick={() => setView("priority")}
                        className="atlas-button-secondary"
                      >
                        Ver prioridades
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="atlas-button-primary"
                      >
                        Criar tarefa
                      </button>
                    )
                  }
                />
              </div>
            )}
          </div>
          {data ? (
            <footer
              className="cc6-hairline flex flex-wrap items-center gap-1.5 px-5 py-3"
              aria-label="Indicadores da rotina"
            >
              <span className="cc6-chip">
                concluídas{" "}
                <strong className="cc6-ok font-semibold">
                  {data.summary.completed}
                </strong>
              </span>
              <span className="cc6-chip">
                alta prioridade{" "}
                <strong className="font-semibold">{data.summary.high}</strong>
              </span>
              <span className="cc6-chip">
                sem responsável{" "}
                <strong
                  className={`font-semibold ${data.summary.unassigned ? "cc6-warn" : ""}`}
                >
                  {data.summary.unassigned}
                </strong>
              </span>
            </footer>
          ) : null}
        </section>

        {leadership ? (
          <section
            className="cc6-panel-quiet cc6-reveal h-fit p-4"
            style={{ animationDelay: "240ms" }}
            aria-labelledby="atlas-team-load-title"
          >
            <p className="cc6-eyebrow">Equipe visível</p>
            <h2
              id="atlas-team-load-title"
              className="mt-1 text-sm font-semibold tracking-tight text-[#e8eef8]"
            >
              Carga por responsável
            </h2>
            <div className="mt-2 flex flex-col">
              {data?.byOwner.map((owner, index) => (
                <div
                  key={owner.id}
                  className={`flex items-baseline justify-between gap-3 py-2 ${index ? "cc6-hairline" : ""}`}
                >
                  <span className="min-w-0 truncate text-xs font-medium text-[#e8eef8]">
                    {owner.name}
                  </span>
                  <span className="cc6-num shrink-0 text-[11px] text-[#6b7890]">
                    {owner.overdue ? (
                      <>
                        <span className="cc6-crit font-semibold">
                          {owner.overdue} vencidas
                        </span>
                        {" · "}
                      </>
                    ) : null}
                    {owner.open} abertas
                    {owner.today ? ` · ${owner.today} hoje` : ""}
                    {owner.high ? ` · ${owner.high} alta` : ""}
                  </span>
                </div>
              ))}
              {!data?.byOwner.length ? (
                <div className="py-2">
                  <AtlasEmpty
                    reason="completed"
                    eyebrow="Equipe sem pendências"
                    title="Sem tarefas visíveis"
                    description="A equipe ainda não possui ações abertas."
                  />
                </div>
              ) : null}
            </div>
            <p className="cc6-hairline mt-1 pt-2.5 text-[10px] leading-4 text-[#6b7890]">
              Consolidado para coordenar apoio · sem ranking e sem atribuição
              automática.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
