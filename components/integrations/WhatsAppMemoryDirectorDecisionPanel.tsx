"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AtlasBadge, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Decision = {
  id: string;
  decision: "approve" | "reject";
  reason: string;
  evidenceFingerprint: string;
  evidenceMeasuredAt: string;
  createdAt: string;
};

type DecisionState = {
  persistenceReady: boolean;
  evidence: {
    readyForHumanRelease: boolean;
    canBeReviewed: boolean;
    passedControls: number;
    totalControls: number;
    blockers: string[];
    measuredAt: string;
    containsPii: false;
    readsMessageContent: false;
    automaticDecision: false;
  };
  decisions: Decision[];
  learningActivated: false;
  migrationRequired?: string;
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const ENDPOINT = "/api/v1/integrations/whatsapp/memory-director-decision";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

export function WhatsAppMemoryDirectorDecisionPanel() {
  const [state, setState] = useState<DecisionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [scopeConfirmed, setScopeConfirmed] = useState(false);
  const [limitsConfirmed, setLimitsConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = (await response.json()) as ApiEnvelope<DecisionState>;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "Não foi possível carregar a decisão." : body.error.message);
      }
      setState(body.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar esta área.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const formReady = useMemo(
    () =>
      state?.persistenceReady === true &&
      state.evidence.readyForHumanRelease &&
      state.evidence.canBeReviewed &&
      reason.trim().length >= 20 &&
      reason.trim().length <= 1_000 &&
      scopeConfirmed &&
      limitsConfirmed,
    [limitsConfirmed, reason, scopeConfirmed, state],
  );

  async function submitDecision() {
    if (!formReady || submitting) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": `director:${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          decision,
          reason: reason.trim(),
          operationalScopeConfirmed: true,
          evidenceLimitsConfirmed: true,
        }),
      });
      const body = (await response.json()) as ApiEnvelope<{ replayed?: boolean }>;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "A decisão não foi registrada." : body.error.message);
      }
      setNotice(
        body.data.replayed
          ? "A decisão já estava registrada e foi recuperada com segurança."
          : "Decisão registrada no ledger imutável. Nenhuma automação foi ativada.",
      );
      setReason("");
      setScopeConfirmed(false);
      setLimitsConfirmed(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a decisão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AtlasCard purpose="decision" emphasis="primary">
      <AtlasCardHeader
        eyebrow="Fases 374–375 · Decisão da diretoria"
        title="Memória comercial sob controle humano"
        description="O Atlas recalcula somente evidências estruturais no servidor. A escolha fica auditada e nunca ativa aprendizado automaticamente."
        action={
          <AtlasBadge tone={state?.persistenceReady ? "success" : "warning"}>
            {state?.persistenceReady ? "LEDGER PRONTO" : "RECONCILIAR BANCO"}
          </AtlasBadge>
        }
      />

      <div className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
        {loading ? <AtlasSkeleton className="h-44 w-full" /> : null}
        {!loading && error ? (
          <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} />
        ) : null}

        {!loading && state ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AtlasMetric
                label="Controles aprovados"
                value={`${state.evidence.passedControls}/${state.evidence.totalControls}`}
                detail="Medição estrutural recalculada no servidor"
                trend="PROVA"
                tone={state.evidence.readyForHumanRelease ? "green" : "amber"}
              />
              <AtlasMetric
                label="Revisão humana"
                value={state.evidence.canBeReviewed ? "LIBERADA" : "BLOQUEADA"}
                detail={`Evidência de ${formatDate(state.evidence.measuredAt)}`}
                trend="DIRETOR"
                tone={state.evidence.canBeReviewed ? "green" : "amber"}
              />
              <AtlasMetric
                label="Conteúdo e PII"
                value="NÃO LIDOS"
                detail="Somente metadados estruturais entram na prova"
                trend="PRIVADO"
                tone="blue"
              />
              <AtlasMetric
                label="Aprendizado"
                value="INATIVO"
                detail="A decisão não executa ações nem treina modelos"
                trend="SAFE"
                tone="violet"
              />
            </div>

            {!state.persistenceReady ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100">
                <strong>Persistência ainda bloqueada.</strong>{" "}
                {state.migrationRequired ||
                  "Reconcilie a migration incluída na release antes de registrar uma decisão."}
              </div>
            ) : null}

            {state.evidence.blockers.length ? (
              <div className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-sm text-rose-100">
                <p className="font-semibold">Evidências que ainda bloqueiam a decisão</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {state.evidence.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
              <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-4">
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Decisão">
                  <button
                    type="button"
                    onClick={() => setDecision("approve")}
                    aria-pressed={decision === "approve"}
                    className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition ${
                      decision === "approve"
                        ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                        : "border-white/10 text-[var(--text-secondary)]"
                    }`}
                  >
                    Aprovar evidência
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision("reject")}
                    aria-pressed={decision === "reject"}
                    className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition ${
                      decision === "reject"
                        ? "border-rose-300/40 bg-rose-300/10 text-rose-100"
                        : "border-white/10 text-[var(--text-secondary)]"
                    }`}
                  >
                    Rejeitar evidência
                  </button>
                </div>

                <label className="block text-sm font-medium text-[var(--text)]">
                  Justificativa da diretoria
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={1_000}
                    rows={4}
                    placeholder="Explique a decisão com base no escopo operacional observado."
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-[var(--text)] outline-none ring-cyan-300/40 placeholder:text-[var(--text-muted)] focus:ring-2"
                  />
                  <span className="mt-1 block text-right text-xs text-[var(--text-muted)]">
                    {reason.trim().length}/1000 · mínimo 20
                  </span>
                </label>

                <label className="flex gap-3 text-sm leading-6 text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={scopeConfirmed}
                    onChange={(event) => setScopeConfirmed(event.target.checked)}
                    className="mt-1 size-4 accent-cyan-400"
                  />
                  Confirmo que revisei o escopo operacional e os controles medidos.
                </label>
                <label className="flex gap-3 text-sm leading-6 text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={limitsConfirmed}
                    onChange={(event) => setLimitsConfirmed(event.target.checked)}
                    className="mt-1 size-4 accent-cyan-400"
                  />
                  Confirmo que a prova não lê conversas, PII nem toma decisão automática.
                </label>

                <button
                  type="button"
                  onClick={() => void submitDecision()}
                  disabled={!formReady || submitting}
                  className="atlas-button-primary min-h-12 w-full disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? "Registrando com segurança…" : "Registrar decisão da diretoria"}
                </button>
                {notice ? (
                  <p className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3 text-sm text-emerald-100" role="status">
                    {notice}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Últimas decisões</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Histórico imutável desta organização</p>
                  </div>
                  <AtlasBadge tone="info">{state.decisions.length}</AtlasBadge>
                </div>
                <div className="mt-4 space-y-3">
                  {state.decisions.length ? (
                    state.decisions.map((item) => (
                      <article key={item.id} className="rounded-xl border border-white/10 bg-black/15 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <AtlasBadge tone={item.decision === "approve" ? "success" : "danger"}>
                            {item.decision === "approve" ? "APROVADA" : "REJEITADA"}
                          </AtlasBadge>
                          <time className="text-xs text-[var(--text-muted)]">{formatDate(item.createdAt)}</time>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{item.reason}</p>
                        <p className="mt-2 truncate font-mono text-[10px] text-[var(--text-muted)]" title={item.evidenceFingerprint}>
                          Prova {item.evidenceFingerprint}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-[var(--text-muted)]">
                      Nenhuma decisão registrada. O Atlas não assume aprovação por ausência de histórico.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AtlasCard>
  );
}
