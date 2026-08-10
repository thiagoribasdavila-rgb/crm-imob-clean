"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  buildAssistedInteractionGovernanceDecision,
  type AssistedInteractionGovernanceDecision,
  type AssistedInteractionGovernanceReviewState,
} from "@/lib/ai/assisted-interaction-governance";

type Measurement = {
  summary: {
    drafted: number;
    confirmed: number;
    discarded: number;
    feedbackReceived: number;
    helpful: number;
    needsAdjustment: number;
    notUseful: number;
    helpfulRate: number | null;
    confirmationRate: number | null;
    medianMinutesToConfirmation: number | null;
    averageMinutesToNextAction: number | null;
    measurementsWithNextAction: number;
  };
  period: { days: number };
  learning: {
    status: "insufficient_sample" | "observe" | "review" | "stable";
    sample: {
      draftedMinimum: number;
      feedbackMinimum: number;
      hasDraftSample: boolean;
      hasFeedbackSample: boolean;
    };
    title: string;
    recommendation: string;
    evidence: string;
    humanReviewRequired: true;
    automaticExternalAction: false;
  };
};

function rate(value: number | null) {
  return value === null ? "Sem amostra" : `${value.toFixed(1)}%`;
}

function duration(value: number | null) {
  if (value === null) return "Sem amostra";
  if (value < 60) return `${Math.round(value)} min`;
  return `${(value / 60).toFixed(1)} h`;
}

export function AssistedInteractionLearningPanel({
  onGovernanceReview,
  governanceStatus,
}: {
  onGovernanceReview?: (
    decision: AssistedInteractionGovernanceDecision | null,
  ) => void;
  governanceStatus?: AssistedInteractionGovernanceReviewState;
}) {
  const [data, setData] = useState<Measurement | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;
      const response = await fetch(
        "/api/v1/analytics/assisted-interaction?days=30",
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!active) return;
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        setUnavailable(true);
        return;
      }
      const payload = (await response.json()) as { data?: Measurement };
      if (payload.data) setData(payload.data);
      else setUnavailable(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const governanceDecision = useMemo(
    () =>
      data
        ? buildAssistedInteractionGovernanceDecision({
            learning: data.learning,
            ...data.summary,
          })
        : null,
    [data],
  );

  function focusGovernanceReview(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const ledger = document.getElementById("livro-executivo");
    if (!ledger) return;
    ledger.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => ledger.focus({ preventScroll: true }));
  }

  useEffect(() => {
    onGovernanceReview?.(governanceDecision);
    return () => onGovernanceReview?.(null);
  }, [governanceDecision, onGovernanceReview]);

  if (forbidden || unavailable) return null;
  if (!data) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-500">
        Preparando a leitura de aprendizado supervisionado…
      </section>
    );
  }

  const { summary } = data;
  const hasSample = summary.drafted > 0;
  const feedbackDetail = summary.feedbackReceived
    ? `${summary.helpful} ajudou · ${summary.needsAdjustment} ajustar · ${summary.notUseful} não ajudou`
    : "Aguardando avaliações humanas opcionais.";

  return (
    <section
      data-phase="004-assisted-interaction-learning-panel"
      className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-400/[.06] via-zinc-900/60 to-violet-400/[.05] p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">
            Aprendizado supervisionado
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">
            Captura assistida: uso e retorno humano
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
            Leitura agregada dos últimos {data.period.days} dias. Não exibe
            conteúdo de atendimentos nem executa contatos.
          </p>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-zinc-300">
          Gestão
        </span>
      </div>

      {!hasSample ? (
        <p className="mt-5 rounded-xl border border-dashed border-white/10 bg-black/15 p-4 text-sm leading-6 text-zinc-400">
          Ainda não há capturas assistidas suficientes para leitura. Os
          primeiros dados aparecerão após revisão e confirmação humana no Lead
          360.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Rascunhos preparados"
            value={String(summary.drafted)}
            detail={`${summary.confirmed} confirmados · ${summary.discarded} descartados`}
          />
          <Metric
            label="Confirmação humana"
            value={rate(summary.confirmationRate)}
            detail="Somente registros revisados entram no histórico."
          />
          <Metric
            label="Preparação ajudou"
            value={rate(summary.helpfulRate)}
            detail={feedbackDetail}
          />
          <Metric
            label="Próxima ação"
            value={duration(summary.averageMinutesToNextAction)}
            detail={`${summary.measurementsWithNextAction} registro(s) com ação posterior observada`}
          />
        </div>
      )}
      <aside className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-200">
          Leitura do Atlas
        </p>
        <p className="mt-2 text-sm font-semibold text-white">
          {data.learning.title}
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-400">
          {data.learning.recommendation}
        </p>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Evidência: {data.learning.evidence}
        </p>
        {governanceDecision ? (
          <a
            href="#livro-executivo"
            onClick={focusGovernanceReview}
            className="mt-4 inline-flex rounded-full border border-violet-300/30 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:border-violet-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
          >
            {governanceStatus?.state === "pending_outcome"
              ? "Ver revisão em acompanhamento →"
              : governanceStatus?.state === "closed"
                ? "Ver revisão encerrada →"
                : "Registrar revisão no Livro Executivo →"}
          </a>
        ) : null}
        {governanceStatus && governanceStatus.state !== "not_started" ? (
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            <strong className="text-zinc-300">{governanceStatus.label}.</strong>{" "}
            {governanceStatus.detail}
          </p>
        ) : null}
      </aside>
      <p className="mt-4 text-xs leading-5 text-zinc-500">
        A avaliação indica utilidade percebida pelo corretor; não comprova
        qualidade do atendimento nem resultado de venda. Qualquer revisão exige
        aprovação humana e nunca executa ações externas automaticamente.
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{detail}</p>
    </article>
  );
}
