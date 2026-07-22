import type { CSSProperties } from "react";

// Marca Atlas — "estrela-guia". Uma estrela de 4 pontas com o eixo vertical alongado
// (a north-star que guia a operação: a conversão que rege tudo), com uma ÓRBITA e um
// PLANETA — o lead girando em torno do que importa. Une três almas: Atlas (mapa),
// a north-star (a meta) e o ✦ da IA.
//
// Três decisões de ofício que mudaram nesta revisão:
//
// 1. TAMANHO ÓPTICO. A geometria da marca é a mesma, mas o DETALHE não é. Numa caixa de
//    100 unidades, a órbita tem traço de 1.3 e o planeta raio 3.4 — a 16px isso vira,
//    respectivamente, 0,2px e 0,5px: borrão cinza, não desenho. Abaixo do limiar a marca
//    passa a ser só a estrela, que é o que o olho reconhece nesse tamanho. Marca boa
//    simplifica quando encolhe; a alternativa é entregar sujeira e chamar de detalhe.
//
// 2. ZERO GLOW. A versão anterior usava drop-shadow difusa por padrão em toda superfície
//    — e o princípio 3 do CC23 é justamente profundidade por geometria, com zero glow. A
//    marca não pode ser a exceção da linguagem que ela representa. O realce continua
//    disponível, mas é sombra DESLOCADA (que descola do fundo) e opt-in.
//
// 3. COR POR TOKEN. Os hexes viraram var() com fallback: white-label troca a marca sem
//    tocar em componente. É a mesma regra que vale para o resto do CC23.

const BRAND_FROM = "var(--atlas-brand-from, #3ae7d7)"; // teal
const BRAND_TO = "var(--atlas-brand-to, #8b8cff)"; // violet
const GRAD_ID = "atlas-star-gradient";

/** Abaixo disto, órbita e planeta não têm pixels suficientes para existir. */
const DETAIL_THRESHOLD_PX = 24;

type AtlasTone = "signature" | "mono";

type AtlasMarkProps = {
  size: number;
  /** signature = gradiente (padrão); mono = cor única (currentColor). */
  tone?: AtlasTone;
  /** Realce por sombra deslocada. Opt-in: a linguagem do produto é sem glow. */
  glow?: boolean;
  /** Nome acessível. Sem ele a marca é decorativa e sai da árvore de acessibilidade. */
  title?: string;
  className?: string;
  style?: CSSProperties;
};

function AtlasMark({ size, tone = "signature", glow = false, title, className, style }: AtlasMarkProps) {
  const mono = tone === "mono";
  const fill = mono ? "currentColor" : `url(#${GRAD_ID})`;
  const detailed = size >= DETAIL_THRESHOLD_PX;
  // Deslocada no eixo Y, nunca `0 0`: sombra que descola, não halo que vaza.
  const filter = glow && !mono ? "drop-shadow(0 2px 6px rgba(0,0,0,.45))" : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
      className={className}
      style={{ ...(filter ? { filter } : null), ...style }}
    >
      {title ? <title>{title}</title> : null}
      {!mono ? (
        <defs>
          <linearGradient id={GRAD_ID} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={BRAND_FROM} />
            <stop offset="1" stopColor={BRAND_TO} />
          </linearGradient>
        </defs>
      ) : null}

      {detailed ? (
        <>
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
        </>
      ) : null}

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
  /** Realce por sombra deslocada. Opt-in. */
  glow?: boolean;
  /** Nome acessível para quando a marca não estiver dentro de um link já rotulado. */
  title?: string;
  className?: string;
  style?: CSSProperties;
};

export function AtlasLogo({
  size = 32,
  wordmark = false,
  tone = "signature",
  glow = false,
  title,
  className,
  style,
}: AtlasLogoProps) {
  if (!wordmark) {
    return <AtlasMark size={size} tone={tone} glow={glow} title={title} className={className} style={style} />;
  }

  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`.trim()} style={style}>
      <AtlasMark size={size} tone={tone} glow={glow} title={title} className="shrink-0" />
      <span className="flex min-w-0 flex-col">
        {/* O ponto final em gradiente é a única cor do wordmark: a marca afirma, não grita. */}
        <span className="text-xl font-semibold leading-none tracking-[-.03em] text-[color:var(--atlas-text-primary,#f0f4fb)]">
          Atlas
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(120deg, ${BRAND_FROM}, ${BRAND_TO})` }}
          >
            .
          </span>
        </span>
        <span className="mt-1.5 font-mono text-[9px] font-medium uppercase leading-none tracking-[.22em] text-[color:var(--atlas-text-tertiary,#6b7890)]">
          Real Estate Intelligence
        </span>
      </span>
    </span>
  );
}
