"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  assessAssistedInteractionGovernanceReview,
  describeGovernedDecisionDeadline,
  filterGovernedDecisionCycle,
  getNextGovernedDecisionFocus,
  isGovernedDecisionDueSoon,
  prioritizeGovernedDecisionCycle,
  summarizeGovernedDecisionCycle,
  type AssistedInteractionGovernanceReviewState,
  type GovernedDecisionCycleFilter,
} from "@/lib/ai/assisted-interaction-governance";

export type GovernedDecision = {
  id: string;
  priority: number;
  title: string;
  reason: string;
  evidence: string[];
  action: string;
  href: string;
  type: string;
  confidence: number | null;
  sourceId?: string | null;
};
type Assignee = {
  id: string;
  name: string | null;
  role: string | null;
  commercial_role: string | null;
};
type ScenarioRecord = {
  assumption?: string;
  expectedOutcome?: string;
  metric?: string;
  expectedDirection?: string;
  baselineValue?: unknown;
  baselineCapturedAt?: string;
  evaluationAfter?: string;
  realDataConfirmed?: boolean;
};
type ScenarioComparison = {
  observedValue?: unknown;
  delta?: number | null;
  matched?: boolean | null;
  comparable?: boolean;
  evaluatedAt?: string;
};
type LedgerItem = {
  id: string;
  decision_key: string;
  title: string;
  status: string;
  human_decision: string;
  decision_reason: string;
  responsible_id: string;
  due_at: string;
  created_at: string | null;
  outcome_key: string | null;
  outcome_notes: string | null;
  outcome_recorded_at: string | null;
  recommended_action?: { scenario?: ScenarioRecord | null } | null;
  result?: { scenarioComparison?: ScenarioComparison | null } | null;
};
type ApiPayload = {
  data?: {
    actor: { id: string };
    assignees: Assignee[];
    decisions: LedgerItem[];
  };
  error?: { message?: string };
};

const decisionLabels = {
  accept: "Aceitar",
  adapt: "Adaptar",
  reject: "Rejeitar",
} as const;
const outcomeLabels = {
  positive: "Resultado positivo",
  neutral: "Resultado neutro",
  negative: "Resultado negativo",
  not_executed: "Não executada",
} as const;
const metricLabels = {
  lead_stage: "Etapa comercial",
  lead_score: "Score registrado",
  next_action_scheduled: "Próxima ação agendada",
} as const;
const directionLabels = {
  increase: "aumentar/avançar",
  maintain: "permanecer",
  decrease: "reduzir/retroceder",
  be_present: "estar presente",
} as const;
const decisionLedgerFilterLabels: Record<GovernedDecisionCycleFilter, string> =
  {
    attention: "Atenção agora",
    overdue: "Prazos vencidos",
    due_soon: "Vencem em 24h",
    without_deadline: "Sem prazo",
    pending: "Pendentes",
    closed: "Encerrados",
    all: "Todas as decisões",
  };
const decisionLedgerPreviewLimit = 12;

async function token() {
  return (await supabase.auth.getSession()).data.session?.access_token ?? "";
}

async function readApiPayload(response: Response): Promise<ApiPayload> {
  try {
    return (await response.json()) as ApiPayload;
  } catch {
    return {
      error: {
        message:
          "A resposta do Atlas não pôde ser lida agora. Tente novamente.",
      },
    };
  }
}

