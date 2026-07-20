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
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { CopilotContextAction } from "@/components/atlas/copilot-context-action";

type Item = {
  id: string;
  kind: "task" | "visit" | "follow_up";
  title: string;
  at: string;
  status: string;
  detail: string;
  href: string;
  leadId: string | null;
  overdue: boolean;
};

type CalendarData = {
  summary: {
    total: number;
    overdue: number;
    tasks: number;
    visits: number;
    followUps: number;
  };
  items: Item[];
};

type Window = "today" | "week" | "month" | "overdue" | "all";

const TONES = {
  task: "neutral",
  visit: "violet",
  follow_up: "info",
} as const;

const LABELS = {
  task: "TAREFA",
  visit: "VISITA",
  follow_up: "FOLLOW-UP",
} as const;

const WINDOWS = [
  ["today", "Hoje"],
  ["week", "7 dias"],
  ["month", "Este mês"],
  ["overdue", "Atrasados"],
  ["all", "Todos"],
] as const satisfies ReadonlyArray<readonly [Window, string]>;

const WINDOW_TITLES: Record<Window, string> = {
  today: "Compromissos de hoje",
  week: "Próximos sete dias",
  month: "Agenda deste mês",
  overdue: "Compromissos atrasados",
  all: "Agenda completa",
};

const dayLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(value));

