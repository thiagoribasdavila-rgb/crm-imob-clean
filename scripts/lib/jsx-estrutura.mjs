/**
 * MEDIR ESTRUTURA DE JSX, EM VEZ DE PROCURAR TEXTO NO ARQUIVO INTEIRO.
 *
 * ── Por que este módulo existe ──────────────────────────────────────────────
 *
 * É o irmão de `scripts/lib/css-propriedade.mjs`, para o outro lado do produto.
 * Lá o defeito era `styles.includes(".classe") && styles.includes("44px")` —
 * dois `includes` DESACOPLADOS sobre um arquivo grande. Aqui é o mesmo defeito
 * com outra roupa. Medido em 02/08/2026, em `check-evolution-phase-038.mjs`:
 *
 *     tasks.includes("+{remainingSteps.length} planejadas")
 *       && tasks.includes("remainingSteps.map")
 *
 * A asserção se chamava "Ações restantes usam divulgação progressiva". Ela não
 * verificava divulgação progressiva nenhuma: verificava que duas frases existem
 * em algum lugar de um arquivo de 1.100 linhas. Passaria intacta com o
 * `<details>` REMOVIDO e a lista aberta na cara do corretor — e reprovou hoje
 * porque o RÓTULO mudou ("+N planejadas" virou "+N passos restantes do
 * roteiro", numa correção deliberada: o rótulo antigo mentia). Texto trocado,
 * propriedade intacta, portão vermelho. É o pior par possível: cega para o
 * defeito e sensível ao que não importa.
 *
 * As funções aqui olham o CORPO do elemento — a mesma ideia de "corpo da regra"
 * do css-propriedade. `<details>` que contém a lista É divulgação progressiva;
 * as duas coisas soltas no arquivo não são.
 *
 * Todas recebem FONTE (string) e devolvem dado — nenhuma lê disco. É o que
 * permite `tests/contracts/estrutura-jsx-reprova.test.mjs` alimentá-las com
 * fonte mutilada e ver o vermelho. Asserção que ninguém viu falhar não é
 * asserção.
 */
import ts from "typescript";

function arvore(fonte) {
  return ts.createSourceFile("medido.tsx", fonte, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
}

function percorrer(no, visitar) {
  visitar(no);
  no.forEachChild((filho) => percorrer(filho, visitar));
}

/** O nome da tag como está escrito: `details`, `summary`, `CommercialContextTimelineEntry`. */
function nomeDaTag(no) {
  const abertura = ts.isJsxElement(no) ? no.openingElement : no;
  return abertura.tagName.getText();
}

/**
 * O TEXTO-FONTE de cada elemento `<tag>` do arquivo, do `<` ao `>` de
 * fechamento — filhos incluídos.
 *
 * É este recorte que transforma "existe no arquivo" em "está DENTRO deste
 * elemento".
 */
export function corposDeElemento(fonte, tag) {
  const saida = [];
  percorrer(arvore(fonte), (no) => {
    if ((ts.isJsxElement(no) || ts.isJsxSelfClosingElement(no)) && nomeDaTag(no) === tag) {
      saida.push(no.getText());
    }
  });
  return saida;
}

/**
 * Existe um `<tag>` cujo corpo contém TODOS os trechos?
 *
 * O ganho não é o `includes` — é o ESCOPO. `elementoContem(fonte, "details",
 * "remainingSteps.map")` só é verdade quando a lista está mesmo dentro do
 * `<details>`; nenhuma coincidência em outra parte do arquivo satisfaz.
 */
export function elementoContem(fonte, tag, ...trechos) {
  return corposDeElemento(fonte, tag).some((corpo) => trechos.every((t) => corpo.includes(t)));
}

/**
 * Os elementos de um array literal declarado como `const NOME = [...]`, cada um
 * como texto-fonte.
 *
 * Nasceu de `check-evolution-phase-040.mjs`, que contava a classe CSS
 * `cc6-metric-value` no arquivo e exigia 3. Os três sinais viraram um
 * `pulso.map(...)`: UMA ocorrência da classe renderizando TRÊS itens. O portão
 * ficou vermelho com a propriedade intacta. Quem sabe quantos sinais a tela
 * mostra é o array, não a contagem de uma classe no texto.
 *
 * Atravessa `as const`, `satisfies` e parênteses — açúcar de tipo não é
 * conteúdo.
 */
export function itensDeArrayLiteral(fonte, nome) {
  let achado = null;
  percorrer(arvore(fonte), (no) => {
    if (achado) return;
    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.name.text === nome) {
      let init = no.initializer;
      while (
        init &&
        (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init))
      ) {
        init = init.expression;
      }
      if (init && ts.isArrayLiteralExpression(init)) achado = init.elements.map((e) => e.getText());
    }
  });
  return achado;
}

