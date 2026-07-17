"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { EmptyState } from "@/components/atlas/empty-state";
import { ErrorState } from "@/components/atlas/error-state";
import { LoadingState } from "@/components/atlas/loading-state";
import { MetricCard } from "@/components/atlas/metric-card";
import { StatusBadge } from "@/components/atlas/status-badge";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  source: string | null;
  assigned_to: string | null;
  campaign_id: string | null;
  temperature: string | null;
  score: number | null;
  budget_min: number | null;
  budget_max: number | null;
  last_interaction_at: string | null;
  next_action_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  metadata: { meta?: { campaignId?: string; formId?: string; dataSharingConsent?: boolean; sourceName?: string } } | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  commercial_role: string | null;
  reports_to: string | null;
  active: boolean;
};

type ReferenceRow = Record<string, unknown>;
type SortDirection = "asc" | "desc";

type LeadsPayload = {
  ok: true;
  data: {
    items: Lead[];
    page: {
      limit: number;
      number: number | null;
      total: number | null;
      pages: number | null;
      hasMore: boolean;
    };
  };
};

const PAGE_SIZE = 25;
const statuses = [
  { value: "", label: "Todos os status" },
  { value: "novo", label: "Novo" },
  { value: "contato", label: "Contato" },
  { value: "qualificacao", label: "Qualificação" },
  { value: "visita", label: "Visita" },
  { value: "proposta", label: "Proposta" },
  { value: "negociacao", label: "Negociação" },
  { value: "ganho", label: "Venda" },
  { value: "perdido", label: "Perdido" },
  { value: "comprou_outro", label: "Comprou em outro lugar" },
] as const;

