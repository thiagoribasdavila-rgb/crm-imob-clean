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

/**
 * QUANTO VALE ESTE TOKEN — em px, ou `null` se ele não é declarado em lugar nenhum.
 *
 * `temAlvoDeToque` já dizia, no comentário, que `var(--token)` só conta quando
 * o chamador RESOLVE o token. Faltava a ferramenta para resolver.
 *
 * O caso que motivou, medido em 02/08/2026 em `check-evolution-phase-092.mjs`:
 *
 *     css.includes("--atlas-control-height-touch")
 *
 * Uma ocorrência no arquivo inteiro — e ela é um USO
 * (`min-height: var(--atlas-control-height-touch)`), não uma declaração. O
 * token vive em `styles/atlas-tokens.css` (44px), e por sorte: se alguém o
 * apagasse de lá, a regra passaria a resolver para nada, o alvo de toque no
 * celular sumiria, e a asserção continuaria verde sem saber de nada. Ela não
 * conseguia distinguir "token que vale 44px" de "token que não existe".
 *
 * Recebe a fonte CONCATENADA das folhas onde o token pode estar declarado —
 * quem sabe quais são é o chamador.
 */
export function valorDoToken(css, nome) {
  const limpo = semComentarios(css);
  const re = new RegExp(`${nome.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}:\\s*(\\d+(?:\\.\\d+)?)px`);
  const achado = limpo.match(re);
  return achado ? Number(achado[1]) : null;
}

/**
 * A LINHA CITA ESTE NÚMERO — como número, não como pedaço de outro.
 *
 * Nasceu de asserções assim, em `check-budget-sizing.mjs` e
 * `check-meta-forecast.mjs`:
 *
 *     s.reasoning.some((l) => l.includes("3") && l.includes("sustenta"))
 *
 * O número É a afirmação — "a previsão diz 3 conjuntos", "o teto é 50" — e
 * estava sendo conferido por substring. `includes("3")` casa com "13", com
 * "23", com "R$ 3.612" e com "0,3". A asserção passaria com o produto
 * anunciando qualquer coisa que contivesse o dígito.
 *
 * Aqui o número precisa estar isolado: sem dígito, vírgula ou ponto colado de
 * nenhum dos lados.
 */
export function citaNumero(texto, numero) {
  /* Primeira versão usava lookaround para exigir o número "isolado" — e
     reprovou "Sem CPL histórico, assumindo R$ 8,00 por lead", porque a vírgula
     de centavos colava no 8. O portão me corrigiu: 8,00 É o número 8.

     Casar padrão não serve aqui; o que serve é LER os números do texto e
     comparar valor. Formato pt-BR: ponto separa milhar, vírgula separa
     decimal. */
  const alvo = Number(numero);
  for (const m of String(texto).matchAll(/\d[\d.]*(?:,\d+)?/g)) {
    const bruto = m[0].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    if (Number(bruto) === alvo) return true;
  }
  return false;
}
