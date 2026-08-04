/**
 * O MODO DE GERAÇÃO — o nome que a tela e a rota precisam pronunciar igual.
 *
 * ── Por que isto é um módulo, e não uma string em cada lado ────────────────
 *
 * `POST /api/v1/marketing/creative-studio` tem dois comportamentos com custos e
 * efeitos diferentes, e o corpo da requisição escolhe qual. Se a tela mandasse
 * `"variacoes_com_lastro"` escrito à mão e a rota comparasse com outra string
 * escrita à mão, o dia em que uma das duas fosse renomeada NÃO daria erro de
 * compilação: a rota cairia no `else`, devolveria o briefing de sempre, e a tela
 * mostraria "peças geradas" sem nenhuma conferência de número por trás. Silêncio
 * exatamente onde o produto promete rigor.
 *
 * Com o nome vindo daqui, os dois lados quebram JUNTOS ou não quebram — que é a
 * definição de um contrato que serve para alguma coisa.
 *
 * ── Por que ZERO imports ──────────────────────────────────────────────────
 *
 * A tela é `"use client"`. `criativo-com-lastro.ts` — onde a regra mora — usa
 * `node:crypto`, e `creative-studio.ts` carrega o roteador de IA com
 * `import "server-only"`: nenhum dos dois pode entrar no bundle do navegador.
 * Este arquivo não importa nada, então atravessa os três mundos (cliente,
 * servidor e `node --test`) sem exigir empacotador nenhum.
 */

/**
 * Briefing estratégico + conjunto de copies + roteiros de vídeo, e a campanha
 * registrada em `marketing_campaigns`. DUAS chamadas de modelo. É o modo que
 * `/marketing/nova-campanha` consome, e o padrão quando o corpo não diz nada —
 * mudar esse padrão apagaria a etapa 3 daquele wizard.
 */
export const MODO_BRIEFING_E_COPIES = "briefing_e_copies";

/**
 * Variações em que CADA número citado é conferido contra o estoque real de
 * `properties` antes de a peça existir, e a peça que cita número sem lastro é
 * recusada com o motivo à mostra. UMA chamada de modelo. Nenhuma campanha é
 * criada: a peça nasce ancorada no empreendimento.
 */
export const MODO_COM_LASTRO = "variacoes_com_lastro";

export const MODOS_DE_GERACAO = [MODO_BRIEFING_E_COPIES, MODO_COM_LASTRO] as const;

export type ModoDeGeracao = (typeof MODOS_DE_GERACAO)[number];

/**
 * Corpo sem `modo` é o comportamento de sempre. Corpo COM `modo` desconhecido é
 * ERRO, não silêncio: um `"com_lastro"` digitado errado que caísse no padrão
 * devolveria peça sem conferência de número com cara de peça conferida.
 */
export function modoDaRequisicao(bruto: unknown): ModoDeGeracao | null {
  if (bruto === undefined || bruto === null || bruto === "") return MODO_BRIEFING_E_COPIES;
  const v = String(bruto);
  return (MODOS_DE_GERACAO as readonly string[]).includes(v) ? (v as ModoDeGeracao) : null;
}
