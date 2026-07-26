import type { CSSProperties } from "react";

// Marca Atlas — "estrela-guia". UMA forma só: uma estrela de 4 pontas com o eixo
// vertical alongado. A north-star que rege a operação — a conversão.
//
// REVISÃO 2026-07-26: a órbita e o planeta saíram.
//
// Eles contavam uma história bonita (o lead girando em torno do que importa) e
// custavam caro em todo tamanho abaixo de 24px: numa caixa de 100 unidades o
// traço da órbita media 1.3 e o planeta 3.4 de raio, o que a 16px vira 0,2px e
// 0,5px — borrão cinza em volta da marca, não desenho. A solução anterior foi
// desenhar DOIS ativos: o componente com órbita e planeta, o favicon só com a
// estrela. Duas marcas para o mesmo produto, divergindo em silêncio.
//
// Agora é uma forma só, idêntica no favicon, no login e na sidebar. Marca boa
// não precisa de versão reduzida — precisa de uma ideia que não dependa de
// detalhe para ser reconhecida.
//
// A geometria também foi afinada: as concavidades ficaram mais fechadas
// (controle a 3.5 do centro, antes 5.5) e as pontas horizontais mais longas
// (14→86, antes 16→84). O resultado é uma estrela mais aguda e menos "flor",
// que é o que separa marca de ícone genérico.
//
// Duas decisões anteriores permanecem, e valem repetir:
//
// ZERO GLOW por padrão. O princípio da linguagem visual é profundidade por
// geometria. O realce continua disponível, mas é sombra DESLOCADA — que descola
// do fundo — e opt-in.
//
// COR POR TOKEN. Os hexadecimais são var() com fallback: white-label troca a
// marca sem tocar em componente.

const BRAND_FROM = "var(--atlas-brand-from, #3ae7d7)"; // teal
const BRAND_TO = "var(--atlas-brand-to, #8b8cff)"; // violet
const GRAD_ID = "atlas-star-gradient";

/**
 * A marca, em uma constante.
 *
 * Fica exportada porque app/icon.svg precisa da MESMA geometria — e a única
 * forma de garantir isso é ter uma fonte só. Duas cópias divergem; foi
 * exatamente o que aconteceu antes desta revisão.
 */
export const ATLAS_STAR_PATH =
  "M50,3 Q53.5,46.5 86,50 Q53.5,53.5 50,97 Q46.5,53.5 14,50 Q46.5,46.5 50,3 Z";

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

      {/* estrela-guia — a marca inteira. Eixo vertical alongado (north-star),
          concavidades fechadas. A MESMA geometria vai para app/icon.svg. */}
      <path d={ATLAS_STAR_PATH} fill={fill} />
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
