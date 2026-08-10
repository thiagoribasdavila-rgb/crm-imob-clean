"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Checklist = {
  key: string;
  label: string;
  passed: boolean;
  evidence: string;
};
type Gate = {
  status: "blocked" | "ready_for_director" | "approved" | "rolled_back";
  enabled: boolean;
  evidenceReady: boolean;
  canDecide: boolean;
  checklist: Checklist[];
  rollbackTarget: string;
  caveat: string;
  decision: null | {
    utilityRating: number | null;
    directorReason: string | null;
    decidedAt: string | null;
    rollbackReason: string | null;
  };
};

type LoadState = "loading" | "ready" | "unavailable";
type UnavailableReason = "session" | "connection" | null;

const labels = {
  blocked: "Bloqueado por evidência",
  ready_for_director: "Pronto para decisão",
  approved: "Liberado pela Diretoria",
  rolled_back: "Rollback acionado",
};

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

function isChecklist(value: unknown): value is Checklist[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => {
      if (!item || typeof item !== "object") return false;
      const checklistItem = item as Record<string, unknown>;
      return (
        typeof checklistItem.key === "string" &&
        typeof checklistItem.label === "string" &&
        typeof checklistItem.passed === "boolean" &&
        typeof checklistItem.evidence === "string"
      );
    })
  );
}

function isGate(value: unknown): value is Gate {
  if (!value || typeof value !== "object") return false;
  const gate = value as Record<string, unknown>;
  const validStatus = Object.hasOwn(labels, String(gate.status));

  if (
    !validStatus ||
    typeof gate.enabled !== "boolean" ||
    typeof gate.evidenceReady !== "boolean" ||
    typeof gate.canDecide !== "boolean" ||
    !isChecklist(gate.checklist) ||
    typeof gate.rollbackTarget !== "string" ||
    typeof gate.caveat !== "string"
  ) {
    return false;
  }

  if (gate.decision === null) return true;
  if (!gate.decision || typeof gate.decision !== "object") return false;
  const decision = gate.decision as Record<string, unknown>;

  return (
    (decision.utilityRating === null ||
      (typeof decision.utilityRating === "number" &&
        Number.isFinite(decision.utilityRating))) &&
    isNullableString(decision.directorReason) &&
    isNullableString(decision.decidedAt) &&
    isNullableString(decision.rollbackReason)
  );
}

