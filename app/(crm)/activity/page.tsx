"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  activityCategoryLabels,
  type ActivityCategory,
} from "@/lib/atlas/activity-timeline";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/*
 * CC-6 · Atividade — timeline de leitura.
 * Consolidações do redesign (mesmos dados, zero fetch novo):
 * - o card "Contexto recente" duplicava os 3 primeiros eventos da própria
 *   timeline (título, categoria, hora, lead e ator) — removido;
 * - o details "composição do histórico" repetia os contadores já visíveis
 *   nos chips de categoria — removido;
 * - "Contatos" no resumo era o mesmo número do chip Contatos
 *   (summary.contacts === counts.contact na API) — removido do pulso;
 * - hora aparece uma única vez por linha: relativa em HOJE (absoluta no
 *   title) e HH:mm nos demais dias, porque a data já vive no cabeçalho.
 */

type ActivityEvent = {
  id: string;
  category: ActivityCategory;
  title: string;
  description: string | null;
  occurredAt: string;
  source: string;
  leadId: string | null;
  leadName: string | null;
  leadStatus: string | null;
  actorName: string;
};

type ActivityData = {
  summary: {
    total: number;
    today: number;
    contacts: number;
    leadsInMotion: number;
  };
  counts: Record<ActivityCategory, number>;
  events: ActivityEvent[];
  generatedAt: string;
};

type Period = "today" | "week" | "month" | "all";
type CategoryFilter = "all" | ActivityCategory;

const PERIODS = [
  ["today", "Hoje"],
  ["week", "7 dias"],
  ["month", "30 dias"],
  ["all", "Completo"],
] as const satisfies ReadonlyArray<readonly [Period, string]>;

const CATEGORIES = [
  ["all", "Tudo"],
  ["contact", "Contatos"],
  ["change", "Movimentações"],
  ["proposal", "Propostas"],
  ["transfer", "Transferências"],
  ["ai", "Inteligência"],
  ["external", "Integrações"],
] as const satisfies ReadonlyArray<readonly [CategoryFilter, string]>;

const TZ = "America/Sao_Paulo";
const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DAY_HEADING_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});
const FULL_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  dateStyle: "short",
  timeStyle: "short",
});

const dayKey = (value: string) => DAY_KEY_FORMAT.format(new Date(value));
const timeLabel = (value: string) => TIME_FORMAT.format(new Date(value));
const fullLabel = (value: string) => FULL_FORMAT.format(new Date(value));

// Cabeçalho mono do dia: HOJE, ONTEM ou "SEX · 18 JUL" (ano só quando difere).
function dayHeading(value: string, nowMs: number) {
  const key = dayKey(value);
  if (nowMs) {
    if (key === dayKey(new Date(nowMs).toISOString())) return "Hoje";
    if (key === dayKey(new Date(nowMs - 86_400_000).toISOString())) {
      return "Ontem";
    }
  }
  const compact = DAY_HEADING_FORMAT.format(new Date(value))
    .replaceAll(".", "")
    .replace(", ", " · ")
    .replace(" de ", " ");
  const year = key.slice(0, 4);
  const currentYear = nowMs
    ? dayKey(new Date(nowMs).toISOString()).slice(0, 4)
    : year;
  return year === currentYear ? compact : `${compact} ${year}`;
}