function text(row: ReferenceRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function developmentRef(row: ReferenceRow) {
  return text(row, "development_id", "developmentId", "project_id", "projectId");
}

function statusTone(value: string | null) {
  const normalized = (value ?? "").toLowerCase();
  if (["ganho", "venda"].includes(normalized)) return "success";
  if (["perdido"].includes(normalized)) return "danger";
  if (normalized === "comprou_outro") return "success";
  if (["visita", "proposta", "negociacao"].includes(normalized)) return "violet";
  if (["contato", "qualificacao"].includes(normalized)) return "warning";
  return "info";
}

function scoreTone(score: number | null) {
  if (Number(score ?? 0) >= 70) return "danger";
  if (Number(score ?? 0) >= 40) return "warning";
  return "info";
}

function formatDate(value: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function dueLabel(value: string | null, referenceTime: number) {
  if (!value) return { label: "Sem próxima ação", overdue: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: "Sem próxima ação", overdue: false };
  const overdue = date.getTime() < referenceTime;
  return {
    label: `${overdue ? "Atrasada" : "Próxima"} · ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`,
    overdue,
  };
}

export default function LeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [campaigns, setCampaigns] = useState<ReferenceRow[]>([]);
  const [developments, setDevelopments] = useState<ReferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [project, setProject] = useState("");
  const [broker, setBroker] = useState("");
  const [score, setScore] = useState("");
  const [sort, setSort] = useState("created_at");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [referenceTime, setReferenceTime] = useState(0);
  const [currentRole, setCurrentRole] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [transferTarget, setTransferTarget] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let active = true;

    async function loadReferences() {
      const [profileResult, campaignResult, developmentResult, meResult] = await Promise.all([
        supabase.from("profiles").select("id,full_name,role,commercial_role,reports_to,active").eq("active", true).order("full_name"),
        supabase.from("campaigns").select("*").limit(500),
        supabase.from("developments").select("*").order("name").limit(100),
        fetch("/api/v1/auth/me").then((response) => response.json()),
      ]);
      if (!active) return;
      setProfiles((profileResult.data ?? []) as Profile[]);
      setCampaigns((campaignResult.data ?? []) as ReferenceRow[]);
      setDevelopments((developmentResult.data ?? []) as ReferenceRow[]);
      setCurrentRole(meResult?.data?.profile?.commercialRole || meResult?.data?.profile?.role || "");
      const referenceError = profileResult.error || campaignResult.error || developmentResult.error;
      if (referenceError) setError(`Referências: ${referenceError.message}`);
      setReferencesLoading(false);
    }

    void loadReferences();
    return () => {
      active = false;
    };
  }, []);

  const campaignIds = useMemo(
    () =>
      project
        ? campaigns
            .filter((campaign) => developmentRef(campaign) === project)
            .map((campaign) => String(campaign.id))
        : [],
    [campaigns, project],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadLeads() {
      setLoading(true);
      setError("");
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Sessão expirada. Entre novamente para consultar os leads.");

        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          sort,
          direction,
        });
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (status) params.set("status", status);
        if (source) params.set("source", source);
        if (broker) {
          const selectedProfile = profiles.find((profile) => profile.id === broker);
          if ((selectedProfile?.commercial_role || selectedProfile?.role) === "manager") params.set("team_owner", broker);
          else params.set("assigned_to", broker);
        }
        if (project) {
          if (campaignIds.length) params.set("campaign_ids", campaignIds.join(","));
          else {
            setItems([]);
            setTotal(0);
            setPages(1);
            setReferenceTime(Date.now());
            setLoading(false);
            return;
          }
        }
        if (score === "hot") params.set("min_score", "70");
        if (score === "warm") {
          params.set("min_score", "40");
          params.set("max_score", "69");
        }
        if (score === "cold") params.set("max_score", "39");

        const response = await fetch(`/api/v1/crm/leads?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const payload = (await response.json()) as LeadsPayload | { error?: { message?: string } };
        if (!response.ok || !("ok" in payload) || !payload.ok) {
          const message = "error" in payload ? payload.error?.message : "";
          throw new Error(message || "Não foi possível carregar os leads.");
        }
        setItems(payload.data.items);
        setSelected(new Set());
        setTotal(payload.data.page.total ?? payload.data.items.length);
        setPages(payload.data.page.pages ?? 1);
        setReferenceTime(Date.now());
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar leads.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadLeads();
    return () => controller.abort();
  }, [broker, campaignIds, debouncedSearch, direction, page, profiles, project, reloadKey, score, sort, source, status]);

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.full_name || "Usuário Atlas"])),
    [profiles],
  );

  const campaignMap = useMemo(
    () => new Map(campaigns.map((campaign) => [String(campaign.id), developmentRef(campaign)])),
    [campaigns],
  );

  const developmentMap = useMemo(
    () => new Map(developments.map((development) => [String(development.id), text(development, "name") || "Projeto sem nome"])),
    [developments],
  );

  const projectName = (lead: Lead) => {
    const developmentId = lead.campaign_id ? campaignMap.get(lead.campaign_id) : "";
    return developmentId ? developmentMap.get(developmentId) || "Projeto não identificado" : "Sem projeto";
  };

  const pageMetrics = useMemo(() => ({
    hot: items.filter((lead) => Number(lead.score ?? 0) >= 70 || lead.temperature === "quente").length,
    unassigned: items.filter((lead) => !lead.assigned_to).length,
    overdue: items.filter((lead) => {
      if (!lead.next_action_at || !referenceTime) return false;
      return new Date(lead.next_action_at).getTime() < referenceTime;
    }).length,
  }), [items, referenceTime]);

  const hasFilters = Boolean(search || status || source || project || broker || score);
  const canTransfer = ["admin", "director", "superintendent", "manager"].includes(currentRole);
  const transferTargets = profiles.filter((profile) => {
    const role = profile.commercial_role || profile.role;
    return ["manager", "broker"].includes(role);
  });

  async function transferSelected() {
    if (!selected.size || !transferTarget) return;
    setTransferring(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/crm/leads/bulk-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [...selected], targetOwnerId: transferTarget, reason: transferReason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Não foi possível transferir os leads.");
      setNotice(`${selected.size} lead(s) transferido(s) com histórico registrado.`);
      setSelected(new Set());
      setTransferTarget("");
      setTransferReason("");
      setReloadKey((current) => current + 1);
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Falha na transferência.");
    } finally {
      setTransferring(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setSource("");
    setProject("");
    setBroker("");
    setScore("");
    setSort("created_at");
    setDirection("desc");
    setPage(1);
  }

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-leads-hero">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">LEADS INTELLIGENCE</StatusBadge>
            <StatusBadge tone="success">TENANT-SAFE</StatusBadge>
            <StatusBadge tone="violet">LEAD 360</StatusBadge>
          </div>
          <h1>Concentre a operação nos leads com maior chance de avançar.</h1>
          <p>{currentRole === "broker" ? "Sua carteira, prioridades e próximas ações em uma visão simples para vender mais e perder menos tempo." : "Visibilidade respeitando a hierarquia, distribuição em massa e histórico completo para conduzir o time comercial."}</p>
          <div className="atlas-command-actions">
            <Link href="/leads/new" className="atlas-button-primary">+ Novo lead</Link>
            <Link href="/pipeline" className="atlas-button-secondary">Abrir pipeline</Link>
            <button
              type="button"
              className="atlas-button-secondary"
              onClick={() => window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: { prompt: "Analise a carteira de leads atual e recomende critérios de priorização para o time comercial.", context: { total, filters: { status, project, broker, score }, pageMetrics } } }))}
            >
              ✦ Analisar carteira
            </button>
          </div>
        </div>
        <div className="atlas-leads-total">
          <span>Base filtrada</span>
          <strong>{loading ? "—" : total}</strong>
          <small>{hasFilters ? "resultado dos filtros atuais" : currentRole === "broker" ? "somente a sua carteira" : "somente seu escopo comercial"}</small>
        </div>
      </section>

      <section className="atlas-leads-metrics">
        <MetricCard label="Leads encontrados" value={loading ? "—" : total} detail={`${PAGE_SIZE} por página`} trend="BASE" />
        <MetricCard label="Quentes nesta página" value={loading ? "—" : pageMetrics.hot} detail="Score ≥ 70 ou temperatura quente" trend="HOT" tone="danger" />
        <MetricCard label="Sem responsável" value={loading ? "—" : pageMetrics.unassigned} detail="Precisam de distribuição" trend="AÇÃO" tone="warning" />
        <MetricCard label="Ações atrasadas" value={loading ? "—" : pageMetrics.overdue} detail="Follow-up fora do prazo" trend="SLA" tone="danger" />
      </section>

      <section className="atlas-leads-filter-panel">
        <div className="atlas-leads-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone..."
            aria-label="Buscar leads"
          />
        </div>
        <select value={project} onChange={(event) => updateFilter(setProject, event.target.value)} aria-label="Filtrar por projeto" disabled={referencesLoading}>
          <option value="">Todos os projetos</option>
          {developments.map((development) => <option key={String(development.id)} value={String(development.id)}>{text(development, "name") || "Projeto sem nome"}</option>)}
        </select>
        <select value={status} onChange={(event) => updateFilter(setStatus, event.target.value)} aria-label="Filtrar por status">
          {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={source} onChange={(event) => updateFilter(setSource, event.target.value)} aria-label="Filtrar por origem">
          <option value="">Todas as origens</option>
          <option value="Meta Lead Ads">Meta Lead Ads</option>
        </select>
        {currentRole !== "broker" ? <select value={broker} onChange={(event) => updateFilter(setBroker, event.target.value)} aria-label="Filtrar por corretor" disabled={referencesLoading}>
          <option value="">Todos os corretores</option>
          <option value="unassigned">Sem responsável</option>
          {profiles.filter((profile) => ["broker", "manager"].includes(profile.commercial_role || profile.role)).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || "Usuário sem nome"}</option>)}
        </select> : null}
        <select value={score} onChange={(event) => updateFilter(setScore, event.target.value)} aria-label="Filtrar por score">
          <option value="">Todos os scores</option>
          <option value="hot">Quente · 70–100</option>
          <option value="warm">Morno · 40–69</option>
          <option value="cold">Frio · 0–39</option>
        </select>
        <div className="atlas-leads-sort">
          <select value={sort} onChange={(event) => updateFilter(setSort, event.target.value)} aria-label="Ordenar leads">
            <option value="created_at">Data de entrada</option>
            <option value="updated_at">Última atualização</option>
            <option value="score">Score</option>
            <option value="name">Nome</option>
          </select>
          <button type="button" onClick={() => { setDirection((current) => current === "asc" ? "desc" : "asc"); setPage(1); }} aria-label={direction === "asc" ? "Ordenação crescente" : "Ordenação decrescente"}>
            {direction === "asc" ? "↑" : "↓"}
          </button>
        </div>
        {hasFilters ? <button type="button" className="atlas-clear-filters" onClick={resetFilters}>Limpar filtros</button> : null}
      </section>

      {error ? <ErrorState description={error} action={<button type="button" className="atlas-button-secondary" onClick={resetFilters}>Limpar e tentar novamente</button>} /> : null}
      {notice ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-200">{notice}</div> : null}

      {canTransfer && selected.size ? (
        <section className="sticky top-3 z-30 flex flex-col gap-3 rounded-2xl border border-cyan-400/30 bg-slate-950/95 p-4 shadow-2xl backdrop-blur md:flex-row md:items-center">
          <div className="min-w-44"><strong className="block text-white">{selected.size} lead(s) selecionado(s)</strong><span className="text-xs text-slate-400">Transferência segura com rastreabilidade</span></div>
          <select className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white" value={transferTarget} onChange={(event) => setTransferTarget(event.target.value)}>
            <option value="">Escolha gerente ou corretor</option>
            {transferTargets.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || "Usuário sem nome"} · {profile.commercial_role || profile.role}</option>)}
          </select>
          <input className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white" value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Motivo (opcional)" maxLength={500} />
          <button type="button" className="atlas-button-primary" disabled={!transferTarget || transferring} onClick={transferSelected}>{transferring ? "Transferindo..." : "Confirmar transferência"}</button>
          <button type="button" className="atlas-button-secondary" onClick={() => setSelected(new Set())}>Cancelar</button>
        </section>
      ) : null}

      {!error ? (
        <section className="atlas-leads-table-panel">
          <div className="atlas-leads-table-head">
            <div><strong>Carteira comercial</strong><span>{loading ? "Sincronizando..." : `${total} lead(s) · página ${page} de ${pages}`}</span></div>
            <StatusBadge tone="success">DADOS REAIS</StatusBadge>
          </div>
          {loading ? <div className="p-5"><LoadingState rows={6} /></div> : items.length === 0 ? (
            <EmptyState
              title={hasFilters ? "Nenhum lead corresponde aos filtros" : "Nenhum lead cadastrado"}
              description={hasFilters ? "Ajuste os filtros para ampliar a busca." : "Cadastre o primeiro lead para iniciar a operação comercial."}
              action={hasFilters ? <button type="button" className="atlas-button-secondary" onClick={resetFilters}>Limpar filtros</button> : <Link href="/leads/new" className="atlas-button-primary">Criar lead</Link>}
            />
          ) : (
            <>
              <div className="atlas-leads-desktop">
                <table>
                  <thead><tr>{canTransfer ? <th><input type="checkbox" aria-label="Selecionar página" checked={items.length > 0 && items.every((lead) => selected.has(lead.id))} onChange={(event) => setSelected(event.target.checked ? new Set(items.map((lead) => lead.id)) : new Set())} /></th> : null}<th>Lead</th><th>Projeto e origem</th><th>Status</th><th>Score</th><th>Corretor</th><th>Último contato</th><th>Próxima ação</th><th><span className="sr-only">Abrir</span></th></tr></thead>
                  <tbody>
                    {items.map((lead) => {
                      const due = dueLabel(lead.next_action_at, referenceTime);
                      return (
                        <tr key={lead.id}>
                          {canTransfer ? <td><input type="checkbox" aria-label={`Selecionar ${lead.name || "lead"}`} checked={selected.has(lead.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(lead.id); else next.delete(lead.id); return next; })} /></td> : null}
                          <td><Link href={`/leads/${lead.id}`}><span className="atlas-lead-avatar">{(lead.name || "L").slice(0, 2).toUpperCase()}</span><span><strong>{lead.name || "Lead sem nome"}</strong><small>{lead.email || lead.phone || "Contato não informado"}</small></span></Link></td>
                          <td><strong>{projectName(lead)}</strong><small>{lead.source || "Origem não informada"}</small>{lead.source === "Meta Lead Ads" ? <span className="mt-1 flex flex-wrap gap-1"><StatusBadge tone="info">META</StatusBadge><StatusBadge tone={lead.metadata?.meta?.dataSharingConsent ? "success" : "warning"}>{lead.metadata?.meta?.dataSharingConsent ? "APRENDENDO" : "SEM SINAL"}</StatusBadge>{lead.metadata?.meta?.campaignId ? <small>Campanha {lead.metadata.meta.campaignId}</small> : <small>Campanha não identificada</small>}</span> : null}</td>
                          <td><StatusBadge tone={statusTone(lead.status)}>{lead.status || "novo"}</StatusBadge></td>
                          <td><span className="atlas-score-cell" data-tone={scoreTone(lead.score)}>{lead.score ?? 0}</span></td>
                          <td>{lead.assigned_to ? <span className="atlas-broker-name">{profileMap.get(lead.assigned_to) || "Responsável vinculado"}</span> : <StatusBadge tone="warning">Sem responsável</StatusBadge>}</td>
                          <td><span className="atlas-date-cell">{formatDate(lead.last_interaction_at || lead.updated_at)}</span></td>
                          <td><span className="atlas-next-action" data-overdue={due.overdue ? "true" : "false"}>{due.label}</span></td>
                          <td><Link href={`/leads/${lead.id}`} className="atlas-row-action" aria-label={`Abrir Lead 360 de ${lead.name || "lead"}`}>→</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="atlas-leads-mobile">
                {items.map((lead) => {
                  const due = dueLabel(lead.next_action_at, referenceTime);
                  return (
                    <Link href={`/leads/${lead.id}`} key={lead.id}>
                      <div className="atlas-mobile-lead-head"><span className="atlas-lead-avatar">{(lead.name || "L").slice(0, 2).toUpperCase()}</span><span><strong>{lead.name || "Lead sem nome"}</strong><small>{projectName(lead)}</small></span><span className="atlas-score-cell" data-tone={scoreTone(lead.score)}>{lead.score ?? 0}</span></div>
                      <div className="atlas-mobile-lead-meta"><StatusBadge tone={statusTone(lead.status)}>{lead.status || "novo"}</StatusBadge>{lead.source === "Meta Lead Ads" ? <StatusBadge tone={lead.metadata?.meta?.dataSharingConsent ? "success" : "warning"}>{lead.metadata?.meta?.dataSharingConsent ? "META · APRENDENDO" : "META · SEM SINAL"}</StatusBadge> : null}{lead.assigned_to ? <span>{profileMap.get(lead.assigned_to) || "Responsável vinculado"}</span> : <StatusBadge tone="warning">Sem responsável</StatusBadge>}</div>
                      <div className="atlas-mobile-lead-footer"><span>{formatDate(lead.last_interaction_at || lead.updated_at)}</span><span className="atlas-next-action" data-overdue={due.overdue ? "true" : "false"}>{due.label}</span></div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
          {!loading && items.length ? (
            <div className="atlas-pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button>
              <span>Página <strong>{page}</strong> de <strong>{pages}</strong></span>
              <button type="button" disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Próxima →</button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
