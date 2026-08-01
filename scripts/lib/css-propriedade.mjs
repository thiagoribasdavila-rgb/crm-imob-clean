/**
 * MEDIR PROPRIEDADE DE CSS, EM VEZ DE PROCURAR TEXTO.
 *
 * ── Por que este módulo existe ──────────────────────────────────────────────
 *
 * Oito portões deste repositório verificavam CSS assim:
 *
 *     styles.includes(".atlas-alguma-coisa") && styles.includes("min-height: 44px")
 *
 * Dois `includes` sobre um arquivo de 10.960 linhas. Medido em 01/08/2026:
 * `min-height: 44px` aparece **45 vezes** e `@media (prefers-reduced-motion:
 * reduce)` **15**. Qualquer uma delas, em qualquer canto do arquivo, satisfazia
 * a asserção — inclusive numa regra que não tem relação nenhuma com a classe
 * citada ao lado.
 *
 * Uma asserção assim não aprova um defeito. É pior: **ela não saberia**. Passa
 * igual com a propriedade presente e com a propriedade ausente.
 *
 * As funções aqui olham o CORPO da regra que carrega a classe. É a diferença
 * entre "existe esta palavra no arquivo" e "esta regra faz isto".
 */

/** Tira comentários antes de qualquer análise: comentário não é implementação. */
export function semComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Todas as regras cujo seletor menciona `prefixo`.
 * Devolve `{ seletor, corpo }` — o corpo é onde mora a propriedade.
 */
export function regrasQueCitam(css, prefixo) {
  const limpo = semComentarios(css);
  const saida = [];
  const re = new RegExp(`([^{}]*${prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{}]*)\\{([^}]*)\\}`, "g");
  for (const m of limpo.matchAll(re)) saida.push({ seletor: m[1].trim(), corpo: m[2] });
  return saida;
}

/**
 * A família tem alvo de toque de pelo menos `minimo`px?
 *
 * Lê `min-height` E `height` — um botão de altura fixa também é alvo. E aceita
 * `var(--token)` como satisfatório apenas quando o token é resolvido pelo
 * chamador; sem resolver, um `var()` NÃO conta, porque não se sabe quanto vale.
 */
export function temAlvoDeToque(css, prefixo, minimo = 44) {
  return regrasQueCitam(css, prefixo).some(({ corpo }) => {
    for (const m of corpo.matchAll(/(?:min-)?height:\s*(\d+)px/g)) {
      if (Number(m[1]) >= minimo) return true;
    }
    return false;
  });
}

/** Alguma regra da família declara exatamente esta propriedade com este valor? */
export function familiaDeclara(css, prefixo, propriedade, valor) {
  const re = new RegExp(`${propriedade}:\\s*${valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  return regrasQueCitam(css, prefixo).some(({ corpo }) => re.test(corpo));
}

/**
 * Existe um bloco `@media (condicao)` cujo conteúdo ALCANÇA a família?
 *
 * O caso que motivou: um portão conferia `@media (prefers-reduced-motion:
 * reduce)` e `.atlas-activity-timeline` separadamente. Os dois existiam — em
 * partes opostas do arquivo, sem relação.
 */
export function mediaAlcanca(css, condicao, prefixo) {
  const limpo = semComentarios(css);
  const alvo = `@media (${condicao})`;
  let i = 0;
  while ((i = limpo.indexOf(alvo, i)) !== -1) {
    const abre = limpo.indexOf("{", i);
    if (abre === -1) break;
    let prof = 1, j = abre + 1;
    while (j < limpo.length && prof > 0) {
      if (limpo[j] === "{") prof++;
      else if (limpo[j] === "}") prof--;
      j++;
    }
    if (limpo.slice(abre, j).includes(prefixo)) return true;
    i = j;
  }
  return false;
}
