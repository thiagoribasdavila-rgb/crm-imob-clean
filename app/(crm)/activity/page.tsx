"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  activityCategoryLabels,
  type ActivityCategory,
} from "@/lib/atlas/activity-timeline";
import {
  AtlasBadge,
  AtlasEmpty,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

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
  ["all", "Até 500 registros"],
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

const CATEGORY_TONES = {
  change: "info",
  contact: "success",
  transfer: "warning",
  ai: "violet",
  proposal: "info",
  external: "neutral",
} as const;

const dayKey = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

const dayLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));

const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState("connecting");

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

  const groups = useMemo(
    () =>
      visible.reduce<Record<string, { label: string; items: ActivityEvent[] }>>(
        (result, event) => {
          const key = dayKey(event.occurredAt);
          const group = result[key] ?? {
            label: dayLabel(event.occurredAt),
            items: [],
          };
          group.items.push(event);
          result[key] = group;
          return result;
        },
        {},
      ),
    [visible],
  );

  const recent = visible.slice(0, 3);
  const categoryCount = (key: CategoryFilter) =>
    key === "all" ? data?.summary.total ?? 0 : data?.counts[key] ?? 0;

  return (
    <div
      className="space-y-5 pb-10"
      data-evolution-phase="40"
      data-activity-layout="explain-first"
    >
      <section className="atlas-activity-hero" aria-labelledby="activity-title">
        <div className="atlas-activity-hero-copy">
          <div className="flex flex-wrap gap-2">
            <AtlasBadge tone="violet">FASE 40 · HISTÓRICO EXPLICÁVEL</AtlasBadge>
            <AtlasBadge tone="success">FONTE ÚNICA DO CRM</AtlasBadge>
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
                ? "ATUALIZAÇÃO AO VIVO"
                : live === "degraded"
                  ? "ATUALIZAÇÃO MANUAL"
                  : "CONECTANDO"}
            </AtlasBadge>
          </div>
          <h1 id="activity-title">O histórico que explica a operação</h1>
          <p>
            Contatos, movimentações, propostas e decisões permanecem em ordem
            cronológica. Encontre rapidamente o contexto antes de agir.
          </p>
          <div className="atlas-activity-hero-actions">
            <Link href="/leads" className="atlas-button-primary">
              Abrir carteira
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="atlas-button-secondary"
            >
              {loading ? "Atualizando…" : "Atualizar histórico"}
            </button>
          </div>
        </div>

        <div
          className="atlas-activity-signal-grid"
          aria-label="Resumo do histórico visível"
          aria-busy={loading}
        >
          <div className="atlas-activity-signal" data-tone="blue">
            <span>Hoje</span>
            <strong>{loading ? "—" : data?.summary.today ?? 0}</strong>
            <small>Registros no dia</small>
          </div>
          <div className="atlas-activity-signal" data-tone="green">
            <span>Contatos</span>
            <strong>{loading ? "—" : data?.summary.contacts ?? 0}</strong>
            <small>No histórico visível</small>
          </div>
          <div className="atlas-activity-signal" data-tone="violet">
            <span>Clientes</span>
            <strong>{loading ? "—" : data?.summary.leadsInMotion ?? 0}</strong>
            <small>Com movimentação registrada</small>
          </div>
          <div className="atlas-activity-signal" data-tone="amber">
            <span>Registros</span>
            <strong>{loading ? "—" : data?.summary.total ?? 0}</strong>
            <small>Últimos registros no seu escopo</small>
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

      <AtlasCard className="atlas-activity-recent-card">
        <AtlasCardHeader
          eyebrow="CONTEXTO RECENTE"
          title="Últimas movimentações registradas"
          description="Até três registros em ordem cronológica. A posição não representa score, risco ou previsão."
        />
        <div
          className="atlas-activity-recent-list"
          aria-live="polite"
          aria-busy={loading}
        >
          {loading ? (
            [1, 2, 3].map((item) => (
              <AtlasSkeleton key={item} className="h-20" />
            ))
          ) : recent.length ? (
            recent.map((event, index) => {
              const content = (
                <>
                  <span className="atlas-activity-recent-position">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="atlas-activity-recent-copy">
                    <small>
                      {activityCategoryLabels[event.category]} · {timeLabel(event.occurredAt)}
                    </small>
                    <strong>{event.title}</strong>
                    <span>
                      {event.leadName || "Operação Atlas"} · {event.actorName}
                    </span>
                  </span>
                  {event.leadId ? (
                    <span className="atlas-activity-recent-action">Abrir lead →</span>
                  ) : null}
                </>
              );
              return event.leadId ? (
                <Link
                  href={`/leads/${event.leadId}`}
                  key={event.id}
                  className="atlas-activity-recent-item"
                >
                  {content}
                </Link>
              ) : (
                <div key={event.id} className="atlas-activity-recent-item">
                  {content}
                </div>
              );
            })
          ) : (
            <div className="atlas-activity-recent-clear" role="status">
              <strong>Nenhuma movimentação neste recorte.</strong>
              <span>Altere os filtros ou consulte todo o histórico.</span>
            </div>
          )}
        </div>
      </AtlasCard>

      <AtlasCard className="atlas-activity-timeline-card">
        <AtlasCardHeader
          eyebrow="HISTÓRICO COMERCIAL"
          title="Linha do tempo pesquisável"
          description="Use período, categoria ou busca sem alterar os registros originais."
          action={
            query || category !== "all" || period !== "week" ? (
              <button
                type="button"
                className="atlas-button-secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                  setPeriod("week");
                }}
              >
                Limpar filtros
              </button>
            ) : null
          }
        />

        <div className="atlas-activity-controls">
          <label className="atlas-activity-search">
            <span>Buscar no histórico</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cliente, atividade ou responsável"
              type="search"
            />
          </label>
          <nav className="atlas-activity-periods" aria-label="Período do histórico">
            {PERIODS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                aria-pressed={period === key}
                className={period === key ? "is-active" : ""}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <nav className="atlas-activity-categories" aria-label="Categoria do histórico">
          {CATEGORIES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              aria-pressed={category === key}
              className={category === key ? "is-active" : ""}
            >
              <span>{label}</span>
              <strong>{categoryCount(key)}</strong>
            </button>
          ))}
        </nav>

        <div
          className="atlas-activity-timeline"
          aria-live="polite"
          aria-busy={loading}
        >
          {loading ? (
            [1, 2, 3].map((item) => (
              <AtlasSkeleton key={item} className="h-32" />
            ))
          ) : Object.keys(groups).length ? (
            Object.entries(groups).map(([date, group]) => (
              <section key={date} className="atlas-activity-day">
                <header>
                  <span aria-hidden="true" />
                  <h2>{group.label}</h2>
                  <small>
                    {group.items.length} {group.items.length === 1 ? "registro" : "registros"}
                  </small>
                </header>
                <div className="atlas-activity-day-items">
                  {group.items.map((event) => {
                    const content = (
                      <>
                        <time dateTime={event.occurredAt}>
                          {timeLabel(event.occurredAt)}
                        </time>
                        <span className="atlas-activity-event-copy">
                          <span className="flex flex-wrap items-center gap-2">
                            <AtlasBadge tone={CATEGORY_TONES[event.category]}>
                              {activityCategoryLabels[event.category]}
                            </AtlasBadge>
                            {event.leadStatus ? (
                              <span className="atlas-activity-status">
                                {event.leadStatus.replaceAll("_", " ")}
                              </span>
                            ) : null}
                          </span>
                          <strong>{event.title}</strong>
                          {event.description ? <p>{event.description}</p> : null}
                          <small>
                            {event.leadName || "Operação Atlas"} · {event.actorName}
                          </small>
                        </span>
                        {event.leadId ? (
                          <span className="atlas-activity-event-action">Lead 360 →</span>
                        ) : null}
                      </>
                    );
                    return event.leadId ? (
                      <Link
                        href={`/leads/${event.leadId}`}
                        key={event.id}
                        className="atlas-activity-event"
                      >
                        {content}
                      </Link>
                    ) : (
                      <article key={event.id} className="atlas-activity-event">
                        {content}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <AtlasEmpty
              reason={data?.events.length ? "no-results" : "no-activity"}
              eyebrow="Histórico preservado"
              title={data?.events.length ? "Nenhum registro encontrado" : "Ainda sem movimentações visíveis"}
              description={
                data?.events.length
                  ? "Altere o período, a categoria ou a busca para ampliar o recorte."
                  : "Novos contatos e movimentações autorizadas aparecerão aqui em ordem cronológica."
              }
              action={
                data?.events.length ? (
                  <button
                    type="button"
                    className="atlas-button-primary"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                      setPeriod("all");
                    }}
                  >
                    Ver todo o histórico
                  </button>
                ) : undefined
              }
            />
          )}
        </div>

        <details className="atlas-activity-source-details">
          <summary>Ver composição do histórico</summary>
          <div className="atlas-activity-source-grid">
            {(Object.keys(activityCategoryLabels) as ActivityCategory[]).map((key) => (
              <div key={key}>
                <span>{activityCategoryLabels[key]}</span>
                <strong>{loading ? "—" : data?.counts[key] ?? 0}</strong>
                <small>Registros visíveis desta categoria</small>
              </div>
            ))}
          </div>
        </details>
      </AtlasCard>

      <p className="atlas-activity-governance-note">
        O histórico é somente leitura nesta tela e respeita organização,
        hierarquia e RLS. A ordem é cronológica; nenhuma prioridade, decisão,
        mensagem ou ação é criada automaticamente.
      </p>
    </div>
  );
}
