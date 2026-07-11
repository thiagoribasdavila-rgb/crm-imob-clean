import type { ReactNode } from "react";

export function AtlasBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" | "violet" }) {
  return <span className={`atlas-badge atlas-badge-${tone}`}>{children}</span>;
}

export function AtlasEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-sky-400/20 bg-sky-400/10 text-xl text-sky-300">✦</div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function AtlasSkeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <div className={`atlas-skeleton rounded-lg ${className}`} />;
}

export function AtlasProgress({ value, label }: { value: number; label?: string }) {
  const safe = Math.min(100, Math.max(0, value));
  return (
    <div>
      {label ? <div className="mb-2 flex justify-between text-xs text-slate-400"><span>{label}</span><span>{safe}%</span></div> : null}
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 shadow-[0_0_18px_rgba(59,130,246,.45)]" style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}
