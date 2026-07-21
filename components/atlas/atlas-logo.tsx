import type { CSSProperties } from "react";

// Marca Atlas — "estrela-guia". Uma estrela de 4 pontas com o eixo vertical
// alongado (a north-star que guia a operação: a conversão que rege tudo), com
// uma ÓRBITA e um PLANETA — o lead/negócio girando em torno do que importa. Une
// três almas: Atlas (mapa/navegação), a north-star (a meta) e o ✦ da IA.
// Assinatura em gradiente teal→violet; versão `mono` (currentColor) para
// contextos de cor única (impressão, marca d'água, ícone monocromático).

const GRAD_FROM = "#3ae7d7"; // teal
const GRAD_TO = "#8b8cff"; // violet
const GRAD_ID = "atlas-star-gradient";

type AtlasTone = "signature" | "mono";

type AtlasMarkProps = {
  size: number;
  /** signature = gradiente (padrão); mono = cor única (currentColor). */
  tone?: AtlasTone;
  /** halo sutil sob a estrela (só no signature). */
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
};

function AtlasMark({ size, tone = "signature", glow = true, className, style }: AtlasMarkProps) {
  const mono = tone === "mono";
  const fill = mono ? "currentColor" : `url(#${GRAD_ID})`;
  const filter = glow && !mono ? "drop-shadow(0 3px 14px rgba(58,231,215,.35))" : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ ...(filter ? { filter } : null), ...style }}
    >
      {!mono ? (
        <defs>
          <linearGradient id={GRAD_ID} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={GRAD_FROM} />
            <stop offset="1" stopColor={GRAD_TO} />
          </linearGradient>
        </defs>
      ) : null}
      {/* órbita — a operação girando em torno da estrela */}
      <ellipse
        cx="50"
        cy="50"
        rx="45"
        ry="16"
        transform="rotate(-22 50 50)"
        fill="none"
        stroke={fill}
        strokeWidth="1.3"
        opacity={mono ? 0.35 : 0.5}
      />
      {/* planeta — o lead na órbita */}
      <circle cx="88" cy="38" r="3.4" fill={fill} />
      {/* estrela-guia — eixo vertical alongado (north-star) */}
      <path d="M50,4 Q55.5,44.5 84,50 Q55.5,55.5 50,96 Q44.5,55.5 16,50 Q44.5,44.5 50,4 Z" fill={fill} />
    </svg>
  );
}

type AtlasLogoProps = {
  /** Lado do ícone em pixels (o SVG é quadrado). */
  size?: number;
  /** Mostra o wordmark "Atlas." + sub mono "Real Estate Intelligence" ao lado. */
  wordmark?: boolean;
  /** signature = gradiente (padrão); mono = cor única (currentColor). */
  tone?: AtlasTone;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function AtlasLogo({
  size = 32,
  wordmark = false,
  tone = "signature",
  glow = true,
  className,
  style,
}: AtlasLogoProps) {
  if (!wordmark) {
    return <AtlasMark size={size} tone={tone} glow={glow} className={className} style={style} />;
  }

  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`.trim()} style={style}>
      <AtlasMark size={size} tone={tone} glow={glow} className="shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-xl font-semibold leading-none tracking-[-.03em] text-[#f0f4fb]">
          Atlas
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(120deg, ${GRAD_FROM}, ${GRAD_TO})` }}
          >
            .
          </span>
        </span>
        <span className="mt-1.5 font-mono text-[9px] font-medium uppercase leading-none tracking-[.22em] text-[#6b7890]">
          Real Estate Intelligence
        </span>
      </span>
    </span>
  );
}
