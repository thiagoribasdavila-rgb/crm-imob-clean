import type { ReactNode } from "react";

export function AtlasBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "violet";
}) {
  return (
    <span className={`atlas-badge atlas-badge-${tone}`} data-tone={tone}>
      {children}
    </span>
  );
}

export function AtlasEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="atlas-empty-state flex min-h-56 flex-col items-center justify-center rounded-2xl p-8 text-center"
      role="status"
    >
      <div
        className="atlas-empty-orb mb-4 grid h-12 w-12 place-items-center rounded-2xl text-xl text-sky-200"
        aria-hidden="true"
      >
        ✦
      </div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function AtlasSkeleton({
  className = "h-5 w-full",
}: {
  className?: string;
}) {
  return <div className={`atlas-skeleton rounded-lg ${className}`} />;
}

export function AtlasProgress({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  const safe = Math.min(100, Math.max(0, value));
  return (
    <div>
      {label ? (
        <div className="mb-2 flex justify-between text-xs text-slate-400">
          <span>{label}</span>
          <span>{safe}%</span>
        </div>
      ) : null}
      <div
        className="atlas-progress-track h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={label || "Progresso"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
      >
        <div
          className="atlas-progress-value h-full rounded-full"
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}
