"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { CopilotContextAction } from "@/components/atlas/copilot-context-action";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Relationship = "active" | "won" | "external" | "closed";
type Segment = "all" | Relationship;
type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  relationship: Relationship;
  purpose: string | null;
  temperature: string | null;
  score: number;
  budgetMin: number | null;
  budgetMax: number | null;
  ownerName: string | null;
  developmentName: string | null;
  lastInteractionAt: string | null;
  nextActionAt: string | null;
  updatedAt: string | null;
  contextGaps: string[];
};
type CustomerData = {
  scope: { coldReactivationBaseExcluded: boolean; hierarchicalRls: boolean };
  summary: {
    total: number;
    analyzed: number;
    active: number;
    won: number;
    external: number;
    closed: number;
    contactable: number;
    needsAction: number;
    coverageComplete: boolean;
  };
  priorities: Array<{
    label: string;
    detail: string;
    tone: "danger" | "warning" | "info";
    customer: Customer;
  }>;
  items: Customer[];
  page: { number: number; limit: number; total: number; pages: number };
  generatedAt: string;
};

/* CC-6: fonte única de rótulo e tom por vínculo. Filtros de segmento, badges
   das linhas e contagens derivam daqui — antes o mesmo vínculo tinha um rótulo
   no filtro, outro no badge e um terceiro no cartão de resumo. */
const RELATIONSHIPS: Record<
  Relationship,
  { label: string; tone: "info" | "success" | "violet" | "neutral" }
> = {
  active: { label: "Em atendimento", tone: "info" },
  won: { label: "Compra concluída", tone: "success" },
  external: { label: "Compra externa", tone: "violet" },
  closed: { label: "Encerrado", tone: "neutral" },
};
const SEGMENT_ORDER = [
  "all",
  "active",
  "won",
  "external",
  "closed",
] as const satisfies readonly Segment[];

const gapLabels: Record<string, string> = {
  contact: "Contato",
  project: "Projeto",
  purpose: "Objetivo",
  budget: "Faixa",
  next_action: "Próxima ação",
};

