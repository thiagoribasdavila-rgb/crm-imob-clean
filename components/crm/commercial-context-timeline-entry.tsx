import {
  commercialContextProjectLabel,
  commercialContextSourceLabel,
  type CommercialContextCorrectionTimeline,
  type CommercialContextTimelineValue,
} from "@/lib/atlas/commercial-context-timeline";

type CommercialContextTimelineEntryProps = {
  correction: CommercialContextCorrectionTimeline;
};

function ContextSnapshot({
  label,
  value,
  current = false,
}: {
  label: string;
  value: CommercialContextTimelineValue;
  current?: boolean;
}) {
  return (
    <div
      className={
        current
          ? "rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3"
          : "rounded-xl border border-white/[0.06] bg-black/10 p-3"
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <dl className="mt-2 space-y-2 text-xs">
        <div>
          <dt className="text-slate-500">Projeto</dt>
          <dd className="mt-0.5 font-medium text-slate-200">
            {commercialContextProjectLabel(value)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Origem</dt>
          <dd className="mt-0.5 font-medium text-slate-200">
            {commercialContextSourceLabel(value)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function CommercialContextTimelineEntry({
  correction,
}: CommercialContextTimelineEntryProps) {
  const changedLabel = correction.changedDimensions
    .map((dimension) => (dimension === "project" ? "projeto" : "origem"))
    .join(" e ");

  return (
    <section
      aria-label="Detalhes da correção do contexto comercial"
      className="mt-3 rounded-2xl border border-sky-400/15 bg-sky-400/[0.035] p-3"
      data-atlas-phase="88"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-sky-200">
          Contexto corrigido
        </span>
        <span className="text-[10px] text-slate-500">
          Alteração: {changedLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ContextSnapshot label="Antes" value={correction.previous} />
        <ContextSnapshot label="Agora" value={correction.current} current />
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/10 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Motivo registrado
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-300">
          {correction.reason}
        </p>
      </div>

      <div className="mt-3 grid gap-1 text-[11px] leading-5 text-slate-400">
        <p>
          <span className="font-semibold text-emerald-300">Efeito futuro:</span>{" "}
          próximas decisões, recomendações e resultados usam o contexto atual.
        </p>
        <p>
          <span className="font-semibold text-slate-300">Histórico preservado:</span>{" "}
          eventos e snapshots anteriores continuam como foram registrados.
        </p>
      </div>
    </section>
  );
}
