import { AtlasSkeleton } from "@/components/ui/AtlasUI";

const summarySlots = ["carteira", "prioridade", "pipeline", "resultado"] as const;
const detailSlots = ["operacao", "apoio"] as const;

type ProgressivePageLoadingProps = {
  label?: string;
};

export function ProgressivePageLoading({
  label = "Carregando área comercial",
}: ProgressivePageLoadingProps) {
  return (
    <div
      className="atlas-progressive-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <span className="sr-only">
        Estrutura disponível. Carregando contexto, resumo da operação e detalhes.
      </span>

      <section
        className="atlas-loading-stage atlas-loading-essential rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-6 sm:p-8"
        data-loading-priority="essential"
        aria-hidden="true"
      >
        <div className="flex min-w-0 items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <AtlasSkeleton className="h-4 w-32 rounded-full" />
            <AtlasSkeleton className="mt-5 h-10 w-[min(34rem,86%)]" />
            <AtlasSkeleton className="mt-4 h-4 w-[min(28rem,72%)]" />
          </div>
          <AtlasSkeleton className="hidden h-11 w-32 shrink-0 rounded-xl sm:block" />
        </div>
      </section>

      <section
        className="atlas-loading-stage atlas-loading-summary grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        data-loading-priority="summary"
        aria-hidden="true"
      >
        {summarySlots.map((slot) => (
          <div
            key={slot}
            className="min-h-36 rounded-[22px] border border-white/[0.06] bg-white/[0.02] p-5"
          >
            <AtlasSkeleton className="h-3 w-24 rounded-full" />
            <AtlasSkeleton className="mt-6 h-8 w-20" />
            <AtlasSkeleton className="mt-4 h-3 w-32 rounded-full" />
          </div>
        ))}
      </section>

      <section
        className="atlas-loading-stage atlas-loading-detail grid gap-6 xl:grid-cols-[1.4fr_.8fr]"
        data-loading-priority="detail"
        aria-hidden="true"
      >
        {detailSlots.map((slot) => (
          <div
            key={slot}
            className="min-h-[420px] rounded-[22px] border border-white/[0.06] bg-white/[0.02] p-5"
          >
            <AtlasSkeleton className="h-4 w-36 rounded-full" />
            <AtlasSkeleton className="mt-5 h-3 w-3/5 rounded-full" />
            <AtlasSkeleton className="mt-8 h-[292px] w-full rounded-2xl" />
          </div>
        ))}
      </section>
    </div>
  );
}
