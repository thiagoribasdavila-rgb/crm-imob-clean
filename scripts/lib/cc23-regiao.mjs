/**
 * A REGIÃO do CC23 dentro do app/globals.css — isolada num módulo por um motivo MEDIDO.
 *
 * ── O DEFEITO QUE ISTO FIXA (2026-07-29) ────────────────────────────────────
 *
 * O `check-cc23-foundation.mjs` definia a camada CC23 como `css.slice(inicioCC23)`:
 * do marcador até o FIM DO ARQUIVO. Quando o check nasceu, o CC23 era a última coisa
 * do globals.css — "do marcador ao EOF" e "o bloco CC23" eram a MESMA string, e a
 * diferença entre as duas ideias não aparecia em teste nenhum.
 *
 * Depois entraram 1.988 linhas de features que nada têm a ver com CC23 — TEMA CLARO,
 * A LÂMINA DO LEAD 360 e o RAIL DA SIDEBAR — e todas passaram a responder pelas regras
 * do CC23 por acidente de POSIÇÃO NO ARQUIVO. O portão acusava 4 falhas, e as quatro
 * estavam FORA do CC23, em classes `.atlas-*` de outra gente. Um portão que acusa o
 * inocente é pior que portão nenhum: ensina a ignorar portão.
 *
 * ── POR QUE UM MÓDULO, E NÃO CÓDIGO SOLTO NO CHECK ──────────────────────────
 *
 * `scripts/mutacoes.mjs` roda APENAS `npm run test:contracts`. Propriedade vigiada só
 * por um `*:check` não é coberta por mutação — ou seja, a lógica que JÁ apodreceu uma
 * vez continuaria sem rede. Com a região aqui, `tests/contracts/regiao-do-cc23.test.mjs`
 * exercita esta função e a mutação passa a matar quem a quebrar.
 *
 * ── A REGIÃO É PREGADA PELOS DOIS LADOS ─────────────────────────────────────
 *
 * Um só lado não basta, e isso foi medido: apagar o banner terminador não deixa a
 * região sem fim — deixa ela ESTICAR até o banner seguinte e engolir a feature vizinha
 * em silêncio. Então:
 *
 *   · `seletoresCC23Fora`      → a região não é PEQUENA demais (nada do CC23 sobrou fora)
 *   · `seletoresEstranhosDentro` → a região não é GRANDE demais (não engoliu vizinho)
 *
 * Juntos pregam a região no lugar. Cada um sozinho passa numa deriva que o outro pega.
 */

/** O título do banner que abre a camada. Trocar isto é trocar a âncora — e o caso 12 cai. */
export const MARCA_CC23 = "CC23 — a geração que fecha o redesenho global";

/**
 * Banner de seção do globals.css. Aceita `=` e `═` porque o arquivo usa os dois
 * (o rail da sidebar abre com a caixa dupla).
 */
export const BANNER_DE_SECAO = /^\/\*[ ]*[=═]{10,}/gm;

/**
 * `filter: blur` do PRÓPRIO elemento, ancorado.
 *
 * O padrão antigo era `/filter:\s*blur/`, que casa DENTRO de `backdrop-filter: blur` —
 * propriedade diferente: `filter` desfoca o próprio elemento (o glow que o princípio 3
 * proíbe), `backdrop-filter` desfoca o que está ATRÁS, que é a linguagem de vidro usada
 * em 20 pontos do produto. A âncora exige início de linha, `;` ou `{` antes, então
 * `backdrop-filter` não satisfaz. `temBlurDoProprioElemento` é testada nos DOIS LADOS.
 */
export const BLUR_DO_PROPRIO_ELEMENTO = /(?:^|[\s;{])filter:\s*blur/;

/** Apaga comentários PRESERVANDO offsets e número de linhas (para os relatos citarem L certo). */
export function semComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, " "));
}

/**
 * Recorta a camada CC23: do banner do CC23 até o PRÓXIMO banner de seção.
 *
 * `delimitada: false` significa que não há terminador — e isso é FALHA, não licença
 * para engolir o resto do arquivo. Devolver `camada` até o EOF nesse caso é proposital:
 * o chamador reprova por `delimitada`, e não por um efeito colateral silencioso.
 */
