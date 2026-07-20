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
import {
  AtlasEmpty,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
import { AtlasMetric } from "@/components/ui/AtlasCard";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Metrics = {
  inventoryTotal: number;
  available: number;
  sold: number;
  reserved: number;
  totalVgv: number;
  soldVgv: number;
  absorption: number;
  pipeline: number;
  forecast: number;
  opportunities: number;
  campaignSpend: number;
  campaignRevenue: number;
  campaignLeads: number;
  cpl: number;
  roi: number;
  activeReservations: number;
};

type Priority = {
  rank: number;
  label: string;
  detail: string;
  tone: "danger" | "warning" | "info";
};

type Development = {
  id: string;
  name: string;
  developer_name: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  status: string;
  delivery_date: string | null;
  launch_date?: string | null;
  readiness: {
    materialCoverage: number;
    availableMaterialTypes: string[];
    expiredMaterials: number;
    pendingMaterials: number;
    priority: Priority | null;
  };
  metrics: Metrics;
};

type ModuleStatus = "connected" | "legacy" | "not-configured" | "unavailable";

type Payload = {
  portfolio: {
    totalVgv: number;
    soldVgv: number;
    pipeline: number;
    forecast: number;
    units: number;
    available: number;
    sold: number;
    reservations: number;
    completeMaterialKits: number;
    needsReview: number;
  };
  developments: Development[];
  priorities: Array<Priority & { developmentId: string; developmentName: string }>;
  moduleHealth: Record<string, ModuleStatus>;
  compatibility: string;
  generatedAt: string;
};

type Segment = "all" | "attention" | "active" | "complete";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const segments: Array<{ id: Segment; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "attention", label: "Revisar" },
  { id: "active", label: "Com estoque" },
  { id: "complete", label: "Kit completo" },
];

const moduleLabels: Record<string, string> = {
  portfolio: "Portfólio",
  inventory: "Estoque",
  pipeline: "Pipeline",
  marketing: "Marketing",
  reservations: "Reservas",
  intelligence: "Inteligência",
  materials: "Materiais",
};

/* CC-6: anel de foco padrão do repositório e semânticos por significado. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const priorityBand: Record<Priority["tone"], string> = {
  danger: "#fb7185",
  warning: "#f5b544",
  info: "var(--atlas-accent)",
};
const priorityInk: Record<Priority["tone"], string> = {
  danger: "cc6-crit",
  warning: "cc6-warn",
  info: "text-[#aab6ca]",
};

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" | "violet" {
  const value = status.toLowerCase();
  if (["lançado", "lancado", "ativo", "vendas"].includes(value)) return "success";
  if (["pré-lançamento", "pre-lancamento", "planejamento"].includes(value)) return "violet";
  if (["pausado", "suspenso"].includes(value)) return "warning";
  if (["encerrado", "cancelado"].includes(value)) return "danger";
  return "info";
}

function moduleCopy(status: ModuleStatus) {
  if (status === "connected") return { label: "Conectado", tone: "success" as const };
  if (status === "legacy") return { label: "Compatível", tone: "info" as const };
  if (status === "not-configured") return { label: "Preparar", tone: "warning" as const };
  return { label: "Revisar", tone: "danger" as const };
}

/* Barra CC-6: profundidade por geometria (trilho hairline + preenchimento),
   percentual mono ao lado do rótulo — zero glow. */
function CoverageBar({ label, value, fill }: { label: string; value: number; fill: string }) {
  const safe = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="cc6-metric-label truncate">{label}</span>
        <span className="cc6-num text-[12px] text-[#aab6ca]">{safe}%</span>
      </div>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
      >
        <div className="h-full rounded-full" style={{ width: `${safe}%`, background: fill }} />
      </div>
    </div>
  );
}

