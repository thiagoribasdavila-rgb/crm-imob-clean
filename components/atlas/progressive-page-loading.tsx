import { AtlasSkeleton } from "@/components/ui/AtlasUI";

const summarySlots = ["carteira", "prioridade", "pipeline", "resultado"] as const;
const detailSlots = ["operacao", "apoio"] as const;

type ProgressivePageLoadingProps = {
  label?: string;
  variant?: "overview" | "list" | "board" | "schedule" | "portfolio";
};

export function ProgressivePageLoading({
  label = "Carregando área comercial",
  variant = "overview",
}: ProgressivePageLoadingProps) {
  const isBoard = variant === "board";
  const isList = variant === "list";
  const isSchedule = variant === "schedule";
  const isPortfolio = variant === "portfolio";
  const detailColumns = isSchedule
    ? "xl:grid-cols-[1.45fr_.55fr]"
    : isList || isPortfolio
      ? "xl:grid-cols-[1.55fr_.45fr]"
      : "xl:grid-cols-[1.4fr_.8fr]";

  return (
    <div
      className="atlas-progressive-loading"
      data-loading-variant={variant}
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

      {isBoard ? (
        <section
          className="atlas-loading-stage atlas-loading-detail grid grid-cols-[repeat(5,minmax(224px,1fr))] gap-3 overflow-hidden"
          data-loading-priority="detail"
          aria-hidden="true"
        >
          {["novos", "contato", "qualificacao", "proposta", "venda"].map((stage) => (
            <div key={stage} className="min-h-[420px] rounded-[22px] border border-white/[0.06] bg-white/[0.02] p-4">
              <AtlasSkeleton className="h-4 w-24 rounded-full" />
              <AtlasSkeleton className="mt-6 h-28 w-full rounded-2xl" />
              <AtlasSkeleton className="mt-3 h-28 w-full rounded-2xl" />
            </div>
          ))}
        </section>
      ) : (
        <section
          className={`atlas-loading-stage atlas-loading-detail grid gap-6 ${detailColumns}`}
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
              {isList ? (
                <div className="mt-8 space-y-3">
                  {[1, 2, 3, 4].map((row) => <AtlasSkeleton key={row} className="h-14 w-full rounded-xl" />)}
                </div>
              ) : isPortfolio ? (
                <div className="mt-8 grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((card) => <AtlasSkeleton key={card} className="h-32 w-full rounded-2xl" />)}
                </div>
              ) : (
                <AtlasSkeleton className={`mt-8 w-full rounded-2xl ${isSchedule ? "h-[340px]" : "h-[292px]"}`} />
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