/* Anel de foco e chip-botão padrão CC-6 (mesma receita do Lead 360). */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const chipButtonClass = `cc6-chip cursor-pointer transition-colors hover:border-[color:var(--atlas-accent)] hover:text-[#e8eef8] ${focusRing}`;
const priorityBand: Record<"danger" | "warning" | "info", string> = {
  danger: "#fb7185",
  warning: "#f5b544",
  info: "var(--atlas-accent)",
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function dateLabel(value: string | null) {
  if (!value) return "Ainda não registrado";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Ainda não registrado";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function nextActionLabel(value: string | null, generatedAt: string) {
  if (!value) return { label: "Definir próxima ação", overdue: false };
  const due = new Date(value);
  const reference = new Date(generatedAt);
  if (!Number.isFinite(due.getTime()) || !Number.isFinite(reference.getTime())) {
    return { label: "Definir próxima ação", overdue: false };
  }
  return {
    label: `${due.getTime() < reference.getTime() ? "Vencida" : "Agendada"} · ${dateLabel(value)}`,
    overdue: due.getTime() < reference.getTime(),
  };
}

/* Sem valor não há linha: a ausência é anunciada uma única vez pelo chip
   "completar" (contextGaps), nunca por placeholder repetido por linha. */
function budgetLabel(customer: Customer) {
  if (customer.budgetMin && customer.budgetMax) return `${money.format(customer.budgetMin)} – ${money.format(customer.budgetMax)}`;
  if (customer.budgetMax) return `Até ${money.format(customer.budgetMax)}`;
  if (customer.budgetMin) return `A partir de ${money.format(customer.budgetMin)}`;
  return null;
}

export default function CustomersPage() {
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("active");
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);

  const sessionToken = useCallback(async () => {
    const session = await supabase.auth.getSession();
    return session.data.session?.access_token || "";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25", segment });
      if (debouncedQuery) params.set("q", debouncedQuery);
      const response = await fetch(`/api/v1/customers?${params}`, {
        headers: { Authorization: `Bearer ${await sessionToken()}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setData(body.data || body);
      setError("");
    } catch {
      setError("Não foi possível atualizar a visão unificada de relacionamentos.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page, segment, sessionToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query.trim());
    }, 320);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyContact(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
    } catch {
      /* Clipboard indisponível: o valor permanece legível no próprio chip. */
    }
  }

  function resetFilters() {
    setQuery("");
    setSegment("all");
    setPage(1);
  }

  const summary = data?.summary;
  const hasFilters = Boolean(query) || segment !== "all";

  return (
    <div
      className="space-y-4 pb-10"
      data-evolution-phase="41"
      data-customers-layout="relationship-first"
    >
      {/* Herói CC-6 (única superfície com 3D): identidade + ações + total do
          escopo. As demais contagens vivem nos filtros de segmento abaixo. */}
      <section aria-labelledby="customer-title">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="cc6-eyebrow">CRM · Clientes 360</p>
              <h1
                id="customer-title"
                className="mt-2 max-w-xl text-2xl font-semibold tracking-[-0.02em] text-[#e8eef8] sm:text-[27px] sm:leading-9"
              >
                Cada cliente com contexto para o próximo atendimento
              </h1>
              <p className="mt-2 max-w-xl text-[13px] leading-6 text-[#aab6ca]">
                Vínculo, projeto, objetivo e próximo passo em uma leitura única — sem duplicar
                cadastro, histórico ou responsabilidade do lead.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href="/leads/new" className="atlas-button-primary">
                  Novo cliente
                </Link>
                <Link href="/leads" className="cc6-ghost-btn min-h-11">
                  Abrir carteira
                </Link>
                <CopilotContextAction
                  label="✦ Priorizar carteira"
                  prompt="Revise minha carteira autorizada e prepare uma lista curta dos relacionamentos que mais precisam de ação hoje, explicando o motivo sem executar alterações."
                  context={{
                    source: "customers_360",
                    workspace: "customers",
                    contextLabel: "Clientes 360",
                    returnHref: "/customers",
                  }}
                  className="cc6-ghost-btn min-h-11"
                />
              </div>
            </div>
            <div
              className="shrink-0 lg:pl-6 lg:text-right"
              aria-label="Resumo dos relacionamentos autorizados"
              aria-busy={loading}
            >
              <p className="cc6-eyebrow">Relacionamentos visíveis</p>
              <p className="cc6-metric-value mt-1 text-4xl leading-none">
                {loading ? "—" : summary?.total ?? 0}
              </p>
              <p
                className="cc6-metric-label mt-2"
                title="Relacionamentos ativos sem agenda definida ou com prazo vencido"
              >
                {loading ? (
                  "sincronizando o escopo comercial"
                ) : (summary?.needsAction ?? 0) > 0 ? (
                  <>
                    <span className="cc6-num cc6-warn">{summary?.needsAction}</span> exigem próxima
                    ação
                  </>
                ) : (
                  "agenda de próximas ações em dia"
                )}
              </p>
            </div>
          </div>
        </TiltShell>
      </section>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}

      <section
        className="cc6-panel cc6-reveal p-4 sm:p-5"
        style={{ animationDelay: "70ms" }}
        aria-labelledby="customers-priorities-title"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="customers-priorities-title"
            className="text-sm font-semibold tracking-tight text-[#e8eef8]"
          >
            Relacionamentos que pedem revisão
          </h2>
          {loading && !data ? (
            <span className="cc6-chip">sincronizando</span>
          ) : data?.priorities.length ? (
            <span
              className="cc6-chip"
              title="Até três situações objetivas, ordenadas por prazo e ausência de próximo passo — não por previsão da IA. A revisão é sempre humana."
            >
              {data.priorities.length} para revisar
            </span>
          ) : null}
        </header>
        {loading && !data ? (
          <div className="mt-3 grid gap-2">
            {[1, 2, 3].map((item) => (
              <AtlasSkeleton className="h-16" key={item} />
            ))}
          </div>
        ) : data?.priorities.length ? (
          <div className="mt-3 grid gap-2">
            {data.priorities.map((priority, index) => (
              <article
                key={priority.customer.id}
                data-tone={priority.tone}
                className="cc6-sev-band cc6-panel-quiet flex flex-col gap-1.5 py-3 pl-4 pr-3"
                style={{ "--cc6-sev": priorityBand[priority.tone] } as CSSProperties}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="cc6-num text-xs text-[#6b7890]" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Link
                    href={`/leads/${priority.customer.id}`}
                    className={`rounded-md text-[13px] font-semibold text-[#e8eef8] transition-colors hover:text-[color:var(--atlas-accent-hover)] ${focusRing}`}
                  >
                    {priority.customer.name}
                  </Link>
                  <StatusBadge tone={priority.tone}>{priority.label}</StatusBadge>
                </div>
                <p className="pl-7 text-xs leading-5 text-[#aab6ca]">{priority.detail}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs leading-5 text-[#6b7890]">
            Nenhuma pendência objetiva nos registros analisados — registre a próxima ação para
            manter o contexto comercial utilizável.
          </p>
        )}
      </section>

      <section
        className="cc6-panel cc6-reveal p-4 sm:p-5"
        style={{ animationDelay: "140ms" }}
        aria-labelledby="customers-list-title"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="customers-list-title"
            className="text-sm font-semibold tracking-tight text-[#e8eef8]"
          >
            Carteira pesquisável
          </h2>
          {loading && !data ? (
            <span className="cc6-chip">sincronizando</span>
          ) : data ? (
            <span
              className="cc6-chip"
              title="Total de relacionamentos neste recorte de busca e vínculo"
            >
              {data.page.total} no recorte
            </span>
          ) : null}
        </header>

        <div className="mt-3 flex flex-col gap-2 xl:flex-row xl:items-center">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.02] px-3 transition-colors focus-within:border-[color:var(--atlas-accent)]">
            <span aria-hidden="true" className="text-[color:var(--atlas-accent)]">
              ⌕
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, telefone, e-mail, origem ou status"
              aria-label="Buscar cliente"
              className="w-full bg-transparent text-sm text-[#e8eef8] placeholder:text-[#6b7890] focus:outline-hidden"
            />
          </label>
          <div role="group" aria-label="Filtrar por vínculo" className="flex flex-wrap gap-2">
            {SEGMENT_ORDER.map((value) => {
              const active = segment === value;
              const count = summary ? (value === "all" ? summary.total : summary[value]) : null;
              return (
                <button
                  type="button"
                  key={value}
                  aria-pressed={active}
                  onClick={() => {
                    setSegment(value);
                    setPage(1);
                  }}
                  className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-[11.5px] font-medium transition-colors ${
                    active
                      ? "border-[rgba(75,141,248,0.45)] bg-[rgba(75,141,248,0.08)] text-[#e8eef8]"
                      : "border-[rgba(148,163,184,0.14)] bg-white/[0.02] text-[#aab6ca] hover:border-[rgba(148,163,184,0.3)] hover:text-[#e8eef8]"
                  } ${focusRing}`}
                >
                  <span>{value === "all" ? "Todos" : RELATIONSHIPS[value].label}</span>
                  <span
                    className="cc6-num text-xs text-[#6b7890]"
                    title="Total no seu escopo comercial, independente da busca"
                  >
                    {count === null ? "—" : count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="cc6-hairline mt-4" aria-busy={loading} aria-live="polite">
          {loading && !data ? (
            <div className="grid gap-2 py-4">
              {[1, 2, 3, 4].map((item) => (
                <AtlasSkeleton className="h-16" key={item} />
              ))}
            </div>
          ) : null}
          {!loading && !error && data?.items.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 py-4">
              <p className="text-xs leading-5 text-[#6b7890]">
                {hasFilters
                  ? "Nenhum relacionamento neste recorte — ajuste a busca ou o vínculo."
                  : "Nenhum relacionamento visível ainda — cadastre o primeiro cliente para começar."}
              </p>
              {hasFilters ? (
                <button type="button" className="cc6-ghost-btn" onClick={resetFilters}>
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : null}
          {data?.items.map((customer) => {
            const relationship = RELATIONSHIPS[customer.relationship];
            const nextAction = nextActionLabel(customer.nextActionAt, data.generatedAt);
            const overdue = customer.relationship === "active" && nextAction.overdue;
            const gaps = customer.contextGaps.map((gap) => gapLabels[gap] || gap);
            const budget = budgetLabel(customer);
            const meta: Array<[string, string]> = [];
            if (customer.developmentName) meta.push(["projeto", customer.developmentName]);
            if (customer.purpose) meta.push(["objetivo", customer.purpose]);
            if (customer.ownerName) meta.push(["responsável", customer.ownerName]);
            if (budget) meta.push(["faixa", budget]);
            return (
              <article
                key={customer.id}
                data-overdue={overdue ? "true" : "false"}
                className={`flex flex-col gap-3 border-t border-[rgba(148,163,184,0.12)] py-4 transition-colors first:border-t-0 hover:border-[rgba(148,163,184,0.28)] hover:bg-white/[0.015] md:flex-row md:items-start md:justify-between md:gap-6 ${
                  overdue ? "bg-rose-500/[0.03]" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={`/leads/${customer.id}`}
                      className={`rounded-md text-sm font-semibold text-[#e8eef8] transition-colors hover:text-[color:var(--atlas-accent-hover)] ${focusRing}`}
                    >
                      {customer.name}
                    </Link>
                    {segment === "all" ? (
                      <StatusBadge tone={relationship.tone}>{relationship.label}</StatusBadge>
                    ) : null}
                  </div>
                  {customer.phone || customer.email ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {(
                        [
                          ["phone", customer.phone, "telefone"],
                          ["email", customer.email, "e-mail"],
                        ] as const
                      ).map(([field, value, label]) =>
                        value ? (
                          <button
                            key={field}
                            type="button"
                            onClick={() => void copyContact(`${customer.id}:${field}`, value)}
                            title={`Copiar ${label}`}
                            aria-label={`Copiar ${label} ${value}`}
                            className={chipButtonClass}
                          >
                            <span>{value}</span>
                            <span
                              aria-hidden="true"
                              className={
                                copied === `${customer.id}:${field}` ? "cc6-ok" : "text-[#6b7890]"
                              }
                            >
                              {copied === `${customer.id}:${field}` ? "✓" : "⧉"}
                            </span>
                          </button>
                        ) : null,
                      )}
                    </div>
                  ) : null}
                  {meta.length ? (
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-[#aab6ca]">
                      {meta.map(([label, value]) => (
                        <span key={label} className="inline-flex items-baseline gap-1.5">
                          <span className="cc6-eyebrow text-[10px]">{label}</span>
                          {value}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 md:max-w-72 md:flex-col md:items-end md:gap-1.5">
                  <p
                    className={`cc6-num text-xs ${
                      customer.relationship !== "active"
                        ? "text-[#6b7890]"
                        : overdue
                          ? "cc6-crit"
                          : "text-[#aab6ca]"
                    }`}
                  >
                    {customer.relationship === "active"
                      ? nextAction.label
                      : `Atualizado · ${dateLabel(customer.updatedAt)}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {gaps.length ? (
                      <span
                        className="cc6-chip cc6-warn border-[rgba(245,181,68,0.28)]!"
                        title={`Contexto ausente: ${gaps.join(", ")}. Complete no Lead 360.`}
                      >
                        completar: {gaps.slice(0, 2).join(" · ")}
                        {gaps.length > 2 ? ` +${gaps.length - 2}` : ""}
                      </span>
                    ) : null}
                    <CopilotContextAction
                      label="✦ Preparar contato"
                      prompt="Prepare um briefing objetivo para o próximo contato com esta lead, incluindo objetivo da conversa, pergunta mais importante e risco a revisar. Não envie mensagens nem altere o cadastro."
                      context={{
                        leadId: customer.id,
                        source: "customers_360",
                        workspace: "customer",
                        contextLabel: "Cliente 360",
                        returnHref: `/leads/${customer.id}`,
                      }}
                      className="cc6-ghost-btn"
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {data && data.page.pages > 1 ? (
          <nav
            className="cc6-hairline flex flex-wrap items-center justify-between gap-3 pt-3"
            aria-label="Paginação de clientes"
          >
            <button
              type="button"
              className="cc6-ghost-btn disabled:pointer-events-none disabled:opacity-40"
              disabled={loading || data.page.number <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              ← Anterior
            </button>
            <span className="text-xs text-[#6b7890]">
              Página <strong className="cc6-num font-semibold text-[#aab6ca]">{data.page.number}</strong>{" "}
              de <strong className="cc6-num font-semibold text-[#aab6ca]">{data.page.pages}</strong>
            </span>
            <button
              type="button"
              className="cc6-ghost-btn disabled:pointer-events-none disabled:opacity-40"
              disabled={loading || data.page.number >= data.page.pages}
              onClick={() => setPage((current) => current + 1)}
            >
              Próxima →
            </button>
          </nav>
        ) : null}

        {/* Governança consolidada em um único lugar (antes repetida em badges do
            herói, descrição do cartão, details e nota de rodapé). */}
        <details className="cc6-panel-quiet mt-4 text-xs">
          <summary
            className={`cursor-pointer list-none rounded-xl p-3.5 font-medium text-[#aab6ca] transition-colors hover:text-[#e8eef8] [&::-webkit-details-marker]:hidden ${focusRing}`}
          >
            Como esta visão protege a fonte única
          </summary>
          <div className="cc6-hairline mx-3.5 space-y-1.5 pb-3.5 pt-3 leading-5 text-[#6b7890]">
            <p>
              <strong className="text-[#aab6ca]">Carteira ativa:</strong> usa apenas leads
              autorizadas pelo escopo, hierarquia e RLS da organização.
            </p>
            <p>
              <strong className="text-[#aab6ca]">Base de reativação:</strong> continua fora desta
              lista; contatos frios só entram após aprovação e vínculo comercial explícito.
            </p>
            <p>
              <strong className="text-[#aab6ca]">Cobertura:</strong>{" "}
              {summary?.coverageComplete
                ? "todo o escopo visível foi analisado."
                : `${summary?.analyzed || 0} registros foram analisados nesta leitura.`}
            </p>
            <p>
              <strong className="text-[#aab6ca]">Automação:</strong> o Atlas apenas organiza o
              contexto observado — nenhum cliente é transferido, contatado, pontuado ou reativado
              automaticamente nesta tela.
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
