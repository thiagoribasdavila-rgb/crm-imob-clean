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
import { CopilotContextAction } from "@/components/atlas/copilot-context-action";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

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
type Sev = "crit" | "warn" | null;

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

// O verbo já nomeia o tipo (tarefa/visita/lead): um dado só por linha.
const KIND_ACTION = {
  task: "Ver tarefa",
  visit: "Preparar visita",
  follow_up: "Abrir lead",
} as const;

// Semânticos CC-6: rose para atrasado, amber para hoje; futuro fica neutro.
const SEV_INK = { crit: "#fb7185", warn: "#f5b544" } as const;

const dayKey = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

const weekdayName = (value: string) => {
  const name = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(
    new Date(value),
  );
  return name.charAt(0).toUpperCase() + name.slice(1);
};

const shortDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));

const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

function EventRow({
  item,
  sev,
  withDate,
  overdueTag,
  divider,
  delay,
}: {
  item: Item;
  sev: Sev;
  withDate?: boolean;
  overdueTag?: boolean;
  divider: boolean;
  delay: number;
}) {
  return (
    <Link
      href={item.href}
      className={`cc6-reveal group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[rgba(75,141,248,0.04)] ${divider ? "cc6-hairline" : ""} ${sev ? "cc6-sev-band" : ""}`}
      style={
        {
          animationDelay: `${delay}ms`,
          ...(sev ? { "--cc6-sev": SEV_INK[sev] } : {}),
        } as CSSProperties
      }
      data-kind={item.kind}
      data-overdue={item.overdue}
    >
      <time
        dateTime={item.at}
        className={`cc6-num shrink-0 text-[13px] ${withDate ? "w-24" : "w-12"} ${
          sev === "crit"
            ? "cc6-crit"
            : sev === "warn"
              ? "cc6-warn"
              : "text-[#aab6ca]"
        }`}
      >
        {withDate ? `${shortDate(item.at)} · ` : ""}
        {timeLabel(item.at)}
      </time>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <strong className="max-w-full truncate text-sm font-medium text-[#e8eef8]">
            {item.title}
          </strong>
          {overdueTag ? (
            <span className="cc6-crit cc6-num text-[10px] tracking-[0.14em] uppercase">
              Em atraso
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[#6b7890]">
          {item.detail}
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium text-[#aab6ca] transition-colors group-hover:text-[color:var(--atlas-accent)]">
        {KIND_ACTION[item.kind]} <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

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

  const signals = useMemo(() => {
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
    };
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

  // Nos recortes futuros, todo o atraso fica fixado no topo (herda o papel do
  // antigo card "Atenção imediata"); em "Atrasados"/"Todos" ele já está na lista.
  const pinOverdue = window !== "overdue" && window !== "all";

  const overdueItems = useMemo(
    () =>
      (data?.items ?? [])
        .filter((item) => item.overdue)
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    [data],
  );

  const groups = useMemo(() => {
    const source = pinOverdue
      ? visible.filter((item) => !item.overdue)
      : visible;
    const now = new Date();
    const todayKey = dayKey(now.toISOString());
    const tomorrowKey = dayKey(
      new Date(now.getTime() + 86_400_000).toISOString(),
    );
    const map = new Map<
      string,
      { name: string; date: string; today: boolean; items: Item[] }
    >();
    for (const item of source) {
      const key = dayKey(item.at);
      let group = map.get(key);
      if (!group) {
        group = {
          name:
            key === todayKey
              ? "Hoje"
              : key === tomorrowKey
                ? "Amanhã"
                : weekdayName(item.at),
          date: shortDate(item.at),
          today: key === todayKey,
          items: [],
        };
        map.set(key, group);
      }
      group.items.push(item);
    }
    return [...map.entries()].map(([key, group]) => ({ key, ...group }));
  }, [visible, pinOverdue]);

  const hasOverduePin = pinOverdue && overdueItems.length > 0;
  const summary = data?.summary;
  const composition = [
    ["Tarefas", summary?.tasks],
    ["Visitas", summary?.visits],
    ["Follow-ups", summary?.followUps],
    ["Total", summary?.total],
  ] as const;

  return (
    <div
      className="space-y-4 pb-8"
      data-phase="46-commercial-calendar"
      data-evolution-phase="39"
      data-calendar-layout="time-first"
    >
      <PageHeader
        eyebrow="Agenda comercial · Fonte única"
        title="Seu tempo comercial, em ordem"
        description="Atrasos em rosa, hoje em âmbar — tarefas, visitas e follow-ups em uma única linha do tempo."
        action={{
          href: "/tasks",
          label: "Criar tarefa",
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

      <section aria-labelledby="atlas-calendar-timeline-title">
        <TiltShell
          className="cc6-panel cc6-reveal overflow-hidden"
          delayMs={40}
          maxDeg={2}
        >
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-1">
            <div className="min-w-0">
              <p className="cc6-eyebrow">Linha do tempo</p>
              <h2
                id="atlas-calendar-timeline-title"
                className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
              >
                {WINDOW_TITLES[window]}
              </h2>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <StatusBadge
                tone={
                  live === "connected"
                    ? "success"
                    : live === "degraded"
                      ? "warning"
                      : "neutral"
                }
              >
                {live === "connected"
                  ? "Sincronizada"
                  : live === "degraded"
                    ? "Atualização manual"
                    : "Conectando"}
              </StatusBadge>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="cc6-ghost-btn disabled:opacity-50"
              >
                {loading ? "Atualizando…" : "Atualizar"}
              </button>
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
            </div>
          </header>

          <nav
            className="mt-3 flex flex-wrap gap-1.5 px-5 pb-4"
            aria-label="Período da agenda"
          >
            {WINDOWS.map(([key, label]) => {
              const active = window === key;
              const count =
                key === "overdue"
                  ? signals.overdue
                  : key === "today"
                    ? signals.today
                    : key === "week"
                      ? signals.nextSevenDays
                      : null;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setWindow(key)}
                  aria-pressed={active}
                  className={`cc6-ghost-btn ${
                    active
                      ? "border-[color:var(--atlas-accent)]! bg-[rgba(75,141,248,0.08)]! text-[#e8eef8]!"
                      : ""
                  }`}
                >
                  {label}
                  {!loading && count !== null ? (
                    <strong
                      className={`cc6-num font-semibold ${
                        key === "overdue" && count
                          ? "cc6-crit"
                          : key === "today" && count
                            ? "cc6-warn"
                            : ""
                      }`}
                    >
                      {count}
                    </strong>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="flex flex-col" aria-live="polite" aria-busy={loading}>
            {loading ? (
              <div className="space-y-2 px-5 pb-5">
                {[1, 2, 3].map((item) => (
                  <AtlasSkeleton key={item} className="h-24" />
                ))}
              </div>
            ) : hasOverduePin || groups.length ? (
              <>
                {hasOverduePin ? (
                  <section
                    className="cc6-reveal"
                    style={{ animationDelay: "80ms" }}
                    aria-labelledby="atlas-calendar-overdue-title"
                  >
                    <header className="cc6-hairline flex items-baseline justify-between gap-3 px-5 pt-3.5 pb-1">
                      <h3
                        id="atlas-calendar-overdue-title"
                        className="flex items-baseline gap-2 text-sm font-semibold tracking-tight"
                      >
                        <span className="cc6-crit">Em atraso</span>
                        <span className="cc6-num text-[11px] font-normal text-[#6b7890]">
                          resolver primeiro
                        </span>
                      </h3>
                      <span
                        className="cc6-crit cc6-num text-[11px]"
                        aria-label={`${overdueItems.length} compromissos em atraso`}
                      >
                        {overdueItems.length}
                      </span>
                    </header>
                    {overdueItems.map((item, index) => (
                      <EventRow
                        key={`${item.kind}-${item.id}`}
                        item={item}
                        sev="crit"
                        withDate
                        divider={index > 0}
                        delay={100 + Math.min(index, 6) * 45}
                      />
                    ))}
                  </section>
                ) : null}
                {groups.map((group, groupIndex) => {
                  const baseDelay = 120 + Math.min(groupIndex, 4) * 70;
                  return (
                    <section
                      key={group.key}
                      className="cc6-reveal"
                      style={{ animationDelay: `${baseDelay}ms` }}
                      data-today={group.today}
                    >
                      <header className="cc6-hairline flex items-baseline justify-between gap-3 px-5 pt-3.5 pb-1">
                        <h3 className="flex items-baseline gap-2 text-sm font-semibold tracking-tight">
                          <span
                            className={
                              group.today ? "cc6-warn" : "text-[#e8eef8]"
                            }
                          >
                            {group.name}
                          </span>
                          <span className="cc6-num text-[11px] font-normal text-[#6b7890]">
                            {group.date}
                          </span>
                        </h3>
                        <span
                          className="cc6-num text-[11px] text-[#6b7890]"
                          aria-label={`${group.items.length} compromissos`}
                        >
                          {group.items.length}
                        </span>
                      </header>
                      {group.items.map((item, index) => (
                        <EventRow
                          key={`${item.kind}-${item.id}`}
                          item={item}
                          sev={
                            item.overdue
                              ? "crit"
                              : group.today
                                ? "warn"
                                : null
                          }
                          overdueTag={item.overdue && window === "all"}
                          divider={index > 0}
                          delay={baseDelay + 20 + Math.min(index, 6) * 40}
                        />
                      ))}
                    </section>
                  );
                })}
              </>
            ) : (
              <div className="px-5 py-6">
                <AtlasEmpty
                  reason="completed"
                  eyebrow={
                    window === "all"
                      ? "Agenda sem compromissos"
                      : "Período sem pendências"
                  }
                  title={
                    window === "all"
                      ? "Agenda vazia"
                      : "Agenda livre neste período"
                  }
                  description={
                    window === "all"
                      ? "Nenhum compromisso registrado. Comece criando uma tarefa comercial."
                      : "Nenhum compromisso exige atenção neste recorte. Crie uma tarefa ou consulte a agenda completa."
                  }
                  action={
                    window === "all" ? (
                      <Link href="/tasks" className="atlas-button-primary">
                        Criar tarefa
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setWindow("all")}
                        className="atlas-button-secondary"
                      >
                        Ver agenda completa
                      </button>
                    )
                  }
                />
              </div>
            )}
          </div>

          <div
            className="cc6-hairline mt-3 flex flex-wrap items-center gap-1.5 px-5 py-3"
            aria-label="Composição da agenda"
          >
            {composition.map(([label, value]) => (
              <span key={label} className="cc6-chip">
                {label}
                <strong className="font-semibold text-[#e8eef8]">
                  {loading || value === undefined ? "—" : value}
                </strong>
              </span>
            ))}
          </div>
          <p className="cc6-hairline px-5 py-2.5 text-[10px] leading-4 text-[#6b7890]">
            Organização, hierarquia e RLS aplicadas pela API · atualizações
            apenas reorganizam a agenda · nenhuma ação é concluída e nenhum
            cliente é contatado automaticamente.
          </p>
        </TiltShell>
      </section>
    </div>
  );
}