export function recortarCC23(css) {
  const inicio = css.indexOf(MARCA_CC23);
  if (inicio === -1) return { inicio: -1, fim: -1, delimitada: false, camada: "" };
  const banners = [...css.matchAll(BANNER_DE_SECAO)].map((m) => m.index);
  const fim = banners.find((b) => b > inicio);
  return {
    inicio,
    fim: fim ?? -1,
    delimitada: fim !== undefined,
    camada: css.slice(inicio, fim ?? css.length),
  };
}

/** Seletores `.cc23-*` que moram FORA da região — prova que estreitá-la não afrouxa nada. */
export function seletoresCC23Fora(css, { inicio, fim }) {
  return [...semComentarios(css).matchAll(/^[^\n{/]*\.cc23-[^\n{]*\{/gm)]
    .filter((m) => m.index < inicio || (fim !== -1 && m.index >= fim))
    .map((m) => `L${css.slice(0, m.index).split("\n").length}: ${m[0].trim().slice(0, 48)}`);
}

/**
 * Seletores ESTRANHOS dentro da região — prova que a região não esticou por cima do vizinho.
 *
 * Legítimos: qualquer coisa com `.cc23-`, o escopo opt-in `[data-cc23-density]` (que cita
 * `.cc6-panel` de propósito), o bloco de tokens `:root`, at-rules e passos de keyframe.
 */
export function seletoresEstranhosDentro(camada) {
  return [...semComentarios(camada).matchAll(/(^|\n)([ \t]*)([^\n{};]+?)\s*\{/g)]
    .map((m) => m[3].trim())
    .filter((sel) => sel && !sel.startsWith("@") && !sel.startsWith("--"))
    .filter((sel) => !/\.cc23-|\[data-cc23-/.test(sel) && !/^:root(\[|$)/.test(sel))
    .filter((sel) => !/^(to|from|\d+%)$/.test(sel));
}

/** Um bloco `@media` cuja CONDIÇÃO pede redução de movimento existe para DESLIGAR movimento. */
function ehBlocoDeReducao(bloco) {
  return /prefers-reduced-motion:\s*reduce/.test(bloco.slice(0, bloco.indexOf("{")));
}

/**
 * Classifica o movimento da região.
 *
 * `exigemPortao` são os blocos que LIGAM movimento: esses precisam de pointer:fine E
 * prefers-reduced-motion. Blocos de `reduce` ficam de fora porque são o REMÉDIO — exigir
 * pointer:fine deles reprovava exatamente a acessibilidade que a regra quer cobrar. Em
 * troca eles entram em `reduceQueAnima`: um bloco de redução só pode DESLIGAR.
 *
 * `soltos` conta movimento fora de qualquer @media, com indentação QUALQUER — o padrão
 * antigo exigia exatamente 2 espaços e deixava passar corpo reindentado ou aninhado.
 */
export function movimentoDaRegiao(camada) {
  const blocos = [...camada.matchAll(/@media[^{]*\{[\s\S]*?\n\}/g)].map((m) => m[0]);
  const comMovimento = blocos.filter((b) => /transition:|transform:/.test(b));
  return {
    exigemPortao: comMovimento.filter((b) => !ehBlocoDeReducao(b)),
    reduceQueAnima: comMovimento.filter(ehBlocoDeReducao).filter((b) =>
      [...b.matchAll(/(?:transition|transform):\s*([^;]+);/g)].some((d) => !/^none$/i.test(d[1].trim())),
    ),
    soltos: [...camada
      .replace(/@media[^{]*\{[\s\S]*?\n\}/g, "")
      .matchAll(/(?:^|\n)[ \t]+(?:transition|transform):/g)].length,
  };
}

/** O portão duplo, na íntegra: só em ponteiro fino E só sem redução pedida. */
export function temPortaoDuplo(bloco) {
  return /pointer:\s*fine/.test(bloco) && /prefers-reduced-motion/.test(bloco);
}

/** `filter: blur` do próprio elemento — e NÃO `backdrop-filter: blur`. */
export function temBlurDoProprioElemento(css) {
  return BLUR_DO_PROPRIO_ELEMENTO.test(css);
}
