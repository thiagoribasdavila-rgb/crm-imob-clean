import type { ReactNode } from "react";

export function AtlasCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`atlas-panel atlas-surface-card ${className}`}>
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
    <div className="atlas-card-header flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
      <div className="min-w-0">
        {eyebrow ? <p className="atlas-eyebrow">{eyebrow}</p> : null}
        <h2 className="atlas-card-title mt-1 text-lg font-semibold text-white">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
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
  tone = "blue",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  trend?: string;
  tone?: "blue" | "green" | "amber" | "violet" | "rose";
}) {
  return (
    <article className={`atlas-metric atlas-metric-${tone}`} data-tone={tone}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-400">{label}</p>
        {trend ? (
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-semibold text-slate-300">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="atlas-metric-number mt-4 text-3xl font-semibold tracking-tight text-white">
        {value}
      </p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
      ) : null}
    </article>
  );
}