function describeDecisionRecordTime(value: string | null, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DecisionLearningLedger({
  decisions,
  onAssistedInteractionGovernanceStatus,
}: {
  decisions: GovernedDecision[];
  onAssistedInteractionGovernanceStatus?: (
    status: AssistedInteractionGovernanceReviewState,
  ) => void;
}) {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [actorId, setActorId] = useState("");
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [selected, setSelected] = useState<GovernedDecision | null>(null);
  const [humanDecision, setHumanDecision] =
    useState<keyof typeof decisionLabels>("accept");
  const [responsibleId, setResponsibleId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [canRetryLedger, setCanRetryLedger] = useState(false);
  const [refreshingLedger, setRefreshingLedger] = useState(true);
  const [hasLoadedLedger, setHasLoadedLedger] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null);
  const [outcomeKey, setOutcomeKey] =
    useState<keyof typeof outcomeLabels>("positive");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [decisionQualityRating, setDecisionQualityRating] = useState(3);
  const [validateScenario, setValidateScenario] = useState(false);
  const [assumption, setAssumption] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [scenarioMetric, setScenarioMetric] =
    useState<keyof typeof metricLabels>("lead_stage");
  const [expectedDirection, setExpectedDirection] =
    useState<keyof typeof directionLabels>("increase");
  const [ledgerFilter, setLedgerFilter] =
    useState<GovernedDecisionCycleFilter>("attention");
  const [expandedLedgerFilter, setExpandedLedgerFilter] =
    useState<GovernedDecisionCycleFilter | null>(null);

  async function getAuthenticatedToken() {
    const accessToken = await token();
    if (accessToken) return accessToken;

    setCanRetryLedger(false);
    setMessage(
      "Sua sessão expirou. Atualize a página ou entre novamente antes de alterar o Livro Executivo.",
    );
    return null;
  }

  async function loadLedger({ clearFailureMessage = false } = {}) {
    setRefreshingLedger(true);
    try {
      const accessToken = await getAuthenticatedToken();
      if (!accessToken) return;
      const response = await fetch("/api/v1/decisions/ledger", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const payload = await readApiPayload(response);
      if (!response.ok || !payload.data) {
        setCanRetryLedger(true);
        setMessage(
          payload.error?.message ||
            "Livro executivo temporariamente indisponível.",
        );
        return;
      }
      setAssignees(payload.data.assignees);
      setActorId(payload.data.actor.id);
      setResponsibleId((current) => current || payload.data?.actor.id || "");
      setLedger(payload.data.decisions);
      setHasLoadedLedger(true);
      setCanRetryLedger(false);
      if (clearFailureMessage) setMessage("");
    } catch {
      setCanRetryLedger(true);
      setMessage(
        "Não foi possível atualizar o Livro Executivo agora. Os registros já carregados continuam preservados.",
      );
    } finally {
      setRefreshingLedger(false);
    }
  }
  useEffect(() => {
    void loadLedger();
  }, []);

  const names = useMemo(
    () =>
      new Map(assignees.map((item) => [item.id, item.name || "Usuário Atlas"])),
    [assignees],
  );
  const assistedInteractionGovernanceStatus = useMemo(
    () => assessAssistedInteractionGovernanceReview(ledger),
    [ledger],
  );
  const decisionCycle = useMemo(
    () => summarizeGovernedDecisionCycle(ledger),
    [ledger],
  );
  const prioritizedLedger = useMemo(
    () => prioritizeGovernedDecisionCycle(ledger),
    [ledger],
  );
  const visibleLedger = useMemo(
    () => filterGovernedDecisionCycle(prioritizedLedger, ledgerFilter),
    [ledgerFilter, prioritizedLedger],
  );
  const activeLedgerFilterLabel = decisionLedgerFilterLabels[ledgerFilter];
  const previewLedger = useMemo(
    () => visibleLedger.slice(0, decisionLedgerPreviewLimit),
    [visibleLedger],
  );
  const isFullLedgerVisible = expandedLedgerFilter === ledgerFilter;
  const displayedLedger = isFullLedgerVisible ? visibleLedger : previewLedger;
  const hiddenLedgerCount = Math.max(
    0,
    visibleLedger.length - previewLedger.length,
  );
  const nextDecisionFocus = useMemo(
    () => getNextGovernedDecisionFocus(ledger),
    [ledger],
  );
  const outcomeDecision = useMemo(
    () => ledger.find((item) => item.id === outcomeFor) ?? null,
    [ledger, outcomeFor],
  );
  const ledgerAvailabilityMessage = refreshingLedger
    ? "Carregando decisões registradas…"
    : "Ainda não foi possível trazer o histórico. Tente atualizar quando a conexão estiver disponível.";
  const hasValidScenario =
    !validateScenario ||
    (assumption.trim().length >= 8 && expectedOutcome.trim().length >= 8);
  const canCommitDecision =
    Boolean(selected && responsibleId) &&
    reason.trim().length >= 8 &&
    hasValidScenario;
  const canRecordOutcome = outcomeNotes.trim().length >= 8;
  const outcomeNotesMinimumRemaining = Math.max(
    0,
    8 - outcomeNotes.trim().length,
  );
  useEffect(() => {
    onAssistedInteractionGovernanceStatus?.(
      assistedInteractionGovernanceStatus,
    );
  }, [
    assistedInteractionGovernanceStatus,
    onAssistedInteractionGovernanceStatus,
  ]);
  useEffect(() => {
    if (
      !outcomeFor ||
      refreshingLedger ||
      !hasLoadedLedger ||
      ledger.some((item) => item.id === outcomeFor)
    ) {
      return;
    }

    setOutcomeFor(null);
    setOutcomeNotes("");
    setDecisionQualityRating(3);
    setMessage(
      "A decisão selecionada não está mais no histórico atualizado. Nenhum resultado foi registrado; revise o Livro Executivo antes de continuar.",
    );
  }, [hasLoadedLedger, ledger, outcomeFor, refreshingLedger]);
  function open(decision: GovernedDecision) {
    setSelected(decision);
    setOutcomeFor(null);
    setHumanDecision("accept");
    setResponsibleId(actorId);
    setReason("");
    setMessage("");
    setDueAt("");
    setValidateScenario(false);
    setAssumption("");
    setExpectedOutcome("");
    setScenarioMetric("lead_stage");
    setExpectedDirection("increase");
  }
  function openOutcomeRecording(decisionId: string) {
    setSelected(null);
    setOutcomeFor(decisionId);
    setOutcomeKey("positive");
    setOutcomeNotes("");
    setDecisionQualityRating(3);
    window.requestAnimationFrame(() => {
      const outcomeForm = document.getElementById("resultado-observado");
      outcomeForm?.scrollIntoView({ behavior: "smooth", block: "center" });
      outcomeForm?.focus({ preventScroll: true });
    });
  }
  function dismissOutcomeRecording() {
    setOutcomeFor(null);
    setOutcomeNotes("");
    setDecisionQualityRating(3);
    window.requestAnimationFrame(() => {
      document.getElementById("decisoes-registradas")?.focus({
        preventScroll: true,
      });
    });
  }
  function focusLedger(filter: GovernedDecisionCycleFilter) {
    selectLedgerFilter(filter);
    window.requestAnimationFrame(() => {
      const ledgerElement = document.getElementById("decisoes-registradas");
      ledgerElement?.scrollIntoView({ behavior: "smooth", block: "start" });
      ledgerElement?.focus({ preventScroll: true });
    });
  }
  function selectLedgerFilter(filter: GovernedDecisionCycleFilter) {
    setExpandedLedgerFilter(null);
    setLedgerFilter(filter);
  }
  async function commit() {
    if (!selected) return;
    if (!canCommitDecision) {
      setMessage(
        "Para registrar a decisão, informe responsável e justificativa. Cenários reais também exigem premissa e resultado esperado.",
      );
      return;
    }
    const accessToken = await getAuthenticatedToken();
    if (!accessToken) return;

    setSaving(true);
    setMessage("");
    try {
      const scenario = validateScenario
        ? {
            assumption: assumption.trim(),
            expectedOutcome: expectedOutcome.trim(),
            metric: scenarioMetric,
            expectedDirection,
          }
        : null;
      const response = await fetch("/api/v1/decisions/ledger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "commit",
          decisionKey: selected.id,
          humanDecision,
          responsibleId,
          dueAt,
          reason: reason.trim(),
          scenario,
          snapshot: {
            ...selected,
            priorityBand:
              selected.priority >= 90
                ? "critical"
                : selected.priority >= 75
                  ? "high"
                  : "medium",
          },
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok)
        setMessage(
          payload.error?.message || "Não foi possível registrar a decisão.",
        );
      else {
        setMessage(
          "Decisão registrada. O resultado permanece pendente até confirmação humana.",
        );
        setSelected(null);
        await loadLedger();
      }
    } catch {
      setMessage(
        "Não foi possível registrar a decisão agora. Nada foi alterado; tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function recordOutcome() {
    if (!outcomeFor) return;
    if (!outcomeDecision) {
      setMessage(
        "Não foi possível identificar a decisão que receberá o resultado. Atualize o Livro Executivo e tente novamente.",
      );
      return;
    }
    if (!canRecordOutcome) {
      setMessage(
        "Descreva o resultado observado antes de encerrar o ciclo de aprendizado.",
      );
      return;
    }
    const accessToken = await getAuthenticatedToken();
    if (!accessToken) return;

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/decisions/ledger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "record_outcome",
          decisionId: outcomeFor,
          outcomeKey,
          notes: outcomeNotes.trim(),
          decisionQualityRating,
        }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok)
        setMessage(
          payload.error?.message || "Não foi possível registrar o resultado.",
        );
      else {
        setMessage(
          "Resultado observado registrado; ciclo de aprendizado fechado.",
        );
        window.dispatchEvent(
          new CustomEvent("atlas:operational-task-completed", {
            detail: { taskKey: "decision_outcome", decisionQualityRating },
          }),
        );
        setOutcomeFor(null);
        setOutcomeNotes("");
        setDecisionQualityRating(3);
        await loadLedger();
      }
    } catch {
      setMessage(
        "Não foi possível registrar o resultado agora. O ciclo continua pendente até nova confirmação.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      id="livro-executivo"
      tabIndex={-1}
      className="space-y-4 scroll-mt-6 outline-none focus:ring-2 focus:ring-violet-300/70 focus:ring-offset-2 focus:ring-offset-zinc-950"
      data-ux-phase="55-human-decision-learning-ledger"
      data-current-ux-phase="58-real-scenario-validation"
      data-measurement-phase="59-before-after"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">
            Livro executivo
          </p>
          <h2 className="mt-1 text-xl font-bold">
            Decisão → responsável → prazo → resultado
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Só resultados confirmados por uma pessoa fecham o aprendizado.
            Nenhuma ação externa é automática.
          </p>
        </div>
        <span className="text-xs text-zinc-500">
          {
            ledger.filter(
              (item) =>
                !item.outcome_recorded_at && item.human_decision !== "reject",
            ).length
          }{" "}
          resultado(s) pendente(s)
        </span>
      </div>
      {message ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-sky-400/15 bg-sky-400/[.06] px-4 py-3 text-sm text-sky-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{message}</span>
          {canRetryLedger ? (
            <button
              type="button"
              disabled={refreshingLedger}
              onClick={() => void loadLedger({ clearFailureMessage: true })}
              className="shrink-0 rounded-full border border-sky-300/25 px-3 py-2 text-xs font-semibold text-sky-100 hover:border-sky-300/60 disabled:opacity-50"
            >
              {refreshingLedger ? "Atualizando…" : "Tentar novamente"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {decisions.slice(0, 6).map((decision) => (
          <button
            key={decision.id}
            type="button"
            onClick={() => open(decision)}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4 text-left transition hover:border-blue-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <span className="text-xs text-blue-300">
              Registrar decisão humana
            </span>
            <strong className="mt-2 block text-sm text-white">
              {decision.title}
            </strong>
            <span className="mt-2 block text-xs text-zinc-500">
              Definir responsável, prazo e justificativa →
            </span>
          </button>
        ))}
      </div>
      <section
        aria-label="Resumo semanal do ciclo de decisão"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
      >
        <CycleMetric
          label="Decisões registradas"
          value={decisionCycle.registeredThisWeek}
          detail="Últimos 7 dias"
        />
        <CycleMetric
          label="Resultados pendentes"
          value={decisionCycle.awaitingOutcome}
          detail="Aguardam confirmação humana"
          emphasis={decisionCycle.awaitingOutcome > 0 ? "attention" : "neutral"}
          active={ledgerFilter === "attention"}
          onClick={() => focusLedger("attention")}
        />
        <CycleMetric
          label="Prazos vencidos"
          value={decisionCycle.overdue}
          detail="Revisar antes de decidir novamente"
          emphasis={decisionCycle.overdue > 0 ? "critical" : "neutral"}
          active={ledgerFilter === "overdue"}
          onClick={() => focusLedger("overdue")}
        />
        <CycleMetric
          label="Vencem em 24h"
          value={decisionCycle.dueSoon}
          detail="Agir antes de virar atraso"
          emphasis={decisionCycle.dueSoon > 0 ? "attention" : "neutral"}
          active={ledgerFilter === "due_soon"}
          onClick={() => focusLedger("due_soon")}
        />
        <CycleMetric
          label="Sem prazo"
          value={decisionCycle.withoutDeadline}
          detail="Definir a aferição humana"
          emphasis={decisionCycle.withoutDeadline > 0 ? "attention" : "neutral"}
          active={ledgerFilter === "without_deadline"}
          onClick={() => focusLedger("without_deadline")}
        />
        <CycleMetric
          label="Ciclos encerrados"
          value={decisionCycle.outcomesRecordedThisWeek}
          detail="Resultados registrados na semana"
          emphasis={
            decisionCycle.outcomesRecordedThisWeek > 0 ? "positive" : "neutral"
          }
          active={ledgerFilter === "closed"}
          onClick={() => focusLedger("closed")}
        />
      </section>
      <section
        aria-label="Próxima decisão executiva"
        className={`rounded-2xl border p-4 ${nextDecisionFocus.state === "overdue" ? "border-rose-400/25 bg-rose-400/[.05]" : nextDecisionFocus.state === "pending" || nextDecisionFocus.state === "without_deadline" ? "border-amber-400/20 bg-amber-400/[.05]" : "border-emerald-400/20 bg-emerald-400/[.05]"}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-zinc-400">
              Próxima decisão
            </p>
            {nextDecisionFocus.record ? (
              <>
                <strong className="mt-1 block text-sm text-white">
                  {nextDecisionFocus.state === "overdue"
                    ? "Prazo vencido: "
                    : nextDecisionFocus.state === "without_deadline"
                      ? "Prazo a definir: "
                      : "Resultado a confirmar: "}
                  {nextDecisionFocus.record.title}
                </strong>
                <p className="mt-1 text-xs text-zinc-400">
                  Responsável:{" "}
                  {names.get(nextDecisionFocus.record.responsible_id) ||
                    "Responsável preservado"}{" "}
                  ·{" "}
                  {
                    describeGovernedDecisionDeadline(
                      nextDecisionFocus.record.due_at,
                    ).label
                  }
                </p>
              </>
            ) : (
              <>
                <strong className="mt-1 block text-sm text-emerald-100">
                  Nenhuma confirmação humana pendente.
                </strong>
                <p className="mt-1 text-xs text-zinc-400">
                  O histórico permanece disponível no Livro Executivo.
                </p>
              </>
            )}
          </div>
          {nextDecisionFocus.record ? (
            <button
              type="button"
              onClick={() => {
                const focusRecord = nextDecisionFocus.record;
                if (!focusRecord) return;
                if (
                  !focusRecord.outcome_recorded_at &&
                  focusRecord.human_decision !== "reject"
                ) {
                  openOutcomeRecording(focusRecord.id);
                  return;
                }
                focusLedger(
                  nextDecisionFocus.state === "overdue"
                    ? "overdue"
                    : nextDecisionFocus.state === "without_deadline"
                      ? "without_deadline"
                      : "pending",
                );
              }}
              className="shrink-0 rounded-full border border-zinc-700 bg-zinc-950/40 px-3 py-2 text-xs font-semibold text-zinc-100 hover:border-blue-400/40"
            >
              {!nextDecisionFocus.record.outcome_recorded_at &&
              nextDecisionFocus.record.human_decision !== "reject"
                ? "Registrar resultado"
                : "Ver no livro"}
            </button>
          ) : null}
        </div>
      </section>
      {selected ? (
        <div className="rounded-2xl border border-blue-400/20 bg-blue-400/[.05] p-5">
          <h3 className="font-bold">{selected.title}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-zinc-400">
              Decisão
              <select
                value={humanDecision}
                onChange={(event) =>
                  setHumanDecision(
                    event.target.value as keyof typeof decisionLabels,
                  )
                }
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
              >
                {Object.entries(decisionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Responsável
              <select
                value={responsibleId}
                onChange={(event) => setResponsibleId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
              >
                {assignees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || "Usuário Atlas"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Prazo e data de aferição
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400 md:col-span-2">
              Justificativa humana
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={8}
                maxLength={500}
                rows={3}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
                placeholder="O que foi decidido e por quê?"
              />
            </label>
          </div>
          {selected.sourceId &&
          ["Lead", "Follow-up"].includes(selected.type) ? (
            <div className="mt-4 rounded-xl border border-violet-400/15 bg-violet-400/[.05] p-4">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-violet-100">
                <input
                  type="checkbox"
                  checked={validateScenario}
                  onChange={(event) =>
                    setValidateScenario(event.target.checked)
                  }
                  className="mt-1"
                />
                <span>
                  <strong>Validar como cenário real</strong>
                  <small className="mt-1 block text-xs leading-5 text-zinc-400">
                    Congela a evidência atual da lead e compara com o registro
                    posterior. Não altera etapa, score ou contato.
                  </small>
                </span>
              </label>
              {validateScenario ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-zinc-400 md:col-span-2">
                    Premissa explícita
                    <textarea
                      value={assumption}
                      onChange={(event) => setAssumption(event.target.value)}
                      minLength={8}
                      maxLength={500}
                      rows={2}
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
                      placeholder="Ex.: contato consultivo dentro do prazo tende a avançar esta lead."
                    />
                  </label>
                  <label className="text-xs text-zinc-400 md:col-span-2">
                    Resultado esperado
                    <textarea
                      value={expectedOutcome}
                      onChange={(event) =>
                        setExpectedOutcome(event.target.value)
                      }
                      minLength={8}
                      maxLength={500}
                      rows={2}
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
                      placeholder="Descreva o que deverá ser observável na data de aferição."
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Métrica real
                    <select
                      value={scenarioMetric}
                      onChange={(event) =>
                        setScenarioMetric(
                          event.target.value as keyof typeof metricLabels,
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
                    >
                      {Object.entries(metricLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-400">
                    Direção esperada
                    <select
                      value={expectedDirection}
                      onChange={(event) =>
                        setExpectedDirection(
                          event.target.value as keyof typeof directionLabels,
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
                    >
                      {Object.entries(directionLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={saving || !canCommitDecision}
              onClick={() => void commit()}
              className="rounded-full bg-blue-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {saving ? "Registrando…" : "Confirmar decisão"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-full border border-zinc-700 px-4 py-2 text-xs text-zinc-300"
            >
              Cancelar
            </button>
          </div>
          {!canCommitDecision ? (
            <p className="mt-2 text-xs text-zinc-500">
              Informe o responsável e uma justificativa de ao menos 8
              caracteres. Ao validar um cenário, preencha também a premissa e o
              resultado esperado.
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        id="decisoes-registradas"
        tabIndex={-1}
        className="overflow-hidden rounded-2xl border border-zinc-800 outline-none transition focus:ring-2 focus:ring-sky-300/70 focus:ring-offset-2 focus:ring-offset-zinc-950"
        data-phase="020-decision-ledger-loading-truth"
      >
        <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-900/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Decisões registradas
            </span>
            <p className="mt-1 text-xs text-zinc-500">
              Priorize o que exige decisão agora sem esconder o histórico.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {hasLoadedLedger && refreshingLedger ? (
              <span
                role="status"
                className="rounded-full border border-sky-400/15 bg-sky-400/[.06] px-2 py-1 text-sky-200"
              >
                Atualizando…
              </span>
            ) : null}
            <span
              aria-live="polite"
              className="rounded-full border border-zinc-700 bg-zinc-950/45 px-2 py-1 text-zinc-300"
            >
              Recorte: {activeLedgerFilterLabel}
            </span>
            <span aria-live="polite">
              {visibleLedger.length} de {ledger.length}
            </span>
            <button
              type="button"
              disabled={refreshingLedger}
              onClick={() => void loadLedger({ clearFailureMessage: true })}
              className="rounded-full border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-sky-300/40 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshingLedger ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
        </div>
        {!hasLoadedLedger ? (
          <p role="status" className="p-5 text-sm text-zinc-500">
            {ledgerAvailabilityMessage}
          </p>
        ) : ledger.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">
            Nenhuma decisão humana registrada ainda.
          </p>
        ) : (
          <>
            <div
              role="group"
              aria-label="Filtrar decisões do livro executivo"
              className="flex gap-2 overflow-x-auto border-b border-zinc-800 px-4 py-3"
            >
              <LedgerFilterButton
                active={ledgerFilter === "attention"}
                onClick={() => selectLedgerFilter("attention")}
              >
                Atenção agora ({decisionCycle.awaitingOutcome})
              </LedgerFilterButton>
              <LedgerFilterButton
                active={ledgerFilter === "overdue"}
                onClick={() => selectLedgerFilter("overdue")}
              >
                Vencidos ({decisionCycle.overdue})
              </LedgerFilterButton>
              <LedgerFilterButton
                active={ledgerFilter === "due_soon"}
                onClick={() => selectLedgerFilter("due_soon")}
              >
                Vencem em 24h ({decisionCycle.dueSoon})
              </LedgerFilterButton>
              <LedgerFilterButton
                active={ledgerFilter === "without_deadline"}
                onClick={() => selectLedgerFilter("without_deadline")}
              >
                Sem prazo ({decisionCycle.withoutDeadline})
              </LedgerFilterButton>
              <LedgerFilterButton
                active={ledgerFilter === "pending"}
                onClick={() => selectLedgerFilter("pending")}
              >
                Pendentes
              </LedgerFilterButton>
              <LedgerFilterButton
                active={ledgerFilter === "closed"}
                onClick={() => selectLedgerFilter("closed")}
              >
                Encerrados
              </LedgerFilterButton>
              <LedgerFilterButton
                active={ledgerFilter === "all"}
                onClick={() => selectLedgerFilter("all")}
              >
                Todos
              </LedgerFilterButton>
            </div>
            {visibleLedger.length === 0 ? (
              <div className="flex flex-col items-start gap-3 p-5">
                <p className="text-sm text-zinc-500">
                  Não há decisões em “{activeLedgerFilterLabel}” neste momento.
                </p>
                <button
                  type="button"
                  onClick={() => selectLedgerFilter("all")}
                  className="rounded-full border border-zinc-700 bg-zinc-950/40 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-sky-300/40 hover:text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  Ver todas as decisões
                </button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {displayedLedger.map((item) => {
                  const scenario = item.recommended_action?.scenario;
                  const comparison = item.result?.scenarioComparison;
                  const isAssistedInteractionGovernance =
                    item.decision_key ===
                    "human:assisted-interaction-learning-review";
                  const deadline = describeGovernedDecisionDeadline(
                    item.due_at,
                  );
                  const isOverdue =
                    !item.outcome_recorded_at &&
                    item.human_decision !== "reject" &&
                    deadline.state === "overdue";
                  const outcomePending =
                    !item.outcome_recorded_at &&
                    item.human_decision !== "reject";
                  const isDueSoon = isGovernedDecisionDueSoon(item);
                  return (
                    <article key={item.id} className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          {isAssistedInteractionGovernance ? (
                            <span className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-200">
                              Governança de IA
                            </span>
                          ) : null}
                          <strong className="mt-1 block text-sm text-white">
                            {item.title}
                          </strong>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {isOverdue ? (
                              <span className="rounded-full bg-rose-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-200">
                                Prazo vencido
                              </span>
                            ) : null}
                            {isDueSoon ? (
                              <span className="rounded-full bg-sky-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-200">
                                Vence em 24h
                              </span>
                            ) : null}
                            {outcomePending && !isOverdue ? (
                              <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                                Resultado pendente
                              </span>
                            ) : null}
                            {deadline.state === "unscheduled" ? (
                              <span className="rounded-full bg-zinc-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
                                Sem prazo
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs text-zinc-400">
                            {decisionLabels[
                              item.human_decision as keyof typeof decisionLabels
                            ] || item.human_decision}{" "}
                            ·{" "}
                            {names.get(item.responsible_id) ||
                              "Responsável preservado"}{" "}
                            · {deadline.label}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-600">
                            Registrada em{" "}
                            {describeDecisionRecordTime(
                              item.created_at,
                              "data preservada sem leitura disponível",
                            )}
                          </p>
                          <p className="mt-2 text-xs text-zinc-500">
                            {item.decision_reason}
                          </p>
                          {scenario ? (
                            <div className="mt-3 rounded-xl border border-violet-400/15 bg-violet-400/[.04] p-3 text-xs leading-5 text-zinc-400">
                              <strong className="text-violet-200">
                                Cenário com fonte real confirmada
                              </strong>
                              <p>Premissa: {scenario.assumption}</p>
                              <p>Esperado: {scenario.expectedOutcome}</p>
                              <p>
                                {metricLabels[
                                  scenario.metric as keyof typeof metricLabels
                                ] || scenario.metric}
                                : base{" "}
                                {String(scenario.baselineValue ?? "sem valor")}{" "}
                                · esperado{" "}
                                {directionLabels[
                                  scenario.expectedDirection as keyof typeof directionLabels
                                ] || scenario.expectedDirection}
                              </p>
                              {comparison ? (
                                <p
                                  className={
                                    comparison.matched
                                      ? "text-emerald-300"
                                      : "text-amber-300"
                                  }
                                >
                                  Observado:{" "}
                                  {String(
                                    comparison.observedValue ?? "sem valor",
                                  )}{" "}
                                  ·{" "}
                                  {comparison.comparable
                                    ? comparison.matched
                                      ? "expectativa observada"
                                      : "expectativa não observada"
                                    : "evidência não comparável"}
                                </p>
                              ) : (
                                <p className="text-zinc-500">
                                  Comparação aguardando a data e o resultado
                                  posterior.
                                </p>
                              )}
                            </div>
                          ) : null}
                          {item.outcome_recorded_at ? (
                            <p className="mt-2 text-xs text-emerald-300">
                              {outcomeLabels[
                                item.outcome_key as keyof typeof outcomeLabels
                              ] || "Resultado registrado"}
                              : {item.outcome_notes}{" "}
                              <span className="text-emerald-300/70">
                                · confirmado em{" "}
                                {describeDecisionRecordTime(
                                  item.outcome_recorded_at,
                                  "data preservada sem leitura disponível",
                                )}
                              </span>
                            </p>
                          ) : null}
                        </div>
                        {!item.outcome_recorded_at &&
                        item.human_decision !== "reject" ? (
                          <button
                            type="button"
                            onClick={() => openOutcomeRecording(item.id)}
                            className="rounded-full border border-emerald-400/25 px-3 py-2 text-xs font-semibold text-emerald-200"
                          >
                            Registrar resultado
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-500">
                            Ciclo fechado
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
                {hiddenLedgerCount > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950/30 px-4 py-3 text-xs text-zinc-500">
                    <p>
                      {isFullLedgerVisible
                        ? `${visibleLedger.length} decisões exibidas neste recorte.`
                        : `Leitura rápida: ${previewLedger.length} decisões prioritárias exibidas. Outras ${hiddenLedgerCount} seguem preservadas neste filtro.`}
                    </p>
                    {isFullLedgerVisible ? (
                      <button
                        type="button"
                        onClick={() => setExpandedLedgerFilter(null)}
                        className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-sky-300/40 hover:text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                      >
                        Mostrar leitura rápida
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpandedLedgerFilter(ledgerFilter)}
                        className="rounded-full border border-sky-400/30 bg-sky-400/[.07] px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:border-sky-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                      >
                        Exibir {hiddenLedgerCount} decisões
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
      {outcomeFor ? (
        <div
          id="resultado-observado"
          tabIndex={-1}
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.05] p-5 outline-none focus:ring-2 focus:ring-emerald-300/70 focus:ring-offset-2 focus:ring-offset-zinc-950"
        >
          <h3 className="font-bold">Resultado observado</h3>
          {outcomeDecision ? (
            <div className="mt-2 rounded-xl border border-zinc-700/70 bg-zinc-950/35 p-3 text-xs text-zinc-400">
              <strong className="block text-sm text-white">
                {outcomeDecision.title}
              </strong>
              <p className="mt-1">
                {decisionLabels[
                  outcomeDecision.human_decision as keyof typeof decisionLabels
                ] || outcomeDecision.human_decision}
                {" · "}
                {names.get(outcomeDecision.responsible_id) ||
                  "Responsável preservado"}
                {" · "}
                {describeGovernedDecisionDeadline(outcomeDecision.due_at).label}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-200">
              A decisão não está mais disponível neste histórico. Atualize o
              Livro Executivo antes de registrar o resultado.
            </p>
          )}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-zinc-400">
              Resultado da ação
              <select
                value={outcomeKey}
                onChange={(event) =>
                  setOutcomeKey(
                    event.target.value as keyof typeof outcomeLabels,
                  )
                }
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
              >
                {Object.entries(outcomeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Qualidade da decisão (avaliação humana)
              <select
                value={decisionQualityRating}
                onChange={(event) =>
                  setDecisionQualityRating(Number(event.target.value))
                }
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} —{" "}
                    {value === 1
                      ? "muito baixa"
                      : value === 5
                        ? "muito alta"
                        : "avaliada"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400 md:col-span-2">
              O que realmente aconteceu
              <textarea
                value={outcomeNotes}
                onChange={(event) => setOutcomeNotes(event.target.value)}
                minLength={8}
                maxLength={500}
                rows={3}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"
                placeholder="Ex.: cliente recebeu a proposta, respondeu e confirmou a visita."
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                {outcomeNotesMinimumRemaining > 0
                  ? `Faltam ${outcomeNotesMinimumRemaining} caracteres para confirmar.`
                  : "Descrição suficiente para confirmação."}{" "}
                {outcomeNotes.length}/500
              </span>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={saving || !canRecordOutcome || !outcomeDecision}
              onClick={() => void recordOutcome()}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-zinc-950 disabled:opacity-50"
            >
              Confirmar resultado
            </button>
            <button
              type="button"
              onClick={dismissOutcomeRecording}
              className="rounded-full border border-zinc-700 px-4 py-2 text-xs text-zinc-300"
            >
              Cancelar
            </button>
          </div>
          {!outcomeDecision ? (
            <p className="mt-2 text-xs text-amber-200">
              Atualize o Livro Executivo para confirmar qual decisão será
              encerrada.
            </p>
          ) : !canRecordOutcome ? (
            <p className="mt-2 text-xs text-zinc-500">
              Descreva o resultado observado com ao menos 8 caracteres para
              encerrar o ciclo.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CycleMetric({
  label,
  value,
  detail,
  emphasis = "neutral",
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  emphasis?: "neutral" | "attention" | "critical" | "positive";
  active?: boolean;
  onClick?: () => void;
}) {
  const tone =
    emphasis === "critical"
      ? "border-rose-400/20 bg-rose-400/[.05]"
      : emphasis === "attention"
        ? "border-amber-400/20 bg-amber-400/[.05]"
        : emphasis === "positive"
          ? "border-emerald-400/20 bg-emerald-400/[.05]"
          : "border-zinc-800 bg-zinc-900/45";
  const content = (
    <>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={`Ver decisões: ${label}`}
        className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-300/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${active ? "ring-1 ring-sky-300/55" : ""} ${tone}`}
      >
        {content}
      </button>
    );
  }

  return (
    <article className={`rounded-2xl border p-4 ${tone}`}>{content}</article>
  );
}

function LedgerFilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${active ? "border-blue-400/45 bg-blue-400/15 text-blue-100" : "border-zinc-700 bg-zinc-950/40 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`}
    >
      {children}
    </button>
  );
}