/**
 * O CORPO de cada `useEffect(...)` do arquivo, isolado.
 *
 * Contar `fetch(` no arquivo inteiro não distingue o `load()` que sempre
 * existiu de um efeito novo que passou a buscar dados — e foi por isso que
 * `check-evolution-phase-039.mjs` recortava o efeito com `indexOf` de uma
 * frase, um recorte que quebra quando o Prettier reformata. Aqui o recorte é o
 * nó.
 */
export function corposDeEfeito(fonte) {
  const saida = [];
  percorrer(arvore(fonte), (no) => {
    if (
      ts.isCallExpression(no) &&
      ts.isIdentifier(no.expression) &&
      no.expression.text === "useEffect" &&
      no.arguments.length > 0
    ) {
      saida.push(no.arguments[0].getText());
    }
  });
  return saida;
}

/**
 * Os corpos de efeito que ABREM rede: `fetch(` ou assinatura `.channel(`.
 *
 * A propriedade que as fases 039 e 040 querem afirmar é "a tela não passou a
 * buscar mais dados". Contar `useState` — que foi o que as duas faziam — não
 * afirma isso: `useState` subiu nas duas por motivo alheio à rede (em
 * `/calendar`, um carimbo `lidoEm` gravado no `load` para tirar `Date.now()`
 * de dentro de um `useMemo`, que o `react-hooks/purity` reprova como erro).
 * Estado não é rede. Rede é rede.
 *
 * Devolve a LISTA em vez de um booleano de propósito: a primeira versão
 * recebia uma lista de "efeitos permitidos" e perguntava se o corpo continha
 * algum marcador — e passou por acidente em `/calendar`, porque o marcador
 * escolhido (`void load()`) também aparece DENTRO do callback da assinatura
 * realtime. Marcador que casa com o efeito errado é o mesmo defeito, um nível
 * acima. Com a lista na mão, o portão afirma quantos são e o que cada um faz.
 */
export function efeitosQueTocamRede(fonte) {
  return corposDeEfeito(fonte).filter((corpo) => !semRede(corpo));
}

/**
 * Este corpo NÃO abre leitura de rede nem assinatura?
 *
 * Mora aqui, e não solto no portão como `corpo.includes("fetch(")`, por dois
 * motivos. O primeiro é o de sempre: "o que conta como rede" tem de ter UMA
 * definição, senão dois portões divergem e ninguém percebe. O segundo é que
 * `includes("fetch(")` escrito dentro de um portão é indistinguível, para o
 * meta-portão `asercao-fraca`, de uma busca frágil por texto curto — e ele
 * está certo em não conseguir distinguir: quem garante que o alvo é o CORPO de
 * um efeito, e não o arquivo inteiro, é o recorte, que fica deste lado.
 */
export function semRede(corpo) {
  return !buscaDados(corpo) && !assinaRealtime(corpo);
}

/** Este corpo abre uma LEITURA (`fetch(`)? */
export function buscaDados(corpo) {
  return corpo.includes("fetch(");
}

/** Este corpo abre uma ASSINATURA realtime (`.channel(`)? */
export function assinaRealtime(corpo) {
  return corpo.includes(".channel(");
}
