/**
 * PODA DO CONJUNTO DE COPIES — tirar a peça cujo texto não tem lastro, sem
 * desalinhar o que sobrou.
 *
 * ── O DEFEITO QUE ESTE MÓDULO EXISTE PARA FECHAR ───────────────────────────
 *
 * `/api/v1/marketing/creative-studio` tem DOIS modos, e os dois gravam em
 * `creative_assets`:
 *
 *   - `variacoes_com_lastro` audita cada número contra as fontes regionais e o
 *     cadastro do produto, e RECUSA a variação que cita número sem lastro.
 *   - o modo PADRÃO gerava briefing → copies → `salvarCriativos` sem conferir
 *     lastro nenhum.
 *
 * Duas portas para a mesma tabela, uma guardada e outra escancarada. É a mesma
 * classe da régua que valia na tela de composição e não valia em
 * `ready-campaigns` — e aqui o que passa pela porta aberta é número sem lastro
 * em anúncio de imóvel, que é risco de conta e risco legal, não de estética.
 *
 * ── POR QUE PODAR POR ÍNDICE, E NÃO FILTRAR CADA LISTA ─────────────────────
 *
 * `ConjuntoCopies` é um feixe de listas PARALELAS: `conceitos[i]` casa com
 * `titulos[i]`, `textosPrincipais[i]`, `descricoes[i]`, `ctas[i]`. Filtrar cada
 * lista por conta própria desloca os índices e passa a casar o título de um
 * conceito com o texto de outro — o anúncio sairia coerente na forma e errado
 * no conteúdo, que é pior do que não sair.
 *
 * Então a unidade de poda é o ÍNDICE: se qualquer texto publicável daquela
 * posição cai, a posição inteira sai, e todas as listas são filtradas pelo mesmo
 * conjunto de índices sobreviventes.
 *
 * ── O TEXTO EFETIVO, E NÃO O TEXTO DA POSIÇÃO ──────────────────────────────
 *
 * `salvarCriativos` grava `copies.textosPrincipais[i] ?? copies.textosPrincipais[0]`
 * — há um FALLBACK para a posição 0 quando o modelo devolve menos textos que
 * conceitos. Julgar `arr[i]` sozinho deixaria um texto reprovado na posição 0
 * entrar no banco pela posição 5, por baixo da auditoria. Por isso a poda julga
 * o valor EFETIVO: o mesmo que a gravação usaria.
 *
 * PURO: sem rede, sem banco, sem relógio. Quem lê o banco é
 * `lastro-do-criativo.ts`; quem decide é `fato-com-lastro.ts`; este só recorta.
 */

/** O feixe de listas paralelas que o estúdio produz. */
export type ConjuntoDeCopies = {
  conceitos: Array<{ nome: string; angulo: string; publicoAlvo: string }>;
  titulos: string[];
  textosPrincipais: string[];
  descricoes: string[];
  ctas: string[];
  roteirosVideo: Array<{ titulo: string; cenas: string[] }>;
};

export type PecaRecusada = {
  indice: number;
  conceito: string;
  /** O texto que reprovou — o efetivo, já com o fallback aplicado. */
  texto: string;
  campo: "titulo" | "texto principal" | "descrição";
};

/** O valor que `salvarCriativos` gravaria nesta posição, fallback incluído. */
function efetivo(lista: string[], indice: number): string {
  const proprio = lista[indice];
  if (typeof proprio === "string" && proprio.trim().length > 0) return proprio;
  const primeiro = lista[0];
  return typeof primeiro === "string" ? primeiro : "";
}

/**
 * Devolve o conjunto sem as posições cujo texto publicável não tem lastro, e a
 * lista do que caiu com o motivo.
 *
 * `reprovados` é o conjunto de textos que a auditoria NÃO sustentou. Vem de
 * `auditarPecaDoEmpreendimento`, que já sabe consultar fontes e cadastro.
 */
export function podarConjuntoSemLastro(
  copies: ConjuntoDeCopies,
  reprovados: ReadonlySet<string>,
): { conjunto: ConjuntoDeCopies; recusadas: PecaRecusada[] } {
  const total = copies.conceitos.length;
  const recusadas: PecaRecusada[] = [];
  const sobrevivem: number[] = [];

  for (let i = 0; i < total; i++) {
    const campos = [
      { campo: "titulo" as const, valor: efetivo(copies.titulos, i) },
      { campo: "texto principal" as const, valor: efetivo(copies.textosPrincipais, i) },
      { campo: "descrição" as const, valor: efetivo(copies.descricoes, i) },
    ];
    const caiu = campos.find(({ valor }) => valor.length > 0 && reprovados.has(valor));
    if (caiu) {
      recusadas.push({
        indice: i,
        conceito: copies.conceitos[i]?.nome ?? `variação ${i + 1}`,
        texto: caiu.valor,
        campo: caiu.campo,
      });
      continue;
    }
    sobrevivem.push(i);
  }

  // Uma lista pode ser mais curta que `conceitos` (o modelo devolve menos itens
  // que o pedido). `filter` sobre índice ausente devolveria `undefined` no meio
  // do feixe; recortar por `i < lista.length` mantém as listas curtas curtas, e
  // o fallback da gravação continua funcionando como antes.
  const porIndice = <T,>(lista: T[]): T[] => sobrevivem.filter((i) => i < lista.length).map((i) => lista[i]);

  return {
    conjunto: {
      conceitos: porIndice(copies.conceitos),
      titulos: porIndice(copies.titulos),
      textosPrincipais: porIndice(copies.textosPrincipais),
      descricoes: porIndice(copies.descricoes),
      ctas: porIndice(copies.ctas),
      // Roteiro de vídeo não é texto publicável de anúncio estático e não passa
      // pela auditoria de número; segue inteiro para não sumir sem ter sido
      // julgado. Sumir sem julgamento é a forma silenciosa do mesmo erro.
      roteirosVideo: copies.roteirosVideo,
    },
    recusadas,
  };
}

/** Os textos publicáveis do conjunto — o que deve ir para a auditoria. */
export function textosPublicaveis(copies: ConjuntoDeCopies): string[] {
  const todos = [...copies.titulos, ...copies.textosPrincipais, ...copies.descricoes];
  return [...new Set(todos.filter((t) => typeof t === "string" && t.trim().length > 0))];
}
