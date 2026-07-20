import type { ReactNode } from "react";

type StatusBadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "violet";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusBadgeTone;
};

/*
 * CC-5: semântica por cor (accent para info, emerald ok, amber alerta, rose
 * crítico), micro-tipografia mono uppercase com tracking largo, sem glow.
 * "violet" é mapeado para a variante quieta do acento único (hairline neutra
 * + tinta do acento) para não introduzir uma segunda cor decorativa.
 * Utilitários com `!` vencem as classes atlas-badge-* unlayered de globals.css.
 */
const toneClasses: Record<StatusBadgeTone, string> = {
  neutral:
    "border-[rgba(148,163,184,0.18)]! bg-[rgba(148,163,184,0.07)]! text-[#aab6ca]!",
  info: "border-[rgba(75,141,248,0.32)]! bg-[rgba(75,141,248,0.10)]! text-[color:var(--atlas-accent-hover)]!",
  success:
    "border-[rgba(52,211,153,0.28)]! bg-[rgba(52,211,153,0.09)]! text-[#34d399]!",
  warning:
    "border-[rgba(245,181,68,0.30)]! bg-[rgba(245,181,68,0.09)]! text-[#f5b544]!",
  danger:
    "border-[rgba(251,113,133,0.30)]! bg-[rgba(251,113,133,0.10)]! text-[#fb7185]!",
  violet:
    "border-[rgba(148,163,184,0.18)]! bg-[rgba(148,163,184,0.05)]! text-[color:var(--atlas-accent-hover)]!",
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={`atlas-badge atlas-badge-${tone} gap-1.5 font-mono text-[10px]! uppercase tracking-[0.14em]! [font-variant-numeric:tabular-nums] ${toneClasses[tone]}`}
      data-tone={tone}
    >
      {children}
    </span>
  );
}
