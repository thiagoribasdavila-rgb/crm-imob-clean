"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Campaign = {
  id: string;
  name: string;
  channel: string;
  status: string;
  budget: number;
  spend: number;
  leads_count: number;
  sales_count: number;
  revenue: number;
  starts_at: string | null;
  ends_at: string | null;
  objective: string | null;
  developer_id?: string | null;
  developments?: { name?: string } | null;
  developers?: { id?: string; trade_name?: string; legal_name?: string } | null;
};
type Development = { id: string; name: string };
type Developer = { id: string; trade_name?: string; legal_name?: string };
type Payload = {
  campaigns: Campaign[];
  summary: {
    total: number;
    active: number;
    budget: number;
    spend: number | null;
    campaignsWithKnownSpend: number;
    leads: number;
    sales: number;
    revenue: number;
  };
  metaSync: { configured: boolean; requiredForInternalOperation: boolean };
};
type MetaTestLeadCandidate = {
  createdAt: string | null;
  hasConsent: boolean;
  hasEmail: boolean;
  hasOrigin: boolean;
  hasPhone: boolean;
  id: string;
  label: string;
  missing: string[];
  privacy: string;
  projectName: string;
  readinessPct: number;
  recommendedAction: string;
  riskLevel: "baixo" | "médio" | "alto";
  source: string;
  status: string;
};
type MetaCandidatePayload = {
  candidates: MetaTestLeadCandidate[];
  generatedAt: string;
  guardrails: string[];
  mode: "lead_candidate_selection_no_delivery";
  summary: {
    consented: number;
    eligible: number;
    found: number;
    withIdentifier: number;
  };
};
type MetaApprovalReceipt = {
  approvedAt: string;
  approvedBy: string;
  candidateFingerprint: string;
  deliveryAuthorized: boolean;
  expiresAt: string | null;
  externalEventSent: boolean;
  id: string;
  leadId: string | null;
  projectName: string;
  readinessPct: number;
  reason: string;
  source: string;
};
type FrozenMetaPayloadReceipt = {
  approvalId: string;
  approvedContextFingerprint: string;
  deliveryAuthorized: boolean;
  expiresAt: string | null;
  externalEventSent: boolean;
  frozenAt: string;
  frozenBy: string;
  frozenPayload: {
    actionSource: string;
    approvalId: string;
    approvedContextFingerprint: string;
    deliveryAuthorized: false;
    eventName: string;
    externalEventSent: false;
    leadId: string;
    projectName: string;
    schemaVersion: string;
    source: string;
  } | null;
  id: string;
  leadId: string | null;
  payloadFingerprint: string;
  schemaVersion: string;
};
type MetaExecutionGateReceipt = {
  approvalId: string;
  authorizationScope: string;
  authorizedAt: string;
  deliveryAuthorized: boolean;
  dryRunApproved: boolean;
  dryRunChecks: string[];
  executionStatus: string;
  expiresAt: string | null;
  externalEventSent: boolean;
  frozenPayloadId: string;
  gateFingerprint: string;
  id: string;
  idempotencyKey: string;
  leadId: string | null;
  maxDeliveries: number;
  payloadFingerprint: string;
  schemaVersion: string;
};
type MetaDeliveryReceipt = {
  attempts: number;
  datasetIdMasked: string;
  deliveredAt: string;
  eventId: string;
  eventName: string;
  eventsReceived: number;
  externalEventSent: boolean;
  gateFingerprint: string;
  gateId: string;
  mode: string;
  productionEnabled: boolean;
  schemaVersion: string;
  status: string;
  traceId: string | null;
};
type MetaDeliveryObservation = {
  attempts: number;
  deliveredAt: string | null;
  eventId: string;
  eventName: string;
  eventsReceived: number | null;
  externalAttempted: boolean;
  gateId: string | null;
  hasReceipt: boolean;
  nextAction: string;
  occurredAt: string;
  operationalStatus:
    | "confirmed"
    | "waiting_local_worker"
    | "failed_before_external_attempt"
    | "external_result_inconclusive"
    | "dead_letter";
  repeatBlocked: boolean;
  schemaVersion: string;
};
type MetaDeliveryObservabilityPayload = {
  generatedAt: string;
  observations: MetaDeliveryObservation[];
  policy: {
    automaticResend: false;
    inconclusiveAttemptsRequireManualReconciliation: true;
    productionEnabled: false;
  };
};
const initial = {
  name: "",
  channel: "meta",
  developmentId: "",
  developerId: "",
  budget: "",
  startsAt: "",
  endsAt: "",
  status: "draft",
  objective: "",
  briefing: "",
};
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new Error(
      payload?.error?.message || "Não foi possível concluir a operação.",
    );
  return payload?.data as T;
}

