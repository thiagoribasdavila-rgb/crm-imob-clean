"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AtlasBadge,
  AtlasEmpty,
  AtlasProgress,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

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

  const portfolioAbsorption = data?.portfolio.units
    ? Math.round((data.portfolio.sold / data.portfolio.units) * 100)
    : 0;
  const unavailableModules = Object.values(data?.moduleHealth ?? {}).filter(
    (status) => status === "unavailable" || status === "not-configured",
  ).length;

  return (
    <div
      className="space-y-6 pb-10"
      data-evolution-phase="42"
      data-projects-layout="decision-first"
      aria-busy={loading}
    >
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-violet-400/10 bg-gradient-to-br from-violet-500/[.13] via-blue-500/[.055] to-cyan-500/[.08] p-6 shadow-[0_34px_120px_rgba(2,8,23,.42)] sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.45fr_.8fr] xl:items-end">
          <div>
            <div className="flex flex-wrap gap-2">
              <AtlasBadge tone="violet">FASE 42 · PROJETOS</AtlasBadge>
              <AtlasBadge tone="success">DADOS REAIS</AtlasBadge>
              <AtlasBadge tone="info">INCORPORADORAS</AtlasBadge>
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">
              Veja onde o portfólio precisa de <span className="atlas-gradient-text">decisão comercial.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              Projeto, estoque, materiais vigentes e receita potencial reunidos sem misturar versões vencidas com o kit comercial atual.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/developments/registry" className="atlas-button-primary">Novo empreendimento</Link>
              <Link href="/developments/materials" className="atlas-button-secondary">Buscar materiais</Link>
              <details className="atlas-project-actions relative">
                <summary className="atlas-button-secondary cursor-pointer list-none">Mais gestão</summary>
                <div className="absolute left-0 top-[calc(100%+8px)] z-20 grid min-w-64 gap-1 rounded-2xl border border-white/10 bg-[#091121]/95 p-2 shadow-2xl backdrop-blur-xl">
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

          <div className="rounded-3xl border border-white/[0.08] bg-[#070d1b]/70 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="atlas-eyebrow">Sell-through observado</p>
                <p className="mt-2 text-xl font-semibold text-white">Absorção do portfólio</p>
              </div>
              <span className="text-3xl font-semibold text-emerald-300">{portfolioAbsorption}%</span>
            </div>
            <div className="mt-5"><AtlasProgress value={portfolioAbsorption} label="Unidades vendidas" /></div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                <p className="text-sm font-semibold text-white">{data?.portfolio.units ?? 0}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Unidades</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                <p className="text-sm font-semibold text-white">{data?.portfolio.reservations ?? 0}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Reservas</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                <p className="text-sm font-semibold text-white">{data?.portfolio.needsReview ?? 0}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Revisar</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div aria-live="polite">
        {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sinais do portfólio">
        <AtlasMetric label="Projetos visíveis" value={loading ? "—" : String(data?.developments.length ?? 0)} detail="No seu escopo autorizado" trend="PORTFÓLIO" tone="violet" />
        <AtlasMetric label="Unidades disponíveis" value={loading ? "—" : String(data?.portfolio.available ?? 0)} detail={`${data?.portfolio.units ?? 0} unidades conectadas`} trend="ESTOQUE" tone="blue" />
        <AtlasMetric label="Kits comerciais completos" value={loading ? "—" : String(data?.portfolio.completeMaterialKits ?? 0)} detail="Book, tabela e espelho vigentes" trend="MATERIAIS" tone="green" />
        <AtlasMetric label="Projetos para revisar" value={loading ? "—" : String(data?.portfolio.needsReview ?? 0)} detail="Pendências observadas, não previsão" trend="AÇÃO" tone="amber" />
      </section>

      {(data?.priorities.length ?? 0) > 0 ? (
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Revisão humana"
            title="Até três decisões objetivas"
            description="Ordenação explicável por vigência de material, cobertura do kit, validação e estoque. Nenhuma alteração é executada automaticamente."
          />
          <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-3">
            {data?.priorities.map((priority) => (
              <Link
                key={`${priority.developmentId}-${priority.label}`}
                href={`/developments/${priority.developmentId}`}
                className="atlas-project-priority"
              >
                <div className="flex items-center justify-between gap-3">
                  <AtlasBadge tone={priority.tone}>{priority.label}</AtlasBadge>
                  <span aria-hidden="true">→</span>
                </div>
                <p className="mt-4 font-semibold text-white">{priority.developmentName}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{priority.detail}</p>
              </Link>
            ))}
          </div>
        </AtlasCard>
      ) : null}

      <details className="atlas-project-health rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-white">
          <span>Saúde das conexões do portfólio</span>
          <span className="text-xs text-slate-500">{unavailableModules ? `${unavailableModules} para preparar` : "Tudo conectado"}</span>
        </summary>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
          {Object.entries(data?.moduleHealth ?? {}).map(([module, status]) => {
            const copy = moduleCopy(status);
            return <AtlasBadge key={module} tone={copy.tone}>{moduleLabels[module] || module}: {copy.label}</AtlasBadge>;
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Um módulo opcional indisponível não derruba os demais. O Atlas mantém visível somente o que foi carregado com segurança.</p>
      </details>

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Decisão por projeto"
          title="Onde agir no portfólio"
          description="Encontre um empreendimento e veja cadastro, estoque, kit comercial e resultado observado antes de decidir."
        />
        <div className="border-b border-white/[0.06] p-5 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="block lg:max-w-md lg:flex-1">
              <span className="sr-only">Buscar empreendimento</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar projeto, incorporadora ou região"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-base text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30 sm:text-sm"
              />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtros do portfólio">
              {segments.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={segment === item.id}
                  onClick={() => setSegment(item.id)}
                  className="atlas-project-segment"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => <AtlasSkeleton key={item} className="h-80 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <AtlasEmpty
              reason={(data?.developments.length ?? 0) > 0 ? "no-results" : "first-use"}
              eyebrow={(data?.developments.length ?? 0) > 0 ? "Busca sem correspondência" : "Portfólio ainda vazio"}
              title="Nenhum empreendimento encontrado"
              description={(data?.developments.length ?? 0) > 0
                ? "Nenhum projeto corresponde à busca e ao filtro atual. Limpe os filtros para recuperar o portfólio."
                : "Cadastre o primeiro empreendimento para reunir estoque, materiais, leads e VGV."}
              action={(data?.developments.length ?? 0) > 0
                ? <button type="button" className="atlas-button-secondary" onClick={() => { setQuery(""); setSegment("all"); }}>Limpar filtros</button>
                : <Link href="/developments/registry" className="atlas-button-primary">Cadastrar empreendimento</Link>}
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((item) => {
                const metrics = item.metrics;
                return (
                  <article key={item.id} className="atlas-project-card">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">{item.developer_name || "Incorporadora não informada"}</p>
                        <h2 className="mt-2 truncate text-xl font-semibold text-white">{item.name}</h2>
                        <p className="mt-2 truncate text-sm text-slate-400">{[item.neighborhood, item.city, item.state].filter(Boolean).join(" · ") || "Localização não informada"}</p>
                      </div>
                      <AtlasBadge tone={statusTone(item.status)}>{item.status}</AtlasBadge>
                    </div>

                    {item.readiness.priority ? (
                      <div className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[0.045] px-3 py-2.5">
                        <p className="text-xs font-semibold text-amber-200">{item.readiness.priority.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.readiness.priority.detail}</p>
                      </div>
                    ) : null}

                    <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-lg font-semibold text-white">{metrics.inventoryTotal}</p><p className="text-[10px] uppercase text-slate-500">Unidades</p></div>
                      <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-lg font-semibold text-emerald-300">{metrics.sold}</p><p className="text-[10px] uppercase text-slate-500">Vendidas</p></div>
                      <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-lg font-semibold text-sky-300">{metrics.available}</p><p className="text-[10px] uppercase text-slate-500">Disponíveis</p></div>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <AtlasProgress value={metrics.absorption} label="Absorção" />
                      <AtlasProgress value={item.readiness.materialCoverage} label="Kit comercial" />
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-xs text-slate-500">VGV observado</p><p className="mt-1 font-semibold text-white">{brl.format(metrics.totalVgv)}</p></div>
                      <div><p className="text-xs text-slate-500">Receita provável</p><p className="mt-1 font-semibold text-white">{brl.format(metrics.forecast)}</p></div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                      <span className="truncate text-xs text-slate-500">Entrega {item.delivery_date ? new Date(item.delivery_date).toLocaleDateString("pt-BR") : "a definir"}</span>
                      <Link href={`/developments/${item.id}`} className="shrink-0 text-xs font-semibold text-sky-300">Abrir projeto →</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </AtlasCard>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Resumo financeiro do portfólio">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <p className="atlas-eyebrow">Valor observado</p>
          <p className="mt-3 text-2xl font-semibold text-white">{brl.format(data?.portfolio.totalVgv ?? 0)}</p>
          <p className="mt-2 text-sm text-slate-500">VGV das unidades efetivamente conectadas ao portfólio.</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <p className="atlas-eyebrow">Receita em negociação</p>
          <p className="mt-3 text-2xl font-semibold text-white">{brl.format(data?.portfolio.pipeline ?? 0)}</p>
          <p className="mt-2 text-sm text-slate-500">Soma das oportunidades visíveis; previsão não garante fechamento.</p>
        </div>
      </section>

      <p className="text-xs leading-5 text-slate-600">
        A tela é somente leitura. Materiais pendentes, rejeitados ou vencidos não entram como kit comercial válido; qualquer correção exige ação humana nas áreas próprias.
      </p>
    </div>
  );
}
