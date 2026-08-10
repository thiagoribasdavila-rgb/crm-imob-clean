"use client";

import { useState } from "react";
import type {
  AssistedInteractionChannel,
  AssistedInteractionDraft,
} from "@/lib/ai/assisted-interaction";
import { supabase } from "@/lib/supabase";

type Generation = {
  provider: string;
  model: string;
  mode: "generative" | "local-fallback";
};

type Props = {
  leadId: string;
  onConfirmed: () => void | Promise<void>;
};

type PreparationFeedback = "helpful" | "needs_adjustment" | "not_useful";

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10";

const channels: Array<{ value: AssistedInteractionChannel; label: string }> = [
  { value: "call", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "meeting", label: "Reunião" },
  { value: "visit", label: "Visita" },
  { value: "email", label: "E-mail" },
  { value: "note", label: "Outro" },
];

export function AssistedInteractionCapture({ leadId, onConfirmed }: Props) {
  const [sourceText, setSourceText] = useState("");
  const [channel, setChannel] = useState<AssistedInteractionChannel>("call");
  const [draft, setDraft] = useState<AssistedInteractionDraft | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [captureId, setCaptureId] = useState("");
  const [confirmedCaptureId, setConfirmedCaptureId] = useState("");
  const [feedback, setFeedback] = useState<PreparationFeedback | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(body: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente.");
    const response = await fetch(
      `/api/v1/leads/${leadId}/assisted-interaction`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : "Não foi possível concluir a ação.",
      );
    }
    return payload;
  }

  function resetDraft() {
    setDraft(null);
    setGeneration(null);
    setCaptureId("");
    setReviewed(false);
  }

  function editDraft(patch: Partial<AssistedInteractionDraft>) {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setReviewed(false);
    setError(null);
  }

  async function analyze() {
    if (analyzing || sourceText.trim().length < 8) return;
    setAnalyzing(true);
    setError(null);
    setReviewed(false);
    setConfirmedCaptureId("");
    setFeedback(null);
    const nextCaptureId = crypto.randomUUID();
    try {
      const payload = await request({
        action: "draft",
        sourceText,
        channel,
        captureId: nextCaptureId,
      });
      const nextDraft = payload.draft as AssistedInteractionDraft | undefined;
      if (
        !nextDraft ||
        typeof nextDraft.outcome !== "string" ||
        typeof nextDraft.summary !== "string" ||
        typeof nextDraft.nextAction !== "string" ||
        !Array.isArray(nextDraft.objections)
      ) {
        throw new Error("O rascunho retornou incompleto. Tente novamente.");
      }
      setDraft(nextDraft);
      const nextGeneration = payload.generation as Partial<Generation> | undefined;
      setGeneration({
        provider: typeof nextGeneration?.provider === "string"
          ? nextGeneration.provider
          : "local",
        model: typeof nextGeneration?.model === "string"
          ? nextGeneration.model
          : "deterministic-safe-fallback",
        mode: nextGeneration?.mode === "generative"
          ? "generative"
          : "local-fallback",
      });
      setCaptureId(nextCaptureId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível analisar este atendimento.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function confirm() {
    if (!draft || !reviewed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await request({
        action: "confirm",
        sourceText,
        channel,
        ...draft,
        humanConfirmed: true,
        captureId,
        generatedBy: generation?.provider ?? "local",
        model: generation?.model ?? "deterministic-safe-fallback",
      });
      setConfirmedCaptureId(captureId);
      setFeedback(null);
      setSourceText("");
      resetDraft();
      await onConfirmed();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível salvar o atendimento revisado.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitFeedback(value: PreparationFeedback) {
    if (!confirmedCaptureId || savingFeedback || feedback) return;
    setSavingFeedback(true);
    setError(null);
    try {
      await request({ action: "feedback", captureId: confirmedCaptureId, feedback: value });
      setFeedback(value);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível registrar sua avaliação.");
    } finally {
      setSavingFeedback(false);
    }
  }

  function discard() {
    if (!captureId || saving) {
      resetDraft();
      return;
    }
    void request({ action: "discard", captureId, channel }).catch(() => undefined);
    resetDraft();
  }

  return (
    <section
      data-phase="001-assisted-interaction-capture"
      className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-400/[.07] via-white/[.025] to-violet-400/[.05] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
            Captura assistida
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            Transforme o atendimento em próxima ação
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
            Cole sua anotação após a ligação ou conversa. O Atlas prepara um
            rascunho; nada entra no histórico antes da sua revisão.
          </p>
        </div>
        <span className="w-fit rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-medium text-amber-200">
          Confirmação humana obrigatória
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[150px_1fr]">
        <label className="space-y-1.5 text-xs text-slate-400">
          Canal
          <select
            className={fieldClass}
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value as AssistedInteractionChannel);
              resetDraft();
              setError(null);
            }}
          >
            {channels.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs text-slate-400">
          Anotação original
          <textarea
            className={`${fieldClass} min-h-24 resize-y`}
            value={sourceText}
            maxLength={5_000}
            onChange={(event) => {
              setSourceText(event.target.value);
              resetDraft();
              setError(null);
            }}
            placeholder="Ex.: cliente gostou da planta, achou a entrada alta e pediu retorno amanhã após as 18h."
          />
        </label>
      </div>

      {!draft ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            O texto original só será preservado no CRM depois da confirmação.
          </p>
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={analyzing || sourceText.trim().length < 8}
            className="atlas-button-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {analyzing ? "Preparando rascunho..." : "Analisar atendimento"}
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">
                Rascunho para revisão
              </p>
              <p className="text-[11px] text-slate-500">
                Edite qualquer campo antes de confirmar.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-slate-400">
              {generation?.mode === "generative"
                ? "IA conectada · revisão pendente"
                : "Análise local · revisão pendente"}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs text-slate-400">
              Resultado do contato
              <input
                className={fieldClass}
                value={draft.outcome}
                maxLength={120}
                onChange={(event) =>
                  editDraft({ outcome: event.target.value })
                }
              />
            </label>
            <label className="space-y-1.5 text-xs text-slate-400">
              Intenção percebida
              <input
                className={fieldClass}
                value={draft.intent}
                maxLength={120}
                onChange={(event) =>
                  editDraft({ intent: event.target.value })
                }
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-xs text-slate-400">
            Objeções identificadas
            <input
              className={fieldClass}
              value={draft.objections.join(", ")}
              maxLength={360}
              placeholder="Preço, financiamento, localização..."
              onChange={(event) =>
                editDraft({
                  objections: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .slice(0, 6),
                })
              }
            />
          </label>

          <label className="block space-y-1.5 text-xs text-slate-400">
            Resumo comercial
            <textarea
              className={`${fieldClass} min-h-20 resize-y`}
              value={draft.summary}
              maxLength={700}
              onChange={(event) =>
                editDraft({ summary: event.target.value })
              }
            />
          </label>

          <label className="block space-y-1.5 text-xs text-slate-400">
            Próxima ação sugerida
            <textarea
              className={`${fieldClass} min-h-16 resize-y`}
              value={draft.nextAction}
              maxLength={300}
              onChange={(event) =>
                editDraft({ nextAction: event.target.value })
              }
            />
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-300">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-cyan-400"
            />
            Revisei o resultado, o resumo e a próxima ação. Confirmo este
            registro no histórico do cliente.
          </label>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-white/[.04] disabled:opacity-40"
            >
              Descartar rascunho
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={
                !reviewed ||
                saving ||
                !draft.outcome.trim() ||
                !draft.summary.trim() ||
                !draft.nextAction.trim()
              }
              className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-lg shadow-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Salvando registro..." : "Confirmar no histórico"}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {confirmedCaptureId ? (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-200">A preparação ajudou neste atendimento?</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Sua avaliação melhora a orientação futura. Nenhuma ação é enviada ao cliente.</p>
          </div>
          {feedback ? (
            <span className="text-xs font-medium text-emerald-300">Avaliação registrada</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={savingFeedback} onClick={() => void submitFeedback("helpful")} className="rounded-lg border border-emerald-300/25 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 disabled:opacity-50">Ajudou</button>
              <button type="button" disabled={savingFeedback} onClick={() => void submitFeedback("needs_adjustment")} className="rounded-lg border border-amber-300/25 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 disabled:opacity-50">Precisa ajustar</button>
              <button type="button" disabled={savingFeedback} onClick={() => void submitFeedback("not_useful")} className="rounded-lg border border-rose-300/25 px-2.5 py-1.5 text-[11px] font-medium text-rose-200 disabled:opacity-50">Não ajudou</button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
