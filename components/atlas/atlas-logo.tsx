"use client";

import { useId, type CSSProperties } from "react";

// Marca Atlas — MONOGRAMA. O "A" construído como um vão.
//
// REVISÃO 2026-08-02 (terceira): o gradiente tinha ID fixo, e isso apagava a
// marca.
//
// ── O DEFEITO, MEDIDO NA PRODUÇÃO ────────────────────────────────────────────
//
// A tela de acesso desenha a marca DUAS vezes: um bloco para desktop
// (`hidden lg:flex`) e outro para o celular (`lg:hidden`). Os dois montavam
// `<linearGradient id="atlas-monogram-gradient">` — o MESMO id, duas vezes, no
// mesmo documento.
//
// `id` é global no documento. Toda referência `url(#atlas-monogram-gradient)`
// resolve para a PRIMEIRA ocorrência, e a primeira vive dentro da <section>
// desktop, que abaixo de `lg` está em `display:none` e mede 0×0. Gradiente que
// não tem caixa não pinta.
//
// Resultado medido em https://atlasaios.com.br/login, viewport 800px:
// `document.getElementById("atlas-monogram-gradient")` devolve o de dentro do
// bloco escondido; as duas formas do "A" ficam com `fill` que não resolve. Em
// toda largura abaixo de `lg` a marca do Atlas era INVISÍVEL — e ninguém viu,
// porque a ausência de um desenho não gera erro, não gera log e não quebra
// teste. Só aparece se você olhar a tela no tamanho certo.
//
// A cura é `useId()`: cada instância monta o seu próprio id, então duas marcas
// na mesma página não disputam. Isso custa `"use client"` — o preço de um hook.
// Vale: o componente já só é usado dentro de árvores cliente, e um logotipo que
// não aparece custa mais.
//
// ── A PROMESSA QUE O COMPONENTE FAZIA E NÃO CUMPRIA ──────────────────────────
//
// O cabeçalho anterior dizia, com todas as letras: "UMA FORMA SÓ, idêntica no
// favicon, no login e na barra lateral". Não era verdade. `app/icon.svg` sempre
// desenhou a marca sobre uma PLACA — quadrado de canto 14/64 em #06080f, com o
// monograma a 53% no centro. O componente desenhava o monograma pelado.
// Favicon e barra lateral eram dois objetos diferentes.
//
// Agora a placa é o padrão, com o MESMO enquadramento do favicon (escala 0,53,
// translate 32-50s), e `plate={false}` devolve o monograma pelado para quem
// precisar dele. A promessa passou a ser verificável — e o portão
// `check-atlas-logo` compara os dois desenhos.
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
// E uma quarta, nova:
//
// 4. O GRADIENTE DESCE, NÃO ATRAVESSA. Ele era diagonal (0,0 → 1,1). Num
//    desenho SIMÉTRICO em torno de x=50, diagonal dá cores diferentes às duas
//    pernas na mesma altura — a 38px o olho lê duas peças, não uma letra. Na
//    vertical (0,0 → 0,1) cada altura tem uma cor só, e a simetria do desenho
//    passa a ser respeitada pela cor. O apex é teal, os pés são violeta.
//
// ZERO GLOW por padrão. Profundidade vem da geometria. O realce continua
// disponível, mas é sombra DESLOCADA — que descola do fundo — e opt-in.
//
// COR POR TOKEN. Os hexadecimais são var() com fallback. Até hoje o token nunca
// foi DECLARADO em lugar nenhum — o fallback vencia sempre, e o white-label
// prometido aqui não tinha onde ser ligado. Os três tokens agora existem em
// app/globals.css, nos dois temas.

const BRAND_FROM = "var(--atlas-brand-from, #3ae7d7)"; // teal
const BRAND_TO = "var(--atlas-brand-to, #8b8cff)"; // violet
const BRAND_PLATE = "var(--atlas-brand-plate, #06080f)"; // a placa, igual à do favicon

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

/**
 * O enquadramento da placa, copiado do favicon e agora com uma fonte só.
 *
 * O monograma ocupa x 12→88 e y 8→92 na caixa de 100. Com escala s, centralizá-lo
 * na caixa de 64 exige translate = 32 - 50s nos dois eixos. Com s = 0,53 ele
 * fica 40,3 × 44,5 numa arte de 64 — cerca de 70% da altura, proporção em que
 * uma marca respira dentro do quadrado sem encostar nas bordas.
 */
export const ATLAS_PLATE = { size: 64, rx: 14, scale: 0.53, translate: 5.5 } as const;

type AtlasTone = "signature" | "mono";

