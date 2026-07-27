import type { CSSProperties } from "react";

// Marca Atlas — MONOGRAMA. O "A" construído como um vão.
//
// REVISÃO 2026-07-26 (segunda): a estrela saiu.
//
// O problema dela nunca foi o desenho — era a saturação. A estrela de quatro
// pontas virou o símbolo padrão de qualquer produto com IA: num print ao lado
// de um concorrente, ninguém distinguia. Ela dizia "tem IA aqui" e não dizia
// Atlas, nem imobiliário, nem nada que separasse este produto de outro.
//
// A letra é a coisa mais específica que existe. Nenhuma outra empresa tem o
// mesmo A com o mesmo corte.
//
// ── AS TRÊS DECISÕES DE DESENHO ─────────────────────────────────────────────
//
// 1. APEX ACHATADO, não em ponta. Duas razões, e as duas importam:
//    técnica — ponta aguda a 16px vira mancha serrilhada, porque não há pixel
//    suficiente para descrevê-la; e de significado — Atlas é o titã que
//    sustenta, e um topo plano é um topo que CARREGA. A ponta afiada diria
//    velocidade; o platô diz suporte.
//
// 2. PERNAS GROSSAS (20 unidades de 100). A 16px isso dá 3,2px de traço —
//    acima do limite em que uma haste some. Monograma fino é bonito no
//    apresentação e desaparece na aba do navegador.
//
// 3. TRAVESSÃO SÓLIDO E BAIXO. Ele corta o vão em dois triângulos de tamanhos
//    diferentes (14 unidades acima, 16 abaixo). Fossem iguais, a 16px os dois
//    virariam um borrão simétrico; diferentes, o olho ainda lê "tem alguma
//    coisa acontecendo ali dentro".
//
// Duas decisões anteriores permanecem, e valem repetir:
//
// UMA FORMA SÓ, idêntica no favicon, no login e na barra lateral. Marca boa não
// precisa de versão reduzida — precisa de uma ideia que não dependa de detalhe.
//
// ZERO GLOW por padrão. Profundidade vem da geometria. O realce continua
// disponível, mas é sombra DESLOCADA — que descola do fundo — e opt-in.
//
// COR POR TOKEN. Os hexadecimais são var() com fallback: white-label troca a
// marca sem tocar em componente.

const BRAND_FROM = "var(--atlas-brand-from, #3ae7d7)"; // teal
const BRAND_TO = "var(--atlas-brand-to, #8b8cff)"; // violet
const GRAD_ID = "atlas-monogram-gradient";

/**
 * A marca, em constantes.
 *
 * Ficam exportadas porque app/icon.svg precisa da MESMA geometria — e a única
 * forma de garantir isso é ter uma fonte só. Duas cópias divergem; foi
 * exatamente o que aconteceu antes da revisão anterior.
 *
 * Contorno do A: platô no topo (44→56), pernas abrindo até 12 e 88, vão interno
 * fechando em (50,50). Simétrico em torno de x=50.
 */
export const ATLAS_MONOGRAM_PATH =
  "M44,8 L56,8 L88,92 L68,92 L50,50 L32,92 L12,92 Z";

/** O travessão. Sólido e baixo, para o vão ficar assimétrico — ver o cabeçalho. */
export const ATLAS_CROSSBAR = { x: 34, y: 64, width: 32, height: 12, rx: 2 } as const;

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

      {/* O monograma: contorno do A e o travessão. Duas formas que se leem como
          uma. A MESMA geometria vai para app/icon.svg. */}
      <path d={ATLAS_MONOGRAM_PATH} fill={fill} />
      <rect
        x={ATLAS_CROSSBAR.x}
        y={ATLAS_CROSSBAR.y}
        width={ATLAS_CROSSBAR.width}
        height={ATLAS_CROSSBAR.height}
        rx={ATLAS_CROSSBAR.rx}
        fill={fill}
      />
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