// Relativo só dentro de HOJE; o absoluto completo fica no title da linha.
function relativeTime(value: string, nowMs: number) {
  const diff = Math.max(0, nowMs - new Date(value).getTime());
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)}min`;
  return `há ${Math.floor(diff / 3_600_000)}h`;
}

const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const chipClass = (active: boolean) =>
  `cc6-chip cursor-pointer transition-colors ${
    active
      ? "border-[color:var(--atlas-accent)]! text-[#e8eef8]!"
      : "hover:border-[rgba(148,163,184,0.35)]! hover:text-[#e8eef8]!"
  }`;

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState("connecting");
  const [nowMs, setNowMs] = useState(0);

  // Relógio de 1min: mantém "há 2h"/HOJE frescos sem tocar nos fetches.
  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const sessionToken = useCallback(async () => {
    const session = await supabase.auth.getSession();
    return session.data.session?.access_token || "";
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/v1/activity", {
        headers: { Authorization: `Bearer ${await sessionToken()}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setData(body.data || body);
      setError("");
    } catch {
      setError("Não foi possível atualizar o histórico comercial.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("commercial-activity-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        () => void load(true),
      );
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

  const visible = useMemo(() => {
    const today = new Date(data?.generatedAt || 0);
    const now = today.getTime();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    const normalizedQuery = normalize(query.trim());
    return (data?.events ?? []).filter((event) => {
      const at = new Date(event.occurredAt).getTime();
      if (period === "today" && at < todayStart) return false;
      if (period === "week" && at < now - 7 * 86_400_000) return false;
      if (period === "month" && at < now - 30 * 86_400_000) return false;
      if (category !== "all" && event.category !== category) return false;
      if (!normalizedQuery) return true;
      return normalize(
        [
          event.title,
          event.description,
          event.leadName,
          event.actorName,
          activityCategoryLabels[event.category],
        ].join(" "),
      ).includes(normalizedQuery);
    });
  }, [category, data, period, query]);

  // Grupos por dia (fuso SP) com offset acumulado para a revelação escalonada.
  const timelineGroups = useMemo(() => {
    const byDay = visible.reduce<Record<string, ActivityEvent[]>>(
      (result, event) => {
        (result[dayKey(event.occurredAt)] ??= []).push(event);
        return result;
      },
      {},
    );
    let offset = 0;
    return Object.entries(byDay).map(([key, items]) => {
      const group = { key, items, offset };
      offset += items.length + 1;
      return group;
    });
  }, [visible]);

  const categoryCount = (key: CategoryFilter) =>
    key === "all" ? data?.summary.total ?? 0 : data?.counts[key] ?? 0;
  const todayKey = nowMs ? dayKey(new Date(nowMs).toISOString()) : "";
  const filtersDirty = Boolean(query) || category !== "all" || period !== "week";

  return (
    <div
      className="space-y-4 pb-10"
      data-evolution-phase="40"
      data-activity-layout="cc6-reading-timeline"
    >
      <PageHeader
        eyebrow="CRM · Atividade"
        title="O histórico que explica a operação"
        description="Contatos, movimentações, propostas e decisões em ordem cronológica — o contexto antes de agir."
        action={{
          href: "/leads",
          label: "Abrir carteira",
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

      <section aria-label="Pulso do histórico">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Pulso do histórico</p>
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
                  ? "Ao vivo"
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
            </div>
          </div>
          <div
            className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-4 pt-4"
            aria-label="Resumo do histórico visível"
            aria-busy={loading}
          >
            <div>
              <p className="cc6-metric-value text-3xl leading-none">
                {loading ? "—" : data?.summary.today ?? 0}
              </p>
              <p className="cc6-metric-label mt-1.5">Registros hoje</p>
            </div>
            <div>
              <p className="cc6-metric-value text-3xl leading-none">
                {loading ? "—" : data?.summary.leadsInMotion ?? 0}
              </p>
              <p className="cc6-metric-label mt-1.5">
                Clientes com movimentação
              </p>
            </div>
            <div>
              <p className="cc6-metric-value text-3xl leading-none">
                {loading ? "—" : data?.summary.total ?? 0}
              </p>
              <p className="cc6-metric-label mt-1.5">Registros no escopo</p>
            </div>
          </div>
        </TiltShell>
      </section>

      <section
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "120ms" }}
        aria-labelledby="activity-timeline-title"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Histórico comercial</p>
            <h2
              id="activity-timeline-title"
              className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
            >
              Linha do tempo
            </h2>
          </div>
          {filtersDirty ? (
            <button
              type="button"
              className="cc6-ghost-btn shrink-0"
              onClick={() => {
                setQuery("");
                setCategory("all");
                setPeriod("week");
              }}
            >
              Limpar filtros
            </button>
          ) : null}
        </header>

        <div className="mt-4 flex flex-col gap-3 px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cliente, atividade ou responsável"
              aria-label="Buscar no histórico"
              className="w-full min-w-0 rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3.5 py-2.5 text-sm text-[#e8eef8] outline-none transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] sm:max-w-xs"
            />
            <nav
              className="flex flex-wrap gap-1.5"
              aria-label="Período do histórico"
            >
              {PERIODS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  aria-pressed={period === key}
                  className={chipClass(period === key)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <nav
            className="flex flex-wrap gap-1.5"
            aria-label="Categoria do histórico"
          >
            {CATEGORIES.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                aria-pressed={category === key}
                className={chipClass(category === key)}
              >
                {label}
                <strong className="font-semibold">{categoryCount(key)}</strong>
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-2 pb-2" aria-live="polite" aria-busy={loading}>
          {loading ? (
            <div className="space-y-2 px-5 pb-3 pt-2">
              {[1, 2, 3].map((item) => (
                <AtlasSkeleton key={item} className="h-24" />
              ))}
            </div>
          ) : timelineGroups.length ? (
            timelineGroups.map((group) => (
              <section
                key={group.key}
                className="cc6-reveal"
                style={{
                  animationDelay: `${Math.min(group.offset, 10) * 40}ms`,
                }}
              >
                <header className="flex items-center gap-3 px-5 pb-1.5 pt-4">
                  <h3 className="cc6-eyebrow text-[#aab6ca]!">
                    {dayHeading(group.items[0].occurredAt, nowMs)}
                  </h3>
                  <span
                    className="cc6-hairline min-w-4 flex-1 self-center"
                    aria-hidden="true"
                  />
                  <span className="cc6-num text-[10px] text-[#6b7890]">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "registro" : "registros"}
                  </span>
                </header>
                <div>
                  {group.items.map((event, index) => {
                    const isToday =
                      Boolean(todayKey) && dayKey(event.occurredAt) === todayKey;
                    const rowClass = `cc6-reveal group flex items-start gap-4 px-5 py-3 transition-colors hover:bg-[rgba(75,141,248,0.04)] ${
                      index ? "cc6-hairline" : ""
                    }`;
                    const rowDelay = {
                      animationDelay: `${Math.min(group.offset + index + 1, 10) * 40}ms`,
                    };
                    const content = (
                      <>
                        <time
                          dateTime={event.occurredAt}
                          title={fullLabel(event.occurredAt)}
                          className="cc6-num w-16 shrink-0 pt-px text-right text-[11px] leading-6 text-[#6b7890]"
                        >
                          {isToday
                            ? relativeTime(event.occurredAt, nowMs)
                            : timeLabel(event.occurredAt)}
                        </time>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <strong className="text-sm font-medium leading-6 text-[#e8eef8]">
                              {event.title}
                            </strong>
                            <span className="cc6-chip text-[10px]!">
                              {activityCategoryLabels[event.category]}
                            </span>
                            {event.leadStatus ? (
                              <span className="cc6-num text-[10px] uppercase tracking-[0.12em] text-[#6b7890]">
                                {event.leadStatus.replaceAll("_", " ")}
                              </span>
                            ) : null}
                          </span>
                          {event.description ? (
                            <span className="mt-0.5 block max-w-[70ch] text-[13px] leading-relaxed text-[#aab6ca]">
                              {event.description}
                            </span>
                          ) : null}
                          <span className="mt-1 block text-[11px] leading-5 text-[#6b7890]">
                            {[event.leadName, event.actorName]
                              .filter(Boolean)
                              .join(" · ") || "Operação Atlas"}
                          </span>
                        </span>
                        {event.leadId ? (
                          <span className="shrink-0 self-center text-xs font-medium text-[#aab6ca] transition-colors group-hover:text-[color:var(--atlas-accent)]">
                            Lead 360 <span aria-hidden="true">→</span>
                          </span>
                        ) : null}
                      </>
                    );
                    return event.leadId ? (
                      <Link
                        key={event.id}
                        href={`/leads/${event.leadId}`}
                        className={rowClass}
                        style={rowDelay}
                      >
                        {content}
                      </Link>
                    ) : (
                      <article key={event.id} className={rowClass} style={rowDelay}>
                        {content}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <p className="cc6-hairline mt-2 px-5 py-6 text-sm text-[#6b7890]">
              {data?.events.length ? (
                <>
                  Nenhum registro neste recorte —{" "}
                  <button
                    type="button"
                    className="cursor-pointer font-medium text-[color:var(--atlas-accent)] hover:underline"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                      setPeriod("all");
                    }}
                  >
                    ver todo o histórico
                  </button>
                  .
                </>
              ) : (
                "Ainda sem movimentações — novos contatos e registros autorizados aparecerão aqui."
              )}
            </p>
          )}
        </div>

        <p className="cc6-hairline px-5 py-2.5 text-[10px] leading-4 text-[#6b7890]">
          Somente leitura · até 500 registros no escopo, respeitando
          organização, hierarquia e RLS · ordem cronológica, sem prioridade ou
          ação automática.
        </p>
      </section>
    </div>
  );
}