export function OperationalUxReleaseGate() {
  const [gate, setGate] = useState<Gate | null>(null);
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState(4);
  const [acknowledged, setAcknowledged] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [unavailableReason, setUnavailableReason] =
    useState<UnavailableReason>(null);
  const latestLoad = useRef(0);
  const isMounted = useRef(false);

  const load = useCallback(async () => {
    const loadId = ++latestLoad.current;
    const isCurrentLoad = () =>
      isMounted.current && latestLoad.current === loadId;
    setLoadState("loading");
    setUnavailableReason(null);
    try {
      const token = (await supabase.auth.getSession()).data.session
        ?.access_token;
      if (!token) {
        if (isCurrentLoad()) {
          setUnavailableReason("session");
          setLoadState("unavailable");
        }
        return;
      }

      const response = await fetch(
        "/api/v1/analytics/operational-ux-release-gate",
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("gate-unavailable");

      const payload = (await response.json()) as { data?: unknown };
      if (!isGate(payload.data)) throw new Error("invalid-gate");
      if (!isCurrentLoad()) return;
      setGate(payload.data);
      setLoadState("ready");
    } catch {
      if (!isCurrentLoad()) return;
      setUnavailableReason((reason) => reason ?? "connection");
      setLoadState("unavailable");
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void load();
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  const canRecordDecision = reason.trim().length >= 12;
  const canApprove =
    canRecordDecision && acknowledged && gate?.evidenceReady === true;

  async function decide(action: "approve" | "rollback") {
    if (!canRecordDecision || (action === "approve" && !canApprove)) return;
    setFeedback("");
    setSaving(true);

    try {
      const token = (await supabase.auth.getSession()).data.session
        ?.access_token;
      if (!isMounted.current) return;
      if (!token) {
        setFeedback(
          "Sua sessão expirou. Atualize a página ou entre novamente antes de registrar uma decisão.",
        );
        return;
      }

      const response = await fetch(
        "/api/v1/analytics/operational-ux-release-gate",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            reason,
            utilityRating: rating,
            checklistAcknowledged: acknowledged,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!isMounted.current) return;
      if (!response.ok) {
        setFeedback(
          payload?.error?.message ?? "Não foi possível registrar a decisão.",
        );
        return;
      }

      setFeedback(
        action === "approve"
          ? "Redesign autorizado para a próxima release."
          : "Rollback registrado; a experiência segura anterior é o alvo ativo.",
      );
      setReason("");
      setAcknowledged(false);
      await load();
    } catch {
      if (!isMounted.current) return;
      setFeedback(
        "Não foi possível registrar a decisão agora. Nenhuma alteração foi aplicada.",
      );
    } finally {
      if (isMounted.current) setSaving(false);
    }
  }

  if (loadState === "loading") {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-500">
        Validando gate de liberação…
      </section>
    );
  }

  if (loadState === "unavailable" || !gate) {
    return (
      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[.06] p-5">
        <p className="text-sm font-semibold text-amber-100">
          O gate de liberação não está disponível agora.
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-400">
          {unavailableReason === "session"
            ? "Sua sessão expirou. Entre novamente antes de consultar ou registrar uma decisão."
            : "Nenhuma release foi autorizada ou revertida. Atualize a leitura antes de tomar uma decisão."}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-full border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
        >
          Atualizar gate
        </button>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5"
      data-ux-phase="60-release-gate"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">
            Gate final do redesign
          </p>
          <h2 className="mt-1 text-xl font-bold">{labels[gate.status]}</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${gate.enabled ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}
        >
          {gate.enabled ? "Release autorizada" : "Sem liberação automática"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {gate.checklist.map((item) => (
          <article
            key={item.key}
            className="rounded-xl border border-white/[0.06] bg-black/15 p-3"
          >
            <p
              className={
                item.passed
                  ? "text-sm font-semibold text-emerald-300"
                  : "text-sm font-semibold text-amber-300"
              }
            >
              {item.passed ? "✓" : "○"} {item.label}
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              {item.evidence}
            </p>
          </article>
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        {gate.caveat} Rollback previsto para{" "}
        <strong className="text-zinc-300">{gate.rollbackTarget}</strong>.
      </p>

      {gate.decision?.directorReason ? (
        <div className="mt-4 rounded-xl border border-emerald-400/10 bg-emerald-400/[.04] p-3 text-sm text-zinc-300">
          <strong>Aceite da Diretoria:</strong> {gate.decision.directorReason}{" "}
          {gate.decision.utilityRating
            ? `(${gate.decision.utilityRating}/5)`
            : ""}
        </div>
      ) : null}
      {gate.decision?.rollbackReason ? (
        <div className="mt-4 rounded-xl border border-amber-400/10 bg-amber-400/[.04] p-3 text-sm text-zinc-300">
          <strong>Motivo do rollback:</strong> {gate.decision.rollbackReason}
        </div>
      ) : null}

      {gate.canDecide ? (
        <div className="mt-5 space-y-3 border-t border-white/[0.06] pt-5">
          <label className="block text-xs font-semibold text-zinc-300">
            Justificativa da Diretoria
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              className="mt-2 min-h-24 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm outline-none focus:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-300/70"
              placeholder="Explique a utilidade observada ou o motivo do rollback."
            />
          </label>
          <p className="text-xs text-zinc-500" aria-live="polite">
            {canRecordDecision
              ? "Justificativa válida para registro."
              : "Informe pelo menos 12 caracteres para registrar a decisão."}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-xs text-zinc-300">
              Utilidade
              <select
                value={rating}
                onChange={(event) => setRating(Number(event.target.value))}
                className="ml-2 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
              >
                <option value={4}>4/5</option>
                <option value={5}>5/5</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              Revisei evidências e checklist
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !canApprove}
              onClick={() => void decide("approve")}
              className="rounded-full bg-blue-500 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Aprovar redesign
            </button>
            <button
              type="button"
              disabled={saving || !canRecordDecision}
              onClick={() => void decide("rollback")}
              className="rounded-full border border-amber-400/20 px-4 py-2 text-xs font-semibold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Acionar rollback
            </button>
          </div>
          {feedback ? (
            <p role="status" className="text-xs text-zinc-300">
              {feedback}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 border-t border-white/[0.06] pt-4 text-xs text-zinc-500">
          Apenas a Diretoria registra aceite ou rollback; demais gestores
          acompanham as evidências.
        </p>
      )}
    </section>
  );
}