type AtlasMarkProps = {
  size: number;
  /** signature = gradiente (padrão); mono = cor única (currentColor). */
  tone?: AtlasTone;
  /** A placa do favicon. Padrão: sim — é o que torna "uma forma só" verdade. */
  plate?: boolean;
  /** Realce por sombra deslocada. Opt-in: a linguagem do produto é sem glow. */
  glow?: boolean;
  /** Nome acessível. Sem ele a marca é decorativa e sai da árvore de acessibilidade. */
  title?: string;
  className?: string;
  style?: CSSProperties;
};

function AtlasMark({
  size,
  tone = "signature",
  plate = true,
  glow = false,
  title,
  className,
  style,
}: AtlasMarkProps) {
  // Um id por instância. Duas marcas na mesma página deixam de disputar o
  // mesmo `url(#…)` — ver o cabeçalho: era isso que apagava a marca no celular.
  const gradId = `atlas-monogram-gradient-${useId().replace(/:/g, "")}`;
  const mono = tone === "mono";
  const fill = mono ? "currentColor" : `url(#${gradId})`;
  // Deslocada no eixo Y, nunca `0 0`: sombra que descola, não halo que vaza.
  const filter = glow && !mono ? "drop-shadow(0 2px 6px rgba(0,0,0,.45))" : undefined;

  // Com placa a arte é a do favicon (caixa 64, monograma a 53% no centro); sem
  // placa é o monograma sozinho na caixa de 100. Mesmo desenho, dois recortes.
  const viewBox = plate ? `0 0 ${ATLAS_PLATE.size} ${ATLAS_PLATE.size}` : "0 0 100 100";

  const formas = (
    <>
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
    </>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
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
          {/* Vertical, não diagonal — ver decisão 4 no cabeçalho. */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={BRAND_FROM} />
            <stop offset="1" stopColor={BRAND_TO} />
          </linearGradient>
        </defs>
      ) : null}

      {plate ? (
        <>
          <rect
            width={ATLAS_PLATE.size}
            height={ATLAS_PLATE.size}
            rx={ATLAS_PLATE.rx}
            fill={mono ? "none" : BRAND_PLATE}
          />
          <g transform={`translate(${ATLAS_PLATE.translate} ${ATLAS_PLATE.translate}) scale(${ATLAS_PLATE.scale})`}>
            {formas}
          </g>
        </>
      ) : (
        formas
      )}
    </svg>
  );
}

type AtlasLogoProps = {
  /** Lado do ícone em pixels (o SVG é quadrado). */
  size?: number;
  /** Mostra o wordmark ao lado da marca. */
  wordmark?: boolean;
  /** A placa do favicon. Padrão: sim. */
  plate?: boolean;
  /** signature = gradiente (padrão); mono = cor única (currentColor). */
  tone?: AtlasTone;
  /** Realce por sombra deslocada. Opt-in. */
  glow?: boolean;
  /** Nome acessível para quando a marca não estiver dentro de um link já rotulado. */
  title?: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * O WORDMARK PASSOU A DIZER O QUE O PRODUTO DIZ.
 *
 * Contado no repositório em 02/08/2026, o nome aparecia escrito à mão em CINCO
 * formas: "Atlas AI" (21×), "Atlas." (12×), `ATLAS <span sky-400>AI` (6×),
 * "ATLAS AI" (2×) e `ATLAS <em>AI` (1×). E a prop `wordmark` deste componente,
 * que desenhava a sexta ("Atlas." com ponto em gradiente), tinha **zero** uso —
 * o wordmark oficial era código morto enquanto cada tela reconstruía o seu.
 *
 * Ganha a forma que o produto mais usa e que a tela de acesso já mostra ao
 * cliente: ATLAS AI. O "AI" recebe o gradiente da marca em vez do sky-400
 * cravado, que era a única peça de cor que não vinha da identidade.
 */
export function AtlasLogo({
  size = 32,
  wordmark = false,
  plate = true,
  tone = "signature",
  glow = false,
  title,
  className,
  style,
}: AtlasLogoProps) {
  if (!wordmark) {
    return (
      <AtlasMark size={size} tone={tone} plate={plate} glow={glow} title={title} className={className} style={style} />
    );
  }

  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`.trim()} style={style}>
      <AtlasMark size={size} tone={tone} plate={plate} glow={glow} title={title} className="shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-xl font-black leading-none tracking-[-.04em] text-[color:var(--atlas-text-primary,#f0f4fb)]">
          ATLAS{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(120deg, ${BRAND_FROM}, ${BRAND_TO})` }}
          >
            AI
          </span>
        </span>
        <span className="mt-1.5 font-mono text-micro font-medium uppercase leading-none tracking-[.22em] text-[color:var(--atlas-text-tertiary,#6b7890)]">
          Real Estate Intelligence
        </span>
      </span>
    </span>
  );
}
