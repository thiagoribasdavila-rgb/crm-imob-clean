"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { CopilotContextAction } from "@/components/atlas/copilot-context-action";

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

const SEGMENTS = [
  ["all", "Todos"],
  ["active", "Em atendimento"],
  ["won", "Compraram aqui"],
  ["external", "Compraram fora"],
  ["closed", "Encerrados"],
] as const satisfies ReadonlyArray<readonly [Segment, string]>;

const relationshipLabels: Record<Relationship, string> = {
  active: "Em atendimento",
  won: "Compra concluída",
  external: "Compra externa",
  closed: "Relacionamento encerrado",
};

const relationshipTones = {
  active: "info",
  won: "success",
  external: "violet",
  closed: "neutral",
} as const;

const gapLabels: Record<string, string> = {
  contact: "Contato",
  project: "Projeto",
  purpose: "Objetivo",
  budget: "Faixa",
  next_action: "Próxima ação",
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

function budgetLabel(customer: Customer) {
  if (customer.budgetMin && customer.budgetMax) return `${money.format(customer.budgetMin)} – ${money.format(customer.budgetMax)}`;
  if (customer.budgetMax) return `Até ${money.format(customer.budgetMax)}`;
  if (customer.budgetMin) return `A partir de ${money.format(customer.budgetMin)}`;
  return "Faixa não informada";
}

export default function CustomersPage() {
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("active");
  const [page, setPage] = useState(1);

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

  const summary = data?.summary;
  const outcomeCount = (summary?.won || 0) + (summary?.external || 0);

  return (
    <div
      className="space-y-5 pb-10"
      data-evolution-phase="41"
      data-customers-layout="relationship-first"
    >
      <section className="atlas-customer-hero" aria-labelledby="customer-title">
        <div className="atlas-customer-hero-copy">
          <div className="flex flex-wrap gap-2">
            <AtlasBadge tone="violet">FASE 41 · RELACIONAMENTO 360</AtlasBadge>
            <AtlasBadge tone="success">FONTE ÚNICA ATIVA</AtlasBadge>
            <AtlasBadge tone="neutral">BASE FRIA SEPARADA</AtlasBadge>
          </div>
          <h1 id="customer-title">Cada cliente com contexto para o próximo atendimento</h1>
          <p>
            Veja vínculo, projeto, objetivo, histórico e próximo passo em uma leitura única. A carteira respeita a hierarquia comercial e não mistura a base de reativação.
          </p>
          <div className="atlas-customer-hero-actions">
            <Link href="/leads/new" className="atlas-button-primary">Novo cliente</Link>
            <Link href="/leads" className="atlas-button-secondary">Abrir carteira</Link>
            <CopilotContextAction
              label="✦ Priorizar carteira"
              prompt="Revise minha carteira autorizada e prepare uma lista curta dos relacionamentos que mais precisam de ação hoje, explicando o motivo sem executar alterações."
              context={{
                source: "customers_360",
                workspace: "customers",
                contextLabel: "Clientes 360",
                returnHref: "/customers",
              }}
            />
          </div>
        </div>
        <div className="atlas-customer-signal-grid" aria-label="Resumo dos relacionamentos autorizados" aria-busy={loading}>
          <article className="atlas-customer-signal"><span>Relacionamentos visíveis</span><strong>{loading ? "—" : summary?.total ?? 0}</strong><small>Dentro do seu escopo comercial</small></article>
          <article className="atlas-customer-signal" data-tone="green"><span>Em atendimento</span><strong>{loading ? "—" : summary?.active ?? 0}</strong><small>Com vínculo comercial aberto</small></article>
          <article className="atlas-customer-signal" data-tone="amber"><span>Exigem próxima ação</span><strong>{loading ? "—" : summary?.needsAction ?? 0}</strong><small>Sem agenda ou com prazo vencido</small></article>
          <article className="atlas-customer-signal" data-tone="violet"><span>Compras registradas</span><strong>{loading ? "—" : outcomeCount}</strong><small>Aqui ou em outra empresa</small></article>
        </div>
      </section>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}

      <AtlasCard className="atlas-customer-priority-card">
        <AtlasCardHeader
          eyebrow="Contexto antes do contato"
          title="Relacionamentos que pedem revisão"
          description="Até três situações objetivas, ordenadas por prazo e ausência de próximo passo — não por previsão da IA."
          action={<AtlasBadge tone="warning">REVISÃO HUMANA</AtlasBadge>}
        />
        {loading && !data ? (
          <div className="atlas-customer-priority-list">{[1, 2, 3].map((item) => <AtlasSkeleton className="h-20" key={item} />)}</div>
        ) : data?.priorities.length ? (
          <div className="atlas-customer-priority-list">
            {data.priorities.map((priority, index) => (
              <Link className="atlas-customer-priority" href={`/leads/${priority.customer.id}`} key={priority.customer.id}>
                <span className="atlas-customer-priority-position">0{index + 1}</span>
                <span className="atlas-customer-priority-copy">
                  <small>{priority.label}</small>
                  <strong>{priority.customer.name}</strong>
                  <span>{priority.detail}</span>
                </span>
                <span className="atlas-customer-priority-action">Abrir Lead 360 →</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="atlas-customer-priority-clear"><strong>Nenhuma pendência objetiva entre os registros analisados</strong><span>Continue registrando a próxima ação para manter o contexto comercial utilizável.</span></div>
        )}
      </AtlasCard>

      <AtlasCard className="atlas-customer-list-card">
        <AtlasCardHeader
          eyebrow="Fonte única do relacionamento"
          title="Carteira pesquisável"
          description="Acesse o Lead 360 sem duplicar cadastro, histórico ou responsabilidade."
          action={<AtlasBadge tone="success">SEM DUPLICAR HISTÓRICO</AtlasBadge>}
        />
        <div className="atlas-customer-controls">
          <label className="atlas-customer-search">
            <span>Buscar cliente</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, telefone, e-mail, origem ou status" />
          </label>
          <div className="atlas-customer-segments" aria-label="Filtrar por vínculo">
            {SEGMENTS.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={segment === value ? "is-active" : ""}
                aria-pressed={segment === value}
                onClick={() => { setSegment(value); setPage(1); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="atlas-customer-list" aria-busy={loading} aria-live="polite">
          {loading && !data ? [1, 2, 3, 4].map((item) => <AtlasSkeleton className="h-28" key={item} />) : null}
          {!loading && !error && data?.items.length === 0 ? (
            <AtlasEmpty
              reason={query || segment !== "all" ? "no-results" : "first-use"}
              eyebrow="Carteira sem correspondência"
              title="Nenhum relacionamento neste recorte"
              description="Altere a busca ou o vínculo. A base de reativação permanece separada desta visão por governança."
              action={<button type="button" className="atlas-button-secondary" onClick={() => { setQuery(""); setSegment("all"); setPage(1); }}>Limpar filtros</button>}
            />
          ) : null}
          {data?.items.map((customer) => {
            const nextAction = nextActionLabel(customer.nextActionAt, data.generatedAt);
            const contact = customer.phone || customer.email || "Contato pendente";
            return (
              <article className="atlas-customer-row" key={customer.id}>
                <div className="atlas-customer-identity">
                  <span aria-hidden="true">{customer.name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
                  <div><strong>{customer.name}</strong><small>{contact}</small></div>
                </div>
                <div className="atlas-customer-context">
                  <span><small>Projeto</small><strong>{customer.developmentName || "A definir"}</strong></span>
                  <span><small>Objetivo</small><strong>{customer.purpose || "A descobrir"}</strong></span>
                  <span><small>Responsável</small><strong>{customer.ownerName || "Sem responsável"}</strong></span>
                  <span><small>Faixa</small><strong>{budgetLabel(customer)}</strong></span>
                </div>
                <div className="atlas-customer-next">
                  <AtlasBadge tone={relationshipTones[customer.relationship]}>{relationshipLabels[customer.relationship]}</AtlasBadge>
                  {customer.relationship === "active" ? <strong className={nextAction.overdue ? "is-overdue" : ""}>{nextAction.label}</strong> : <strong>Atualizado · {dateLabel(customer.updatedAt)}</strong>}
                  <small>{customer.contextGaps.length ? `Completar: ${customer.contextGaps.map((gap) => gapLabels[gap] || gap).join(", ")}` : "Contexto essencial registrado"}</small>
                </div>
                <div className="atlas-customer-row-actions">
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
                    className="atlas-customer-copilot"
                  />
                  <Link className="atlas-customer-open" href={`/leads/${customer.id}`}>Ver Lead 360 <span aria-hidden="true">→</span></Link>
                </div>
              </article>
            );
          })}
        </div>

        {data && data.page.pages > 1 ? (
          <nav className="atlas-customer-pagination" aria-label="Paginação de clientes">
            <button type="button" disabled={loading || data.page.number <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button>
            <span>Página {data.page.number} de {data.page.pages} · {data.page.total} neste filtro</span>
            <button type="button" disabled={loading || data.page.number >= data.page.pages} onClick={() => setPage((current) => current + 1)}>Próxima →</button>
          </nav>
        ) : null}

        <details className="atlas-customer-scope-details">
          <summary>Como esta visão protege a fonte única</summary>
          <div>
            <p><strong>Carteira ativa:</strong> usa apenas leads autorizadas pelo escopo, hierarquia e RLS da organização.</p>
            <p><strong>Base de reativação:</strong> continua fora desta lista; contatos frios só entram após aprovação e vínculo comercial explícito.</p>
            <p><strong>Cobertura:</strong> {summary?.coverageComplete ? "todo o escopo visível foi analisado." : `${summary?.analyzed || 0} registros foram analisados nesta leitura.`}</p>
          </div>
        </details>
      </AtlasCard>

      <p className="atlas-customer-governance-note">
        O Atlas apenas organiza o contexto observado. Nenhum cliente é transferido, contatado, pontuado ou reativado automaticamente nesta tela.
      </p>
    </div>
  );
}
