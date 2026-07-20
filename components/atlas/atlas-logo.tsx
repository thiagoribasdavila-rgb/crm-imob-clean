import type { CSSProperties } from "react";

// Marca Atlas (CC-5) — um "A" construído por geometria de traço, não por fonte:
// as duas pernas em tinta monocromática (currentColor, herda o contexto) e o
// travessão como a ÚNICA nota do acento (var(--atlas-accent)), atravessando o
// vão aberto na perna direita e avançando além dela — profundidade por
// geometria (barra), zero gradiente/glow. Escala pelo prop `size`; o traço
// (2.4 no viewBox de 32) escala junto por ser unidade do próprio SVG.

const ATLAS_ACCENT = "var(--atlas-accent, #4b8df8)";

type AtlasMarkProps = {
  size: number;
  className?: string;
  style?: CSSProperties;
};

function AtlasMark({ size, className, style }: AtlasMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {/* Perna esquerda + ápice + perna direita até o vão do travessão. */}
      <path
        d="M6.5 27 16 5.5 21 16.8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Retomada da perna direita abaixo do vão. */}
      <path
        d="M23.8 23.2 25.5 27"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Travessão = barra do acento, única cor além da tinta. */}
      <path
        d="M12.8 20h13.5"
        stroke={ATLAS_ACCENT}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

type AtlasLogoProps = {
  /** Lado do ícone em pixels (o SVG é quadrado). */
  size?: number;
  /** Mostra "ATLAS AI" + sub mono "REAL ESTATE INTELLIGENCE" ao lado do ícone. */
  wordmark?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function AtlasLogo({
  size = 32,
  wordmark = false,
  className,
  style,
}: AtlasLogoProps) {
  if (!wordmark) {
    return <AtlasMark size={size} className={className} style={style} />;
  }

  return (
    <span
      className={`inline-flex items-center gap-3 ${className ?? ""}`.trim()}
      style={style}
    >
      <AtlasMark size={size} className="shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-lg font-black leading-none tracking-[-.04em] text-[#e8eef8]">
          ATLAS <span className="text-[color:var(--atlas-accent)]">AI</span>
        </span>
        <span className="mt-1 font-mono text-[9px] font-medium uppercase leading-none tracking-[.22em] text-[#6b7890]">
          Real Estate Intelligence
        </span>
      </span>
    </span>
  );
}