export default function DevelopmentsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sua sessão expirou. Entre novamente para acessar o portfólio.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/v1/launch-os", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError("O portfólio não pôde ser atualizado agora. Os dados permanecem protegidos.");
      } else {
        setData(payload as Payload);
      }
    } catch {
      setError("Não foi possível conectar aos projetos. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const developer = new URLSearchParams(window.location.search).get("developer");
    if (developer) setQuery(developer);
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.developments ?? []).filter((item) => {
      const matchesQuery = !normalizedQuery || [
        item.name,
        item.developer_name,
        item.neighborhood,
        item.city,
        item.status,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery));
      const matchesSegment = segment === "all"
        || (segment === "attention" && Boolean(item.readiness.priority))
        || (segment === "active" && item.metrics.inventoryTotal > 0)
        || (segment === "complete" && item.readiness.materialCoverage === 100);
      return matchesQuery && matchesSegment;
    });
  }, [data, query, segment]);

  const segmentCounts = useMemo(() => {
    const items = data?.developments ?? [];
    return {
      all: items.length,
      attention: items.filter((item) => Boolean(item.readiness.priority)).length,
      active: items.filter((item) => item.metrics.inventoryTotal > 0).length,
      complete: items.filter((item) => item.readiness.materialCoverage === 100).length,
    } satisfies Record<Segment, number>;
  }, [data]);

  const portfolioAbsorption = data?.portfolio.units
    ? Math.round((data.portfolio.sold / data.portfolio.units) * 100)
    : 0;
  const unavailableModules = Object.values(data?.moduleHealth ?? {}).filter(
    (status) => status === "unavailable" || status === "not-configured",
  ).length;

  return (
    <div
      className="space-y-4 pb-10"
      data-evolution-phase="42"
      data-projects-layout="decision-first"
      aria-busy={loading}
    >
      {/* Herói CC-6 (única superfície com 3D): identidade + ações + absorção +
          régua financeira em um só painel. Consolida o hero antigo, os
          contadores repetidos e a seção "Resumo financeiro" do rodapé. */}
      <section aria-label="Resumo do portfólio e ações principais">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="cc6-eyebrow">FASE 42 · PROJETOS</p>
              <h1 className="mt-2 max-w-2xl text-2xl font-semibold tracking-[-0.02em] text-[#e8eef8] sm:text-[27px] sm:leading-9">
                Veja onde o portfólio precisa de decisão comercial.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#aab6ca]">
                Projeto, estoque, kit comercial vigente e receita potencial em uma única leitura.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href="/developments/registry" className="atlas-button-primary">+ Novo empreendimento</Link>
                <Link href="/developments/materials" className="cc6-ghost-btn min-h-11">Buscar materiais</Link>
                <details className="atlas-project-actions relative">
                  <summary className={`cc6-ghost-btn min-h-11 cursor-pointer list-none ${focusRing}`}>Mais gestão</summary>
                  <div className="absolute left-0 top-[calc(100%+8px)] z-20 grid min-w-64 gap-1 rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224]/95 p-2 backdrop-blur">
                    <Link href="/developments/homologation">Homologar projetos</Link>
                    <Link href="/developments/developers">Incorporadoras</Link>
                    <Link href="/developments/payment-rules">Fluxos de pagamento</Link>
                    <Link href="/properties">Estoque e unidades</Link>
                    <Link href="/marketing">Marketing do portfólio</Link>
                    <button type="button" onClick={() => void load()}>Atualizar dados</button>
                  </div>
                </details>
              </div>
            </div>
            <div className="shrink-0 lg:w-60 lg:pl-6">
              <p className="cc6-eyebrow">Absorção do portfólio</p>
              <p className="cc6-metric-value mt-1 text-4xl leading-none">
                {loading ? "—" : `${portfolioAbsorption}%`}
              </p>
              <div
                className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]"
                role="progressbar"
                aria-label="Unidades vendidas"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={portfolioAbsorption}
              >
                <div
                  className="h-full rounded-full bg-[color:var(--atlas-accent)]"
                  style={{ width: `${portfolioAbsorption}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-[#6b7890]">
                <span className="cc6-num">{data?.portfolio.sold ?? 0}</span> de{" "}
                <span className="cc6-num">{data?.portfolio.units ?? 0}</span> unidades vendidas
              </p>
            </div>
          </div>
          <div className="cc6-hairline mt-5 grid grid-cols-1 gap-x-6 gap-y-3 pt-4 sm:grid-cols-3">
            <div title="Reservas ativas registradas no portfólio.">
              <p className="cc6-num text-[15px] text-[#e8eef8]">{loading ? "—" : data?.portfolio.reservations ?? 0}</p>
              <p className="cc6-metric-label mt-0.5">Reservas ativas</p>
            </div>
            <div title="VGV das unidades efetivamente conectadas ao portfólio.">
              <p className="cc6-num text-[15px] text-[#e8eef8]">{loading ? "—" : brl.format(data?.portfolio.totalVgv ?? 0)}</p>
              <p className="cc6-metric-label mt-0.5">VGV observado</p>
            </div>
            <div title="Soma das oportunidades visíveis; previsão não garante fechamento.">
              <p className="cc6-num text-[15px] text-[#e8eef8]">{loading ? "—" : brl.format(data?.portfolio.pipeline ?? 0)}</p>
              <p className="cc6-metric-label mt-0.5">Em negociação</p>
            </div>
          </div>
        </TiltShell>
      </section>

      <div aria-live="polite">
        {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
      </div>

      <section
        className="cc6-reveal grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        style={{ animationDelay: "60ms" }}
        aria-label="Sinais do portfólio"
      >
        <AtlasMetric label="Projetos visíveis" value={loading ? "—" : String(data?.developments.length ?? 0)} detail="No seu escopo autorizado" trend="PORTFÓLIO" tone="violet" />
        <AtlasMetric label="Unidades disponíveis" value={loading ? "—" : String(data?.portfolio.available ?? 0)} detail={`${data?.portfolio.units ?? 0} unidades conectadas`} trend="ESTOQUE" tone="blue" />
        <AtlasMetric label="Kits comerciais completos" value={loading ? "—" : String(data?.portfolio.completeMaterialKits ?? 0)} detail="Book, tabela e espelho vigentes" trend="MATERIAIS" tone="green" />
        <AtlasMetric label="Projetos para revisar" value={loading ? "—" : String(data?.portfolio.needsReview ?? 0)} detail="Pendências observadas, não previsão" trend="AÇÃO" tone="amber" />
      </section>

      {(data?.priorities.length ?? 0) > 0 ? (
        <section
          className="cc6-panel cc6-reveal p-4 sm:p-5"
          style={{ animationDelay: "100ms" }}
          aria-labelledby="atlas-projects-priorities-title"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="cc6-eyebrow">Revisão humana</p>
              <h2
                id="atlas-projects-priorities-title"
                className="mt-1 text-sm font-semibold tracking-tight text-[#e8eef8]"
              >
                Até três decisões objetivas
              </h2>
            </div>
            <span className="cc6-chip">{data?.priorities.length ?? 0} de até 3</span>
          </header>
          <p className="mt-1 text-xs leading-5 text-[#6b7890]">
            Ordenação explicável por vigência de material, cobertura do kit, validação e estoque. Nenhuma alteração é executada automaticamente.
          </p>
          <div className="mt-3 grid gap-2">
            {data?.priorities.map((priority, index) => (
              <Link
                key={`${priority.developmentId}-${priority.label}`}
                href={`/developments/${priority.developmentId}`}
                className={`cc6-sev-band cc6-panel-quiet cc6-reveal group flex items-center gap-3 py-3 pl-4 pr-3 transition-colors hover:border-[rgba(148,163,184,0.22)]! ${focusRing}`}
                style={{
                  animationDelay: `${120 + index * 45}ms`,
                  "--cc6-sev": priorityBand[priority.tone],
                } as CSSProperties}
              >
                <span className="cc6-num pt-0.5 text-xs text-[#6b7890]" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-[13px] font-semibold text-[#e8eef8]">{priority.developmentName}</strong>
                    <StatusBadge tone={priority.tone}>{priority.label}</StatusBadge>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[#aab6ca]">{priority.detail}</span>
                </span>
                <span
                  aria-hidden="true"
                  className="text-[#6b7890] transition-colors group-hover:text-[color:var(--atlas-accent-hover)]"
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <details
        className="atlas-project-health cc6-panel-quiet cc6-reveal px-4 py-2.5"
        style={{ animationDelay: "130ms" }}
      >
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-sm font-medium text-[#e8eef8] ${focusRing}`}>
          <span>Saúde das conexões do portfólio</span>
          <span className="cc6-num text-xs text-[#6b7890]">
            {unavailableModules ? `${unavailableModules} para preparar` : "Tudo conectado"}
          </span>
        </summary>
        <div className="cc6-hairline mt-2 flex flex-wrap gap-2 pt-3">
          {Object.entries(data?.moduleHealth ?? {}).map(([module, status]) => {
            const copy = moduleCopy(status);
            return <StatusBadge key={module} tone={copy.tone}>{moduleLabels[module] || module}: {copy.label}</StatusBadge>;
          })}
        </div>
        <p className="mt-3 pb-1 text-xs leading-5 text-[#6b7890]">
          Um módulo opcional indisponível não derruba os demais. O Atlas mantém visível somente o que foi carregado com segurança.
        </p>
      </details>

      <section
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "160ms" }}
        aria-labelledby="atlas-projects-directory-title"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4 sm:p-6 sm:pb-4">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Decisão por projeto</p>
            <h2
              id="atlas-projects-directory-title"
              className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
            >
              Onde agir no portfólio
            </h2>
          </div>
          <span className="cc6-chip" title="Projetos exibidos com a busca e o filtro atuais.">
            {loading ? "sincronizando" : `${filtered.length} de ${data?.developments.length ?? 0}`}
          </span>
        </header>

        <div className="cc6-hairline flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <label className="block lg:max-w-md lg:flex-1">
            <span className="sr-only">Buscar empreendimento</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar projeto, incorporadora ou região"
              className={`min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] px-4 text-base text-[#e8eef8] transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] sm:text-sm ${focusRing}`}
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtros do portfólio">
            {segments.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={segment === item.id}
                onClick={() => setSegment(item.id)}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-[12px] font-medium transition-colors ${
                  segment === item.id
                    ? "border-[rgba(75,141,248,0.45)] bg-[rgba(75,141,248,0.08)] text-[#e8eef8]"
                    : "border-[rgba(148,163,184,0.14)] bg-white/[0.02] text-[#aab6ca] hover:border-[rgba(148,163,184,0.3)] hover:text-[#e8eef8]"
                } ${focusRing}`}
              >
                <span>{item.label}</span>
                <span className={`cc6-num text-[12px] ${segment === item.id ? "text-[#e8eef8]" : "text-[#6b7890]"}`}>
                  {loading ? "—" : segmentCounts[item.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="cc6-hairline p-5 sm:p-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => <AtlasSkeleton key={item} className="h-64 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <AtlasEmpty
              reason={(data?.developments.length ?? 0) > 0 ? "no-results" : "first-use"}
              eyebrow={(data?.developments.length ?? 0) > 0 ? "Busca sem correspondência" : "Portfólio ainda vazio"}
              title="Nenhum empreendimento encontrado"
              description={(data?.developments.length ?? 0) > 0
                ? "Nenhum projeto corresponde à busca e ao filtro atuais."
                : "Cadastre o primeiro empreendimento para reunir estoque, materiais, leads e VGV."}
              action={(data?.developments.length ?? 0) > 0
                ? <button type="button" className="atlas-button-secondary" onClick={() => { setQuery(""); setSegment("all"); }}>Limpar filtros</button>
                : <Link href="/developments/registry" className="atlas-button-primary">Cadastrar empreendimento</Link>}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((item, index) => {
                const metrics = item.metrics;
                const priority = item.readiness.priority;
                const kitComplete = item.readiness.materialCoverage === 100;
                const place = [item.developer_name, item.neighborhood, item.city, item.state]
                  .filter(Boolean)
                  .join(" · ") || "Localização não informada";
                const delivery = item.delivery_date
                  ? new Date(item.delivery_date).toLocaleDateString("pt-BR")
                  : "a definir";
                return (
                  <article
                    key={item.id}
                    className={`cc6-panel-quiet cc6-reveal flex flex-col gap-4 p-4 transition-colors hover:border-[rgba(148,163,184,0.22)]! focus-within:border-[rgba(148,163,184,0.22)]! ${priority ? "cc6-sev-band pl-5" : ""}`}
                    style={{
                      animationDelay: `${Math.min(index, 8) * 45}ms`,
                      ...(priority ? { "--cc6-sev": priorityBand[priority.tone] } : null),
                    } as CSSProperties}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold tracking-tight text-[#e8eef8]" title={item.name}>
                          {item.name}
                        </h3>
                        <p className="mt-1 truncate font-mono text-[11px] text-[#6b7890]" title={place}>
                          {place}
                        </p>
                      </div>
                      <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                    </div>

                    {priority ? (
                      <p className="-mt-1 truncate text-[12px] leading-5" title={`${priority.label} — ${priority.detail}`}>
                        <span className={`font-medium ${priorityInk[priority.tone]}`}>{priority.label}</span>
                        <span className="text-[#6b7890]"> · {priority.detail}</span>
                      </p>
                    ) : null}

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="cc6-num text-lg leading-6 text-[#e8eef8]">{metrics.inventoryTotal}</p>
                        <p className="cc6-metric-label">Unidades</p>
                      </div>
                      <div>
                        <p className="cc6-num cc6-ok text-lg leading-6">{metrics.sold}</p>
                        <p className="cc6-metric-label">Vendidas</p>
                      </div>
                      <div>
                        <p className="cc6-num text-lg leading-6 text-[color:var(--atlas-accent-hover)]">{metrics.available}</p>
                        <p className="cc6-metric-label">Disponíveis</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <CoverageBar label="Absorção" value={metrics.absorption} fill="var(--atlas-accent)" />
                      <CoverageBar
                        label="Kit comercial"
                        value={item.readiness.materialCoverage}
                        fill={kitComplete ? "#34d399" : "#f5b544"}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="cc6-metric-label">VGV observado</p>
                        <p className="cc6-num mt-0.5 text-[13px] text-[#e8eef8]">{brl.format(metrics.totalVgv)}</p>
                      </div>
                      <div title="Previsão não garante fechamento.">
                        <p className="cc6-metric-label">Receita provável</p>
                        <p className="cc6-num mt-0.5 text-[13px] text-[#e8eef8]">{brl.format(metrics.forecast)}</p>
                      </div>
                    </div>

                    <div className="cc6-hairline mt-auto flex items-center justify-between gap-3 pt-3">
                      <span className="cc6-num truncate text-[11px] text-[#6b7890]">Entrega · {delivery}</span>
                      <Link
                        href={`/developments/${item.id}`}
                        aria-label={`Abrir projeto ${item.name}`}
                        className={`shrink-0 rounded-md text-[12px] font-semibold text-[color:var(--atlas-accent-hover)] transition-colors hover:text-[#e8eef8] ${focusRing}`}
                      >
                        Abrir projeto →
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <p className="text-[11px] leading-5 text-[#6b7890]">
        A tela é somente leitura. Materiais pendentes, rejeitados ou vencidos não entram como kit comercial válido; qualquer correção exige ação humana nas áreas próprias.
      </p>
    </div>
  );
}
