import type { ReactNode } from "react";

/*
 * CC-5: painel com gradiente sutil (180deg, #0f1830 -> #0b1224), hairline
 * rgba(148,163,184,.12) que sobe para .22 no hover e quando um filho recebe
 * focus-visible. Profundidade por geometria, zero glow/box-shadow novo.
 * Os utilitários usam `!` porque as classes atlas-* de globals.css são
 * unlayered e venceriam utilities layered do Tailwind v4.
 */
const cc5CardChrome = [
  "bg-[linear-gradient(180deg,#0f1830,#0b1224)]!",
  "border-[rgba(148,163,184,0.12)]!",
  "hover:border-[rgba(148,163,184,0.22)]!",
  "has-[:focus-visible]:border-[rgba(148,163,184,0.22)]!",
].join(" ");

export function AtlasCard({
  children,
  className = "",
  density = "comfortable",
  emphasis = "standard",
}: {
  children: ReactNode;
  className?: string;
  density?: "compact" | "comfortable";
  emphasis?: "standard" | "primary" | "quiet";
}) {
  return (
    <section
      className={`atlas-panel atlas-panel-hover atlas-surface-card ${cc5CardChrome} ${className}`.trim()}
      data-card-density={density}
      data-card-emphasis={emphasis}
    >
      {children}
    </section>
  );
}

export function AtlasCardHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="atlas-card-header flex flex-col gap-4 border-b-[rgba(148,163,184,0.12)]! p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="atlas-eyebrow font-mono text-[11px]! font-medium uppercase! tracking-[0.14em]! text-[#6b7890]! [font-variant-numeric:tabular-nums]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="atlas-card-title mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#aab6ca]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AtlasMetric({
  label,
  value,
  detail,
  trend,
  icon,
  tone = "blue",
  relevance = "supporting",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  trend?: ReactNode;
  icon?: ReactNode;
  tone?: "blue" | "green" | "amber" | "violet" | "rose";
  relevance?: "primary" | "supporting";
}) {
  /*
   * Métricas "primary" mantêm o tratamento de acento único do visual system
   * (borda e fundo acentuados via CSS); as demais recebem o chrome CC-5.
   */
  const isPrimary = relevance === "primary";
  return (
    <article
      className={[
        "atlas-metric",
        `atlas-metric-${tone}`,
        isPrimary ? "" : cc5CardChrome,
      ]
        .filter(Boolean)
        .join(" ")}
      data-tone={tone}
      data-relevance={relevance}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className="atlas-metric-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <p className="font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.14em] text-[#6b7890]">
            {label}
          </p>
        </div>
        {trend ? (
          <span className="atlas-metric-trend font-mono text-[11px] [font-variant-numeric:tabular-nums]">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="atlas-metric-number mt-4 font-mono text-3xl font-semibold tracking-tight text-[#e8eef8]">
        {value}
      </p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-[#6b7890]">{detail}</p>
      ) : null}
    </article>
  );
}