function MetaLeadCandidateCard({
  candidate,
  onSelect,
  selected,
}: {
  candidate: MetaTestLeadCandidate;
  onSelect: () => void;
  selected: boolean;
}) {
  const riskClass = candidate.riskLevel === "baixo"
    ? "bg-emerald-400/10 text-emerald-200"
    : candidate.riskLevel === "médio"
      ? "bg-amber-400/10 text-amber-200"
      : "bg-rose-400/10 text-rose-200";

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
        selected
          ? "border-sky-400/45 bg-sky-400/[.09]"
          : "border-white/[.07] bg-white/[.025] hover:border-white/15"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{candidate.label}</p>
          <p className="mt-1 text-xs text-slate-400">{candidate.projectName}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${riskClass}`}>
          {candidate.readinessPct}% · risco {candidate.riskLevel}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-300">
        {candidate.recommendedAction}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
        <span className={candidate.hasOrigin ? "text-emerald-300" : "text-rose-300"}>
          {candidate.hasOrigin ? "✓" : "×"} origem Meta
        </span>
        <span className={candidate.hasConsent ? "text-emerald-300" : "text-rose-300"}>
          {candidate.hasConsent ? "✓" : "×"} consentimento
        </span>
        <span className={candidate.hasEmail || candidate.hasPhone ? "text-emerald-300" : "text-rose-300"}>
          {candidate.hasEmail || candidate.hasPhone ? "✓" : "×"} identificador
        </span>
      </div>
    </button>
  );
}

export default function CampaignsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [form, setForm] = useState(initial);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assetCampaign, setAssetCampaign] = useState("");
  const [assetType, setAssetType] = useState("briefing");
  const [assetTitle, setAssetTitle] = useState("");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [leadCandidates, setLeadCandidates] = useState<MetaTestLeadCandidate[]>([]);
  const [leadCandidateSummary, setLeadCandidateSummary] = useState<MetaCandidatePayload["summary"] | null>(null);
  const [leadCandidatesLoading, setLeadCandidatesLoading] = useState(true);
  const [leadCandidatesError, setLeadCandidatesError] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [approvalReceipt, setApprovalReceipt] = useState<MetaApprovalReceipt | null>(null);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [frozenPayloadReceipt, setFrozenPayloadReceipt] = useState<FrozenMetaPayloadReceipt | null>(null);
  const [payloadFreezing, setPayloadFreezing] = useState(false);
  const [executionGateReceipt, setExecutionGateReceipt] = useState<MetaExecutionGateReceipt | null>(null);
  const [executionGateAuthorizing, setExecutionGateAuthorizing] = useState(false);
  const [deliveryReceipt, setDeliveryReceipt] = useState<MetaDeliveryReceipt | null>(null);
  const [deliverySending, setDeliverySending] = useState(false);
  const [deliveryObservations, setDeliveryObservations] = useState<MetaDeliveryObservation[]>([]);
  const [deliveryObservabilityLoading, setDeliveryObservabilityLoading] = useState(true);
  const [deliveryObservabilityError, setDeliveryObservabilityError] = useState("");
  const [candidateNotice, setCandidateNotice] = useState("");
  const input =
    "w-full rounded-xl border border-white/10 bg-[#080d17] px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/40";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campaignPayload, developmentPayload, developerPayload] =
        await Promise.all([
          api<Payload>(
            `/api/v1/marketing/campaigns${query ? `?q=${encodeURIComponent(query)}` : ""}`,
          ),
          api<{ developments: Development[] }>("/api/v1/developments"),
          api<{ developers: Developer[] }>("/api/v1/developers"),
        ]);
      setData(campaignPayload);
      setDevelopments(developmentPayload.developments ?? []);
      setDevelopers(developerPayload.developers ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar campanhas.",
      );
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    void load();
  }, [load]);

  const loadLeadCandidates = useCallback(async () => {
    setLeadCandidatesLoading(true);
    setLeadCandidatesError("");
    try {
      const payload = await api<MetaCandidatePayload>(
        "/api/v1/integrations/meta/test-candidates",
      );
      setLeadCandidates(payload.candidates ?? []);
      setLeadCandidateSummary(payload.summary);
      setSelectedLeadId((current) => {
        if (current && payload.candidates.some((candidate) => candidate.id === current)) return current;
        return payload.candidates.find((candidate) => candidate.readinessPct === 100)?.id
          ?? payload.candidates[0]?.id
          ?? "";
      });
    } catch (cause) {
      setLeadCandidatesError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível preparar candidatas Meta.",
      );
    } finally {
      setLeadCandidatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeadCandidates();
  }, [loadLeadCandidates]);

  const loadDeliveryObservability = useCallback(async () => {
    setDeliveryObservabilityLoading(true);
    setDeliveryObservabilityError("");
    try {
      const payload = await api<MetaDeliveryObservabilityPayload>(
        "/api/v1/integrations/meta/test-delivery-observability",
      );
      setDeliveryObservations(payload.observations ?? []);
    } catch (cause) {
      setDeliveryObservabilityError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível reconciliar o teste Meta agora.",
      );
    } finally {
      setDeliveryObservabilityLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeliveryObservability();
  }, [loadDeliveryObservability]);

  async function create() {
    setSaving(true);
    setError("");
    try {
      await api("/api/v1/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm(initial);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a campanha.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function update(id: string, patch: Record<string, unknown>) {
    try {
      await api(`/api/v1/marketing/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar a campanha.",
      );
    }
  }
  async function archive(id: string) {
    if (
      !window.confirm(
        "Arquivar esta campanha? O histórico e os indicadores serão preservados.",
      )
    )
      return;
    try {
      await api(`/api/v1/marketing/campaigns/${id}`, { method: "DELETE" });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível arquivar a campanha.",
      );
    }
  }
  async function uploadAsset() {
    if (!assetCampaign || !assetFile || assetTitle.trim().length < 2) return;
    setSaving(true);
    setError("");
    const body = new FormData();
    body.set("assetType", assetType);
    body.set("title", assetTitle);
    body.set("file", assetFile);
    try {
      await api(`/api/v1/marketing/campaigns/${assetCampaign}/assets`, {
        method: "POST",
        body,
      });
      setAssetTitle("");
      setAssetFile(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar o anexo.",
      );
    } finally {
      setSaving(false);
    }
  }
  const selectedCandidate = useMemo(
    () => leadCandidates.find((candidate) => candidate.id === selectedLeadId) ?? null,
    [leadCandidates, selectedLeadId],
  );

  async function copyCandidateHandoff() {
    if (!selectedCandidate) return;
    const handoff = {
      leadId: selectedCandidate.id,
      mode: "lead_candidate_handoff_no_delivery",
      projectName: selectedCandidate.projectName,
      readinessPct: selectedCandidate.readinessPct,
      riskLevel: selectedCandidate.riskLevel,
      source: selectedCandidate.source,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(handoff, null, 2));
      setCandidateNotice("Handoff seguro copiado. Nenhum dado de contato foi incluído.");
    } catch {
      setCandidateNotice("O navegador não permitiu copiar. A seleção permanece salva apenas nesta tela.");
    }
  }

  async function approveCandidate() {
    if (!selectedCandidate) return;
    setApprovalSaving(true);
    setLeadCandidatesError("");
    setCandidateNotice("");
    try {
      const payload = await api<{ approval: MetaApprovalReceipt; reused: boolean }>(
        "/api/v1/integrations/meta/test-approvals",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: selectedCandidate.id,
            reason: approvalReason,
          }),
        },
      );
      setApprovalReceipt(payload.approval);
      setFrozenPayloadReceipt(null);
      setExecutionGateReceipt(null);
      setDeliveryReceipt(null);
      setCandidateNotice(
        payload.reused
          ? "Aprovação vigente reutilizada; nenhum novo recibo foi criado."
          : "Aprovação formal registrada para a diretoria.",
      );
    } catch (cause) {
      setLeadCandidatesError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar a aprovação governada.",
      );
    } finally {
      setApprovalSaving(false);
    }
  }

  async function freezeApprovedPayload() {
    if (!approvalReceipt) return;
    setPayloadFreezing(true);
    setLeadCandidatesError("");
    setCandidateNotice("");
    try {
      const payload = await api<{ payload: FrozenMetaPayloadReceipt; reused: boolean }>(
        "/api/v1/integrations/meta/test-payloads",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalId: approvalReceipt.id }),
        },
      );
      setFrozenPayloadReceipt(payload.payload);
      setExecutionGateReceipt(null);
      setDeliveryReceipt(null);
      setCandidateNotice(
        payload.reused
          ? "Payload congelado existente reutilizado; nenhuma entrega externa ocorreu."
          : "Payload mínimo congelado e vinculado à aprovação. Nenhuma entrega externa ocorreu.",
      );
    } catch (cause) {
      setLeadCandidatesError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível congelar o payload governado.",
      );
    } finally {
      setPayloadFreezing(false);
    }
  }
  async function authorizeExecutionGate() {
    if (!frozenPayloadReceipt) return;
    setExecutionGateAuthorizing(true);
    setLeadCandidatesError("");
    setCandidateNotice("");
    try {
      const payload = await api<{ gate: MetaExecutionGateReceipt; reused: boolean }>(
        "/api/v1/integrations/meta/test-execution-gates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: "AUTORIZAR_TESTE_META_UNICO",
            payloadFingerprint: frozenPayloadReceipt.payloadFingerprint,
            payloadId: frozenPayloadReceipt.id,
          }),
        },
      );
      setExecutionGateReceipt(payload.gate);
      setDeliveryReceipt(null);
      setCandidateNotice(
        payload.reused
          ? "Gate vigente reutilizado. Nenhum evento foi enviado à Meta."
          : "Gate temporário autorizado após dry-run. Nenhum evento foi enviado à Meta.",
      );
    } catch (cause) {
      setLeadCandidatesError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível autorizar o gate de execução.",
      );
    } finally {
      setExecutionGateAuthorizing(false);
    }
  }

  async function deliverControlledMetaTest() {
    if (!executionGateReceipt || deliveryReceipt) return;
    const confirmed = window.confirm(
      "Enviar exatamente 1 evento Lead ao dataset Meta em modo de teste? Esta ação será auditada e não poderá ser repetida.",
    );
    if (!confirmed) return;
    setDeliverySending(true);
    setLeadCandidatesError("");
    setCandidateNotice("");
    try {
      const payload = await api<{ delivery: MetaDeliveryReceipt; reused: boolean }>(
        "/api/v1/integrations/meta/test-deliveries",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": executionGateReceipt.idempotencyKey,
          },
          body: JSON.stringify({
            confirmation: "ENVIAR_TESTE_META_AGORA",
            gateFingerprint: executionGateReceipt.gateFingerprint,
            gateId: executionGateReceipt.id,
          }),
        },
      );
      setDeliveryReceipt(payload.delivery);
      setCandidateNotice(
        payload.reused
          ? "Recibo existente recuperado; nenhum reenvio ocorreu."
          : "A Meta confirmou exatamente um evento no dataset de teste.",
      );
      await loadDeliveryObservability();
    } catch (cause) {
      setLeadCandidatesError(
        cause instanceof Error ? cause.message : "Não foi possível comprovar a entrega controlada.",
      );
    } finally {
      setDeliverySending(false);
    }
  }

  const conversion = useMemo(
    () =>
      data?.summary.leads ? (data.summary.sales / data.summary.leads) * 100 : 0,
    [data],
  );
  const directorDecision = useMemo(() => {
    const summary = data?.summary;
    if (!summary || summary.total === 0)
      return {
        label: "Cadastrar primeira campanha",
        href: "#new-campaign",
        title: "Começar a medição",
        detail: "Ainda não há campanha interna para acompanhar até a venda.",
      };
    if (summary.active === 0)
      return {
        label: "Revisar carteira",
        href: "#campaign-results",
        title: "Nenhuma campanha ativa",
        detail:
          "Defina qual campanha deve operar antes de analisar desempenho.",
      };
    if (summary.leads > 0 && summary.sales === 0)
      return {
        label: "Abrir pipeline",
        href: "/pipeline",
        title: "Leads sem venda registrada",
        detail: `${summary.leads} leads atribuídos exigem revisão do atendimento e do avanço no funil.`,
      };
    if (summary.spend === null)
      return {
        label: "Conectar custo real",
        href: "/integrations",
        title: "Investimento ainda não confirmado",
        detail:
          "Resultados existem, mas a eficiência financeira depende do custo recebido da mídia.",
      };
    return {
      label: "Ver relatório de marketing",
      href: "/reports/marketing",
      title: "Operação mensurável",
      detail: `${summary.sales} vendas e ${money.format(summary.revenue)} em receita observada no CRM.`,
    };
  }, [data]);

  return (
    <div className="space-y-6 pb-12">
      <header className="rounded-2xl border border-sky-400/15 bg-sky-500/[.055] p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-sky-300">
          Marketing operacional
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-white">
          Campanhas e resultado comercial
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Planeje e acompanhe campanhas internas mesmo sem credenciais externas.
          A conexão Meta é uma etapa separada e claramente sinalizada.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/marketing/creatives" className="atlas-button-secondary">
            Biblioteca de criativos
          </Link>
          <Link href="/integrations" className="atlas-button-secondary">
            Conexões externas
          </Link>
        </div>
      </header>
      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-100"
        >
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      ) : null}
      <section
        data-ux-phase="30-campaign-decision-first"
        className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Vendas observadas",
              data?.summary.sales ?? 0,
              "Resultado registrado no CRM",
            ],
            [
              "Receita observada",
              money.format(data?.summary.revenue ?? 0),
              "Sem alegar incrementalidade",
            ],
            [
              "Investimento conhecido",
              data?.summary.spend === null
                ? "Não informado"
                : money.format(data?.summary.spend ?? 0),
              `${data?.summary.campaignsWithKnownSpend ?? 0} campanha(s) com custo`,
            ],
            [
              "Conversão observada",
              `${conversion.toFixed(1).replace(".", ",")}%`,
              `${data?.summary.leads ?? 0} leads atribuídos`,
            ],
          ].map(([label, value, hint]) => (
            <article
              key={label}
              className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
            >
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {loading ? "—" : value}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
            </article>
          ))}
        </div>
        <aside className="flex flex-col justify-between rounded-2xl border border-sky-400/20 bg-sky-400/[.07] p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">
              Decisão recomendada
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">
              {loading ? "Analisando carteira…" : directorDecision.title}
            </h2>
            <p className="mt-2 text-sm leading-5 text-slate-300">
              {loading
                ? "Consolidando campanhas e resultados reais."
                : directorDecision.detail}
            </p>
          </div>
          <Link
            href={directorDecision.href}
            className="atlas-button-primary mt-4 w-fit"
          >
            {directorDecision.label}
          </Link>
        </aside>
      </section>
      <section
        data-v30-phase="164-meta-eligible-lead-selection"
        className="rounded-2xl border border-violet-400/15 bg-violet-500/[.035] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-300">
              Meta · gate humano
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Lead real elegível para o teste Meta
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              A diretoria escolhe uma lead mascarada, revisa a prontidão e registra a justificativa.
              Nenhum evento foi enviado para Meta.
            </p>
          </div>
          <button
            type="button"
            className="atlas-button-secondary"
            onClick={() => void loadLeadCandidates()}
            disabled={leadCandidatesLoading}
          >
            {leadCandidatesLoading ? "Atualizando…" : "Atualizar candidatas"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            ["Encontradas", leadCandidateSummary?.found ?? 0],
            ["Elegíveis", leadCandidateSummary?.eligible ?? 0],
            ["Consentidas", leadCandidateSummary?.consented ?? 0],
            ["Com identificador", leadCandidateSummary?.withIdentifier ?? 0],
          ].map(([label, value]) => (
            <article key={label} className="rounded-xl border border-white/[.07] bg-[#080d17]/75 p-3">
              <p className="text-[10px] uppercase tracking-[.12em] text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold text-white">{leadCandidatesLoading ? "—" : value}</p>
            </article>
          ))}
        </div>

        {leadCandidatesError ? (
          <div role="alert" className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-100">
            {leadCandidatesError}
          </div>
        ) : null}

        {leadCandidatesLoading ? (
          <p className="mt-5 text-sm text-slate-400">Verificando origem, consentimento, identificador e projeto…</p>
        ) : leadCandidates.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-400">
            Nenhuma lead Meta foi encontrada no escopo atual. O Atlas não cria candidata fictícia.
          </div>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              {leadCandidates.slice(0, 6).map((candidate) => (
                <MetaLeadCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  selected={candidate.id === selectedLeadId}
                  onSelect={() => {
                    setSelectedLeadId(candidate.id);
                    setApprovalReceipt(null);
                    setFrozenPayloadReceipt(null);
                    setExecutionGateReceipt(null);
                    setCandidateNotice("");
                  }}
                />
              ))}
            </div>

            <aside
              data-v30-phase="165-meta-director-approval-receipt"
              className="rounded-2xl border border-sky-400/20 bg-sky-400/[.055] p-5"
            >
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">
                Aprovação governada
              </p>
              {selectedCandidate ? (
                <>
                  <h3 className="mt-2 font-semibold text-white">{selectedCandidate.label}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {selectedCandidate.projectName} · {selectedCandidate.readinessPct}% pronta
                  </p>
                  <p className="mt-3 text-xs leading-5 text-slate-400">{selectedCandidate.privacy}</p>
                  {selectedCandidate.missing.length ? (
                    <p className="mt-3 rounded-xl bg-amber-400/10 p-3 text-xs text-amber-100">
                      Pendências: {selectedCandidate.missing.join(", ")}.
                    </p>
                  ) : (
                    <p className="mt-3 rounded-xl bg-emerald-400/10 p-3 text-xs text-emerald-100">
                      Elegibilidade completa. A aprovação vale por 24 horas e não autoriza entrega externa.
                    </p>
                  )}
                  <label className="mt-4 block text-xs text-slate-400">
                    Justificativa da diretoria
                    <textarea
                      rows={3}
                      maxLength={500}
                      className={`mt-1 ${input}`}
                      placeholder="Ex.: lead consentida e vinculada ao projeto escolhido para o ensaio controlado."
                      value={approvalReason}
                      onChange={(event) => setApprovalReason(event.target.value)}
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="atlas-button-primary disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={
                        approvalSaving
                        || selectedCandidate.readinessPct !== 100
                        || selectedCandidate.riskLevel !== "baixo"
                        || approvalReason.trim().length < 10
                      }
                      onClick={() => void approveCandidate()}
                    >
                      {approvalSaving ? "Registrando…" : "Aprovar lead por 24h"}
                    </button>
                    <button
                      type="button"
                      className="atlas-button-secondary"
                      onClick={() => void copyCandidateHandoff()}
                    >
                      Copiar handoff seguro
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-400">Selecione uma candidata para revisar.</p>
              )}

              {candidateNotice ? (
                <p role="status" className="mt-4 text-xs text-sky-100">{candidateNotice}</p>
              ) : null}
              {approvalReceipt ? (
                <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[.07] p-3 text-xs text-emerald-100">
                  <p className="font-semibold">Recibo interno registrado</p>
                  <p className="mt-1">Validade: {approvalReceipt.expiresAt ? new Date(approvalReceipt.expiresAt).toLocaleString("pt-BR") : "não informada"}</p>
                  <p className="mt-1">Evento externo enviado: não</p>
                  <p className="mt-1 break-all text-emerald-200/70">Fingerprint: {approvalReceipt.candidateFingerprint.slice(0, 16)}…</p>
                  <button
                    type="button"
                    data-phase="166-meta-payload-freeze"
                    className="atlas-button-secondary mt-3 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={payloadFreezing || approvalReceipt.deliveryAuthorized || approvalReceipt.externalEventSent}
                    onClick={() => void freezeApprovedPayload()}
                  >
                    {payloadFreezing ? "Congelando…" : "Congelar payload mínimo"}
                  </button>
                </div>
              ) : null}
              {frozenPayloadReceipt ? (
                <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/[.07] p-3 text-xs text-violet-100">
                  <p className="font-semibold">Payload governado congelado</p>
                  <p className="mt-1">Contrato: {frozenPayloadReceipt.schemaVersion}</p>
                  <p className="mt-1">Entrega autorizada: não</p>
                  <p className="mt-1">Evento externo enviado: não</p>
                  <p className="mt-1 break-all text-violet-200/70">
                    Contexto aprovado: {frozenPayloadReceipt.approvedContextFingerprint.slice(0, 16)}…
                  </p>
                  <p className="mt-1 break-all text-violet-200/70">
                    Payload: {frozenPayloadReceipt.payloadFingerprint.slice(0, 16)}…
                  </p>
                  <button
                    type="button"
                    data-phase="167-meta-execution-gate"
                    className="atlas-button-secondary mt-3 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={
                      executionGateAuthorizing
                      || frozenPayloadReceipt.deliveryAuthorized
                      || frozenPayloadReceipt.externalEventSent
                      || Boolean(executionGateReceipt)
                    }
                    onClick={() => void authorizeExecutionGate()}
                  >
                    {executionGateAuthorizing ? "Validando dry-run…" : "Autorizar teste único por 10 min"}
                  </button>
                  <p className="mt-2 leading-5 text-violet-200/70">
                    Esta autorização abre somente o gate auditável. O envio exige a confirmação final separada abaixo.
                  </p>
                </div>
              ) : null}
              {executionGateReceipt ? (
                <div className="mt-4 rounded-xl border border-sky-400/20 bg-sky-400/[.07] p-3 text-xs text-sky-100">
                  <p className="font-semibold">Gate de execução autorizado</p>
                  <p className="mt-1">Dry-run estrutural: aprovado</p>
                  <p className="mt-1">Limite: {executionGateReceipt.maxDeliveries} entrega, uso único</p>
                  <p className="mt-1">
                    Expira: {executionGateReceipt.expiresAt ? new Date(executionGateReceipt.expiresAt).toLocaleString("pt-BR") : "não informada"}
                  </p>
                  <p className="mt-1">Evento externo enviado: não</p>
                  <p className="mt-1 break-all text-sky-200/70">
                    Gate: {executionGateReceipt.gateFingerprint.slice(0, 16)}…
                  </p>
                  <button
                    type="button"
                    data-phase="168-meta-controlled-test-delivery"
                    className="atlas-button-primary mt-3 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={deliverySending || Boolean(deliveryReceipt)}
                    onClick={() => void deliverControlledMetaTest()}
                  >
                    {deliverySending ? "Enviando e validando…" : "Enviar 1 evento ao dataset de teste"}
                  </button>
                  <p className="mt-2 leading-5 text-sky-200/70">
                    Exige confirmação final, usa event_id determinístico e devolve somente um recibo sanitizado.
                  </p>
                </div>
              ) : null}
              {deliveryReceipt ? (
                <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[.08] p-3 text-xs text-emerald-100">
                  <p className="font-semibold">Entrega Meta comprovada</p>
                  <p className="mt-1">Status: {deliveryReceipt.status}</p>
                  <p className="mt-1">Eventos recebidos: {deliveryReceipt.eventsReceived}</p>
                  <p className="mt-1">Dataset: {deliveryReceipt.datasetIdMasked}</p>
                  <p className="mt-1">Tentativas: {deliveryReceipt.attempts}</p>
                  <p className="mt-1">Confirmado: {new Date(deliveryReceipt.deliveredAt).toLocaleString("pt-BR")}</p>
                  <p className="mt-1">Produção habilitada: não</p>
                  <p className="mt-1 break-all text-emerald-200/70">Evento: {deliveryReceipt.eventId}</p>
                </div>
              ) : null}
              <section
                data-phase="169-meta-test-delivery-observability"
                className="mt-4 rounded-xl border border-white/[.09] bg-black/15 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white">Diagnóstico seguro do teste</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-400">
                      Reconcilia fila e recibo sem reenviar evento, sem revelar dados da lead e sem habilitar produção.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="atlas-button-secondary px-3 py-2 text-xs"
                    disabled={deliveryObservabilityLoading}
                    onClick={() => void loadDeliveryObservability()}
                  >
                    {deliveryObservabilityLoading ? "Verificando…" : "Atualizar diagnóstico"}
                  </button>
                </div>
                {deliveryObservabilityError ? (
                  <p role="alert" className="mt-3 text-xs text-rose-200">
                    {deliveryObservabilityError}
                  </p>
                ) : null}
                {!deliveryObservabilityLoading
                && !deliveryObservabilityError
                && deliveryObservations.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-400">Nenhum teste controlado foi registrado.</p>
                ) : null}
                <div className="mt-3 space-y-2">
                  {deliveryObservations.slice(0, 3).map((observation) => {
                    const status = {
                      confirmed: ["Confirmado", "text-emerald-200", "border-emerald-400/20"],
                      waiting_local_worker: ["Aguardando worker", "text-sky-200", "border-sky-400/20"],
                      failed_before_external_attempt: ["Falha local segura", "text-amber-200", "border-amber-400/20"],
                      external_result_inconclusive: ["Requer conciliação manual", "text-amber-200", "border-amber-400/20"],
                      dead_letter: ["Bloqueado para revisão", "text-rose-200", "border-rose-400/20"],
                    }[observation.operationalStatus];
                    return (
                      <article
                        key={observation.eventId}
                        className={`rounded-lg border bg-white/[.025] p-3 ${status[2]}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={`text-xs font-semibold ${status[1]}`}>{status[0]}</p>
                          <p className="text-[10px] text-slate-500">
                            {new Date(observation.occurredAt).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                          <span>Tentativas: {observation.attempts}</span>
                          <span>Recibo: {observation.hasReceipt ? "confirmado" : "pendente"}</span>
                          <span>Reenvio: {observation.repeatBlocked ? "bloqueado" : "somente após correção local"}</span>
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-slate-300">{observation.nextAction}</p>
                        <p className="mt-1 break-all text-[10px] text-slate-600">Evento: {observation.eventId}</p>
                      </article>
                    );
                  })}
                </div>
              </section>
              <p className="mt-4 border-t border-white/[.07] pt-4 text-[11px] leading-5 text-slate-500">
                Aprovar, congelar e autorizar não disparam CAPI. Somente o botão final envia um evento ao dataset de teste; campanha e verba não mudam.
              </p>
            </aside>
          </div>
        )}
      </section>
      <details className="group rounded-2xl border border-white/[.07] bg-white/[.02]">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          Gerenciar briefings e criativos
          <span className="ml-2 text-xs font-normal text-slate-500">
            Abrir somente quando necessário
          </span>
        </summary>
        <section className="border-t border-white/[.07] p-5">
          <h2 className="font-semibold text-white">Briefings e criativos</h2>
          <p className="mt-1 text-xs text-slate-500">
            Arquivos privados, versionados e vinculados à campanha.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <select
              aria-label="Campanha do anexo"
              className={input}
              value={assetCampaign}
              onChange={(e) => setAssetCampaign(e.target.value)}
            >
              <option value="">Selecione a campanha</option>
              {data?.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Tipo do anexo"
              className={input}
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
            >
              <option value="briefing">Briefing</option>
              <option value="creative">Criativo</option>
            </select>
            <input
              aria-label="Título do anexo"
              className={input}
              placeholder="Título e versão"
              value={assetTitle}
              onChange={(e) => setAssetTitle(e.target.value)}
            />
            <input
              aria-label="Arquivo da campanha"
              className={input}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setAssetFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button
            className="atlas-button-primary mt-4 disabled:opacity-40"
            disabled={
              saving ||
              !assetCampaign ||
              !assetFile ||
              assetTitle.trim().length < 2
            }
            onClick={() => void uploadAsset()}
          >
            Enviar arquivo
          </button>
        </section>
      </details>
      <details
        id="new-campaign"
        className="group rounded-2xl border border-white/[.07] bg-white/[.02]"
      >
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          Criar campanha interna
          <span className="ml-2 text-xs font-normal text-slate-500">
            Planejamento e vínculo com projeto
          </span>
        </summary>
        <section className="border-t border-white/[.07] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-white">
                Nova campanha interna
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Persistida no Atlas One; Meta não é obrigatória para operar.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs ${data?.metaSync.configured ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}
            >
              {data?.metaSync.configured
                ? "Meta configurada"
                : "Meta não conectada"}
            </span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <label className="text-xs text-slate-400">
              Nome
              <input
                className={`mt-1 ${input}`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="text-xs text-slate-400">
              Projeto
              <select
                className={`mt-1 ${input}`}
                value={form.developmentId}
                onChange={(e) =>
                  setForm({ ...form, developmentId: e.target.value })
                }
              >
                <option value="">Portfólio geral</option>
                {developments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Incorporadora responsável
              <select
                className={`mt-1 ${input}`}
                value={form.developerId}
                onChange={(e) =>
                  setForm({ ...form, developerId: e.target.value })
                }
              >
                <option value="">Herdar do projeto</option>
                {developers.map((developer) => (
                  <option key={developer.id} value={developer.id}>
                    {developer.trade_name ||
                      developer.legal_name ||
                      "Incorporadora"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Canal
              <select
                className={`mt-1 ${input}`}
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              >
                {[
                  "meta",
                  "google",
                  "youtube",
                  "tiktok",
                  "portal",
                  "email",
                  "whatsapp",
                  "outro",
                ].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Orçamento
              <input
                type="number"
                min="0"
                className={`mt-1 ${input}`}
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
            </label>
            <label className="text-xs text-slate-400">
              Início
              <input
                type="date"
                className={`mt-1 ${input}`}
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </label>
            <label className="text-xs text-slate-400">
              Fim
              <input
                type="date"
                className={`mt-1 ${input}`}
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </label>
            <label className="text-xs text-slate-400">
              Status
              <select
                className={`mt-1 ${input}`}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {["draft", "planned", "active", "paused", "completed"].map(
                  (v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Objetivo
              <input
                className={`mt-1 ${input}`}
                value={form.objective}
                onChange={(e) =>
                  setForm({ ...form, objective: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-slate-400 md:col-span-4">
              Briefing
              <textarea
                rows={3}
                className={`mt-1 ${input}`}
                value={form.briefing}
                onChange={(e) => setForm({ ...form, briefing: e.target.value })}
              />
            </label>
          </div>
          <button
            disabled={saving || form.name.trim().length < 2}
            onClick={() => void create()}
            className="atlas-button-primary mt-4 disabled:opacity-40"
          >
            {saving ? "Criando..." : "Criar campanha"}
          </button>
        </section>
      </details>
      <section
        id="campaign-results"
        className="overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.02]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] p-4">
          <div>
            <h2 className="font-semibold text-white">Campanhas internas</h2>
            <p className="text-xs text-slate-500">
              Campanha → leads → vendas. Receita e custo são observados, nunca
              estimados silenciosamente.
            </p>
          </div>
          <input
            className={`${input} max-w-xs`}
            placeholder="Buscar campanha"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading ? (
          <p className="p-8 text-sm text-slate-400">Carregando campanhas…</p>
        ) : !data?.campaigns.length ? (
          <p className="p-8 text-sm text-slate-400">
            Nenhuma campanha cadastrada. Crie a primeira campanha acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/[.02] text-left text-xs text-slate-500">
                <tr>
                  {[
                    "Campanha",
                    "Projeto",
                    "Incorporadora",
                    "Canal",
                    "Período",
                    "Investimento / verba",
                    "Resultados",
                    "Status",
                    "Ações",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[.06]">
                {data.campaigns.map((c) => (
                  <tr key={c.id} className="text-slate-300">
                    <td className="px-4 py-4 font-semibold text-white">
                      {c.name}
                      <p className="mt-1 text-xs font-normal text-slate-500">
                        {c.objective || "Objetivo não informado"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {c.developments?.name || "Portfólio"}
                    </td>
                    <td className="px-4 py-4">
                      <label className="block">
                        <span className="sr-only">
                          Incorporadora responsável pela campanha {c.name}
                        </span>
                        <select
                          className="w-full min-w-44 rounded-lg border border-white/10 bg-[#080d17] px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-400/50"
                          value={c.developer_id ?? ""}
                          aria-label={`Incorporadora responsável pela campanha ${c.name}`}
                          onChange={(e) =>
                            void update(c.id, { developerId: e.target.value })
                          }
                        >
                          <option value="">Herdar do projeto</option>
                          {developers.map((developer) => (
                            <option key={developer.id} value={developer.id}>
                              {developer.trade_name ||
                                developer.legal_name ||
                                "Incorporadora"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="mt-1 text-xs text-slate-500">
                        {c.developer_id
                          ? "Responsável direto da campanha"
                          : "Responsável herdada do projeto"}
                      </p>
                    </td>
                    <td className="px-4 py-4 uppercase">{c.channel}</td>
                    <td className="px-4 py-4">
                      {c.starts_at
                        ? new Date(c.starts_at).toLocaleDateString("pt-BR")
                        : "—"}{" "}
                      →{" "}
                      {c.ends_at
                        ? new Date(c.ends_at).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-semibold text-white">
                        {Number(c.spend || 0) > 0
                          ? money.format(Number(c.spend))
                          : "Custo não informado"}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">
                        Verba planejada: {money.format(Number(c.budget || 0))}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {c.leads_count || 0} leads · {c.sales_count || 0} vendas
                      <p className="mt-1 text-xs text-slate-500">
                        Receita observada:{" "}
                        {money.format(Number(c.revenue || 0))}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <select
                        className="rounded-lg border border-white/10 bg-[#080d17] px-2 py-1 text-xs"
                        value={c.status}
                        onChange={(e) =>
                          void update(c.id, { status: e.target.value })
                        }
                      >
                        {[
                          "draft",
                          "planned",
                          "active",
                          "paused",
                          "completed",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        className="text-xs font-semibold text-rose-300"
                        onClick={() => void archive(c.id)}
                      >
                        Arquivar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
