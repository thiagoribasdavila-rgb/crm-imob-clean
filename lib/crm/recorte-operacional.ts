/**
 * O RECORTE OPERACIONAL — o que ainda está em jogo, dito uma vez só.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
 *
 * "Status terminal" estava declarado NOVE vezes em SETE arquivos, e as listas
 * não eram iguais. Medido em 03/08/2026:
 *
 *   app/api/v1/crm/leads/route.ts:85 ....... 10 itens (com as variantes maiúsculas)
 *   lib/compat/legacy-v2.ts ................ 6 + 2, partido em duas listas
 *   lib/crm/vinculo-do-cliente.ts .......... 6 + 2 + 3, três listas
 *   lib/crm/acervo-de-resgate.ts ............ 7, e inclui `contrato` e `proposta`
 *   lib/relatorio-incorporador/apuracao.ts .. 12 + 2, e a de perda tem só
 *                                             `perdido, comprou_outro`
 *
 * A divergência do acervo é SEMÂNTICA, não de digitação: para ele, lead em
 * proposta está encerrada; para a lista de leads, está viva. As duas telas
 * respondem "quantas ainda estão em jogo?" com critérios diferentes, e nenhuma
 * das duas está errada sozinha — elas só não podem estar certas ao mesmo tempo.
 *
 * ── O QUE MUDA O NÚMERO EM ATÉ 9x ───────────────────────────────────────────
 *
 * MEDIDO na produção: 490 leads, das quais 419 estão em `perdido`. Contar "sem
 * primeiro contato" com e sem o recorte dá 463 contra 50 — nove vezes.
 *
 * Um cartão que diga 463 e leve a uma lista que mostra 50 não está exibindo um
 * número velho: está exibindo OUTRA PERGUNTA. Por isso o recorte mora aqui, e
 * quem contar e quem listar importam a MESMA função.
 *
 * ── Duas perguntas diferentes, e as duas legítimas ──────────────────────────
 *
 * `EM_JOGO` é o trabalho de hoje: o que um corretor ainda pode mover.
 * `A BASE INTEIRA` é o acervo: serve para reativação e para medir histórico.
 * O erro nunca foi escolher uma — foi não dizer qual.
 *
 * PURO: sem rede, sem banco, sem relógio.
 */

/**
 * Status que encerram a lead — ela saiu do funil, para bem ou para mal.
 *
 * As variantes em caixa alta entram porque o banco não tem CHECK que force
 * caixa: `leads.status` é `text` livre. Medido em 03/08/2026, as 490 linhas da
 * produção usam só minúsculas — mas uma integração que grave "GANHO" faria a
 * lead sumir do funil sem sumir da contagem, e o defeito seria invisível.
 */
export const STATUS_QUE_ENCERRAM = [
  "ganho",
  "GANHO",
  "venda",
  "VENDA",
  "vendido",
  "VENDIDO",
  "perdido",
  "PERDIDO",
  "comprou_outro",
  "COMPROU_OUTRO",
] as const;

/**
 * `contrato` e `proposta` NÃO entram — e esta ausência é a decisão.
 *
 * `lib/crm/acervo-de-resgate.ts` os tratava como encerrados. Faz sentido para o
 * acervo (não se reativa quem está fechando), e não faz para o funil: lead em
 * proposta é justamente a que mais precisa de acompanhamento. Quem quiser o
 * recorte do acervo declara o dele em cima deste, com o motivo — o que não pode
 * é uma terceira lista aparecer sem ninguém notar.
 */
export const STATUS_EM_NEGOCIACAO = ["proposta", "PROPOSTA", "contrato", "CONTRATO"] as const;

/** A lead ainda pode ser trabalhada hoje? */
export function estaEmJogo(status: unknown): boolean {
  const valor = typeof status === "string" ? status.trim() : "";
  if (!valor) return true; // sem status é lead nova, não lead encerrada
  return !STATUS_QUE_ENCERRAM.some((s) => s.toLowerCase() === valor.toLowerCase());
}

/**
 * O recorte pronto para o PostgREST: `(a,b,c)`.
 *
 * Devolve a string que vai em `.not("status", "in", …)`. Montá-la aqui impede
 * que um chamador esqueça uma variante — foi assim que a apuração do
 * incorporador ficou sem `PERDIDO`.
 */
export function forasDoJogoParaPostgrest(): string {
  return `(${STATUS_QUE_ENCERRAM.join(",")})`;
}

/**
 * O nome da pergunta, para a tela poder DIZER qual recorte usou.
 *
 * Um número sem esta legenda é o que produz "o cartão diz 463 e a lista mostra
 * 50". A tela não precisa explicar o recorte inteiro; precisa dizer qual dos
 * dois está mostrando.
 */
export const LEGENDA_DO_RECORTE = {
  em_jogo: "em jogo — exclui ganhas, vendidas, perdidas e quem comprou de outro",
  base_inteira: "base inteira — inclui as encerradas",
} as const;

export type Recorte = keyof typeof LEGENDA_DO_RECORTE;
