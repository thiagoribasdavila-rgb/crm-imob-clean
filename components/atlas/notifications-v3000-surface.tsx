"use client";

import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AtlasMetric } from "@/components/ui/AtlasCard";
import {
  AtlasBadge,
  AtlasEmpty,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";

type Task = {
  id: string;
  title: string;
  due_at: string;
  status: string;
  lead_id: string | null;
};

type Reminder = {
  id: string;
  kind: "upcoming" | "overdue";
  task_due_at: string;
  priority: string;
  read_at: string | null;
  task: Task | Task[];
};

type ReminderData = {
  summary: { open: number; unread: number; overdue: number };
  reminders: Reminder[];
};

type RealtimeStatus = "connecting" | "connected" | "degraded";

type NotificationsContextValue = {
  data: ReminderData | null;
  error: string;
  liveMessage: string;
  loading: boolean;
  realtime: RealtimeStatus;
  refresh: () => Promise<void>;
  act: (id: string, action: "read" | "dismiss") => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("NotificationsProvider ausente na árvore V3000.");
  }
  return context;
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

function dueAtLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function reminderTask(reminder: Reminder) {
  return Array.isArray(reminder.task) ? reminder.task[0] : reminder.task;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ReminderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [realtime, setRealtime] = useState<RealtimeStatus>("connecting");
  const [liveMessage, setLiveMessage] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
      const response = await fetch("/api/v1/task-reminders", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message || "Não foi possível carregar seus lembretes.");
      }
      setData((body.data || body) as ReminderData);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar seus lembretes.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!active || !user.user) return;

      channel = supabase
        .channel(`task-reminders-${user.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "task_reminders",
            filter: `assigned_to=eq.${user.user.id}`,
          },
          (payload) => {
            setLiveMessage(
              payload.eventType === "INSERT"
                ? "Novo lembrete recebido."
                : "Lembretes atualizados.",
            );
            void load(true);
          },
        )
        .subscribe((status) => {
          setRealtime(
            status === "SUBSCRIBED"
              ? "connected"
              : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
                ? "degraded"
                : "connecting",
          );
        });
    })();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [load]);

  const act = useCallback(async (id: string, action: "read" | "dismiss") => {
    const token = await accessToken();
    if (!token) {
      setError("Sua sessão expirou. Entre novamente.");
      return;
    }
    const response = await fetch("/api/v1/task-reminders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, action }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message || "Não foi possível atualizar o lembrete.");
      return;
    }
    await load(true);
  }, [load]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      data,
      error,
      liveMessage,
      loading,
      realtime,
      refresh: () => load(),
      act,
    }),
    [act, data, error, liveMessage, load, loading, realtime],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function NotificationsFeedback() {
  const { error, loading, refresh } = useNotifications();
  if (!error) return null;

  return (
    <AtlasRecoverableError
      description={error}
      onRetry={() => void refresh()}
      busy={loading}
    />
  );
}

export function NotificationsMetrics() {
  const { data, loading } = useNotifications();
  return (
    <>
      <AtlasMetric
        label="Lembretes abertos"
        value={loading ? "—" : data?.summary.open ?? 0}
        detail="Sua caixa operacional"
        trend="ATIVOS"
        tone="blue"
      />
      <AtlasMetric
        label="Não lidos"
        value={loading ? "—" : data?.summary.unread ?? 0}
        detail="Revisar agora"
        trend="NOVOS"
        tone="violet"
      />
      <AtlasMetric
        label="Tarefas vencidas"
        value={loading ? "—" : data?.summary.overdue ?? 0}
        detail="Maior urgência"
        trend="SLA"
        tone="rose"
      />
    </>
  );
}

export function NotificationsPriority() {
  const { data, loading } = useNotifications();
  const overdue =
    data?.reminders
      .filter((reminder) => reminder.kind === "overdue")
      .slice(0, 3) ?? [];

  if (loading) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <AtlasSkeleton key={item} className="h-24" />
        ))}
      </div>
    );
  }

  if (!overdue.length) {
    return (
      <p className="text-sm text-slate-400">
        Nenhuma tarefa vencida. Continue pela caixa operacional abaixo.
      </p>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {overdue.map((reminder) => {
        const task = reminderTask(reminder);
        return (
          <Link
            key={reminder.id}
            href={task?.lead_id ? `/leads/${task.lead_id}` : "/tasks"}
            className="rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-4 transition hover:border-rose-300/30"
          >
            <strong className="line-clamp-1 text-sm text-white">
              {task?.title || "Tarefa comercial"}
            </strong>
            <p className="mt-2 text-xs text-slate-400">
              Venceu em {dueAtLabel(reminder.task_due_at)}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

export function NotificationsRefreshAction() {
  const { loading, refresh } = useNotifications();
  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={loading}
      className="atlas-button-secondary disabled:cursor-wait disabled:opacity-50"
    >
      {loading ? "Atualizando…" : "Atualizar"}
    </button>
  );
}

export function NotificationsWorkspace() {
  const { act, data, liveMessage, loading } = useNotifications();

  return (
    <div
      data-phase="45-realtime-notifications"
      data-contract="FASE 45 · NOTIFICAÇÕES EM TEMPO REAL"
      data-v3000-pilot="notifications"
    >
      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>
      <div className="grid gap-3">
        {loading ? (
          [1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-36" />)
        ) : data?.reminders.length ? (
          data.reminders.map((reminder) => {
            const task = reminderTask(reminder);
            return (
              <article
                key={reminder.id}
                className={`rounded-2xl border p-4 ${
                  reminder.kind === "overdue"
                    ? "border-rose-400/20 bg-rose-400/[.04]"
                    : "border-amber-400/15 bg-amber-400/[.03]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm text-white">
                      {task?.title || "Tarefa comercial"}
                    </strong>
                    <p className="mt-1 text-xs text-slate-500">
                      Prazo {dueAtLabel(reminder.task_due_at)} · prioridade{" "}
                      {reminder.priority}
                    </p>
                  </div>
                  <AtlasBadge tone={reminder.kind === "overdue" ? "danger" : "warning"}>
                    {reminder.kind === "overdue" ? "VENCIDA" : "PRÓXIMA"}
                  </AtlasBadge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={task?.lead_id ? `/leads/${task.lead_id}` : "/tasks"}
                    className="atlas-button-primary"
                  >
                    {task?.lead_id ? "Abrir lead" : "Abrir tarefa"}
                  </Link>
                  {!reminder.read_at ? (
                    <button
                      type="button"
                      onClick={() => void act(reminder.id, "read")}
                      className="atlas-button-secondary"
                    >
                      Marcar como lido
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void act(reminder.id, "dismiss")}
                    className="atlas-button-secondary"
                  >
                    Dispensar
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <AtlasEmpty
            title="Nenhum lembrete pendente"
            description="Sua operação está dentro das janelas configuradas."
          />
        )}
      </div>
    </div>
  );
}

export function NotificationsRealtimeStatus() {
  const { realtime } = useNotifications();
  return (
    <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-300">Atualização da caixa</span>
        <AtlasBadge
          tone={
            realtime === "connected"
              ? "success"
              : realtime === "degraded"
                ? "warning"
                : "neutral"
          }
        >
          {realtime === "connected"
            ? "TEMPO REAL ATIVO"
            : realtime === "degraded"
              ? "MODO MANUAL"
              : "CONECTANDO"}
        </AtlasBadge>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Se a assinatura em tempo real cair, a atualização manual continua
        disponível.
      </p>
    </div>
  );
}

export function NotificationsGovernance() {
  return (
    <div className="grid gap-3 text-sm text-slate-400 sm:grid-cols-3">
      <p className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
        A consulta e a atualização respeitam organização, responsável e RLS.
      </p>
      <p className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
        Nenhum cliente é contatado ao abrir, ler ou dispensar um lembrete.
      </p>
      <p className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
        Nenhuma tarefa é concluída automaticamente por esta tela.
      </p>
    </div>
  );
}