const dayKey = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default function CalendarPage() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [window, setWindow] = useState<Window>("week");
  const [live, setLive] = useState("connecting");

  const token = useCallback(
    async () =>
      (await supabase.auth.getSession()).data.session?.access_token || "",
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/calendar", {
        headers: { Authorization: `Bearer ${await token()}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setData(body.data || body);
      setError("");
    } catch {
      setError("Não foi possível carregar sua agenda comercial.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase.channel("commercial-calendar");
    for (const table of ["tasks", "lead_visits", "leads"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => void load(),
      );
    }
    channel.subscribe((status) =>
      setLive(
        status === "SUBSCRIBED"
          ? "connected"
          : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
            ? "degraded"
            : "connecting",
      ),
    );
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const calendarSignals = useMemo(() => {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const endDay = start + 86_400_000;
    const endWeek = start + 7 * 86_400_000;
    const items = data?.items ?? [];

    return {
      overdue: items.filter((item) => item.overdue).length,
      today: items.filter((item) => {
        const at = new Date(item.at).getTime();
        return at >= start && at < endDay;
      }).length,
      nextSevenDays: items.filter((item) => {
        const at = new Date(item.at).getTime();
        return at >= start && at < endWeek;
      }).length,
      visits: items.filter((item) => item.kind === "visit").length,
    };
  }, [data]);

  const attention = useMemo(() => {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const endDay = start + 86_400_000;

    return (data?.items ?? [])
      .filter((item) => {
        const at = new Date(item.at).getTime();
        return item.overdue || (at >= start && at < endDay);
      })
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return new Date(a.at).getTime() - new Date(b.at).getTime();
      })
      .slice(0, 3);
  }, [data]);

  const visible = useMemo(() => {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const endDay = start + 86_400_000;
    const endWeek = start + 7 * 86_400_000;
    const endMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    ).getTime();

    return (data?.items ?? []).filter((item) => {
      const at = new Date(item.at).getTime();
      if (window === "overdue") return item.overdue;
      if (window === "today") return at >= start && at < endDay;
      if (window === "week") return at >= start && at < endWeek;
      if (window === "month") return at >= start && at < endMonth;
      return true;
    });
  }, [data, window]);

  const groups = useMemo(
    () =>
      visible.reduce<
        Record<string, { label: string; items: Item[] }>
      >((accumulator, item) => {
        const key = dayKey(item.at);
        const group = accumulator[key] ?? {
          label: dayLabel(item.at),
          items: [],
        };
        group.items.push(item);
        accumulator[key] = group;
        return accumulator;
      }, {}),
    [visible],
  );

  return (
    <div
      className="space-y-5 pb-10"
      data-phase="46-commercial-calendar"
      data-evolution-phase="39"
      data-calendar-layout="time-first"
    >
      <section
        className="atlas-calendar-hero"
        aria-labelledby="atlas-calendar-title"
      >
        <div className="atlas-calendar-hero-copy">
          <div className="flex flex-wrap gap-2">
            <AtlasBadge
              tone={
                live === "connected"
                  ? "success"
                  : live === "degraded"
                    ? "warning"
                    : "neutral"
              }
            >
              {live === "connected"
                ? "SINCRONIZADA"
                : live === "degraded"
                  ? "ATUALIZAÇÃO MANUAL"
                  : "CONECTANDO"}
            </AtlasBadge>
          </div>
          <h1 id="atlas-calendar-title">Seu tempo comercial, em ordem</h1>
          <p>
            Veja primeiro o que atrasou, o que acontece hoje e os próximos
            compromissos. Tarefas, visitas e follow-ups permanecem em uma única
            linha do tempo.
          </p>
          <div className="atlas-calendar-hero-actions">
            <CopilotContextAction
              label="✦ Preparar meu dia"
              prompt="Organize minha agenda comercial em uma sequência prática: atrasos primeiro, contatos de maior impacto e compromissos que exigem preparação. Apenas sugira; não conclua ou crie tarefas."
              context={{
                source: "commercial_calendar",
                workspace: "calendar",
                contextLabel: "Agenda comercial",
                returnHref: "/calendar",
              }}
              className="atlas-button-primary"
            />
            <Link href="/tasks" className="atlas-button-primary">
              Criar tarefa
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="atlas-button-secondary"
            >
              {loading ? "Atualizando…" : "Atualizar agenda"}
            </button>
          </div>
        </div>

        <div
          className="atlas-calendar-signal-grid"
          aria-label="Resumo temporal da agenda"
          aria-busy={loading}
        >
          <button
            type="button"
            className="atlas-calendar-signal cursor-pointer text-left"
            data-tone="danger"
            onClick={() => setWindow("overdue")}
            aria-pressed={window === "overdue"}
            aria-label="Ver compromissos atrasados na linha do tempo"
          >
            <span>Atrasados</span>
            <strong>{loading ? "—" : calendarSignals.overdue}</strong>
            <small>Resolver primeiro</small>
          </button>
          <button
            type="button"
            className="atlas-calendar-signal cursor-pointer text-left"
            data-tone="warning"
            onClick={() => setWindow("today")}
            aria-pressed={window === "today"}
            aria-label="Ver compromissos de hoje na linha do tempo"
          >
            <span>Hoje</span>
            <strong>{loading ? "—" : calendarSignals.today}</strong>
            <small>Compromissos do dia</small>
          </button>
          <button
            type="button"
            className="atlas-calendar-signal cursor-pointer text-left"
            data-tone="success"
            onClick={() => setWindow("week")}
            aria-pressed={window === "week"}
            aria-label="Ver os próximos sete dias na linha do tempo"
          >
            <span>Próximos 7 dias</span>
            <strong>{loading ? "—" : calendarSignals.nextSevenDays}</strong>
            <small>Planejamento imediato</small>
          </button>
          <div className="atlas-calendar-signal" data-tone="violet">
            <span>Visitas</span>
            <strong>{loading ? "—" : calendarSignals.visits}</strong>
            <small>Presencial ou vídeo</small>
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

      <AtlasCard className="atlas-calendar-attention-card">
        <AtlasCardHeader
          eyebrow="ATENÇÃO IMEDIATA"
          title="O que exige ação agora"
          description="Até três compromissos vencidos ou previstos para hoje, ordenados por prazo."
          action={
            <Link href="/tasks" className="atlas-button-secondary">
              Central de tarefas
            </Link>
          }
        />
        <div
          className="atlas-calendar-attention-list"
          aria-live="polite"
          aria-busy={loading}
        >
          {loading ? (
            [1, 2, 3].map((item) => (
              <AtlasSkeleton key={item} className="h-20" />
            ))
          ) : attention.length ? (
            attention.map((item, index) => (
              <Link
                href={item.href}
                key={`attention-${item.kind}-${item.id}`}
                className="atlas-calendar-attention-item"
                data-overdue={item.overdue}
              >
                <span className="atlas-calendar-attention-position">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="atlas-calendar-attention-copy">
                  <small>
                    {item.overdue ? "ATRASADO" : "HOJE"} · {LABELS[item.kind]}
                  </small>
                  <strong>{item.title}</strong>
                  <span>
                    {timeLabel(item.at)} · {item.detail}
                  </span>
                </span>
                <span className="atlas-calendar-attention-action">
                  {item.kind === "task"
                    ? "Ver tarefa →"
                    : item.kind === "visit"
                      ? "Preparar visita →"
                      : "Abrir lead →"}
                </span>
              </Link>
            ))
          ) : (
            <div className="atlas-calendar-attention-clear" role="status">
              <strong>Nenhum atraso ou compromisso para hoje.</strong>
              <span>Consulte os próximos dias para preparar sua agenda.</span>
            </div>
          )}
        </div>
      </AtlasCard>

      <AtlasCard className="atlas-calendar-timeline-card">
        <AtlasCardHeader
          eyebrow="LINHA DO TEMPO"
          title={WINDOW_TITLES[window]}
          description="Altere o período sem perder a fonte única de tarefas, visitas e próximos contatos."
        />

        <nav
          className="atlas-calendar-periods"
          aria-label="Período da agenda"
        >
          {WINDOWS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setWindow(key)}
              aria-pressed={window === key}
              className={`atlas-calendar-period ${window === key ? "is-active" : ""}`}
            >
              {key === "overdue" && !loading && calendarSignals.overdue > 0
                ? `${label} · ${calendarSignals.overdue}`
                : label}
            </button>
          ))}
        </nav>

        <div
          className="atlas-calendar-timeline"
          aria-live="polite"
          aria-busy={loading}
        >
          {loading ? (
            [1, 2, 3].map((item) => (
              <AtlasSkeleton key={item} className="h-32" />
            ))
          ) : Object.keys(groups).length ? (
            Object.entries(groups).map(([date, group]) => {
              const now = new Date();
              const todayKey = dayKey(now.toISOString());
              const tomorrowKey = dayKey(
                new Date(now.getTime() + 86_400_000).toISOString(),
              );
              const isToday = date === todayKey;
              const isTomorrow = date === tomorrowKey;
              return (
              <section
                key={date}
                className="atlas-calendar-day"
                data-today={isToday ? "true" : "false"}
                style={
                  isToday
                    ? { borderColor: "rgba(56, 189, 248, 0.28)" }
                    : undefined
                }
              >
                <header>
                  <span aria-hidden="true" />
                  <h2>
                    {isToday ? "Hoje · " : isTomorrow ? "Amanhã · " : ""}
                    {group.label}
                  </h2>
                  <small>
                    {group.items.length} {group.items.length === 1 ? "item" : "itens"}
                  </small>
                </header>
                <div className="atlas-calendar-day-items">
                  {group.items.map((item) => (
                    <Link
                      href={item.href}
                      key={`${item.kind}-${item.id}`}
                      className="atlas-calendar-item"
                      data-overdue={item.overdue}
                      style={
                        item.overdue
                          ? {
                              borderLeft:
                                "3px solid rgba(244, 63, 94, 0.6)",
                            }
                          : undefined
                      }
                    >
                      <time dateTime={item.at}>{timeLabel(item.at)}</time>
                      <span className="atlas-calendar-item-copy">
                        <span className="flex flex-wrap items-center gap-2">
                          <AtlasBadge tone={TONES[item.kind]}>
                            {LABELS[item.kind]}
                          </AtlasBadge>
                          {item.overdue ? (
                            <AtlasBadge tone="danger">ATRASADO</AtlasBadge>
                          ) : null}
                        </span>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <span className="atlas-calendar-item-action">
                        {item.kind === "task"
                          ? "Ver tarefa →"
                          : item.kind === "visit"
                            ? "Preparar visita →"
                            : "Abrir lead →"}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
              );
            })
          ) : (
            <AtlasEmpty
              reason="completed"
              eyebrow="Período sem pendências"
              title="Agenda livre neste período"
              description="Nenhum compromisso exige atenção neste recorte. Crie uma tarefa ou consulte outro período."
              action={
                <Link href="/tasks" className="atlas-button-primary">
                  Criar tarefa
                </Link>
              }
            />
          )}
        </div>

        <details className="atlas-calendar-source-details">
          <summary>Ver composição da agenda</summary>
          <div className="atlas-calendar-source-grid">
            <div>
              <span>Tarefas</span>
              <strong>{loading ? "—" : data?.summary.tasks ?? 0}</strong>
              <small>Ações internas abertas</small>
            </div>
            <div>
              <span>Visitas</span>
              <strong>{loading ? "—" : data?.summary.visits ?? 0}</strong>
              <small>Encontros ativos</small>
            </div>
            <div>
              <span>Follow-ups</span>
              <strong>{loading ? "—" : data?.summary.followUps ?? 0}</strong>
              <small>Próximas ações da carteira</small>
            </div>
            <div>
              <span>Total visível</span>
              <strong>{loading ? "—" : data?.summary.total ?? 0}</strong>
              <small>Sem duplicar visita e próxima ação</small>
            </div>
          </div>
        </details>
      </AtlasCard>

      <p className="atlas-calendar-governance-note">
        A API aplica organização, hierarquia e RLS. Atualizações apenas
        reorganizam a agenda; nenhuma ação é concluída e nenhum cliente é contatado automaticamente.
      </p>
    </div>
  );
}
