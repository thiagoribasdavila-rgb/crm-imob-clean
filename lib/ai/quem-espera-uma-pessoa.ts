/**
 * QUEM ESPERA UMA PESSOA, E QUEM SÓ ESTÁ ENSAIANDO.
 *
 * ── O DEFEITO QUE ISTO EVITA, ACHADO POR UM CÉTICO EM 02/08/2026 ────────────
 *
 * `ai_shadow_decisions` ganhou um SEGUNDO escritor — o vigia
 * `sombra-do-atendimento` — e ele grava exatamente a forma que a fila de
 * decisões pendentes procura: `retido = true` e `decisao_humana = null`.
 *
 * A semântica, porém, é oposta:
 *
 *   · `sla-primeiro-contato` registra uma PROPOSTA. Ela existe para que alguém
 *     decida, e a decisão muda o que acontece com a lead.
 *   · `sombra-do-atendimento` registra um ENSAIO. Ela prepara o que faria e
 *     retém POR DESENHO, para sempre. Nenhuma decisão humana muda aquilo,
 *     porque nada será enviado — é esse o ponto do degrau 1.
 *
 * Sem separar os dois, as linhas do ensaio entrariam na fila de aprovação. E
 * como aquela consulta ordena por `created_at desc` com teto de 50, elas não
 * apenas apareceriam: sendo as mais novas, EXPULSARIAM as decisões reais. O
 * gestor abriria a fila e veria trabalho que ninguém pediu para aprovar,
 * enquanto o que esperava por ele sumia por baixo do corte.
 *
 * ── POR QUE LISTA DECLARADA, E NÃO "TUDO MENOS A SOMBRA" ────────────────────
 *
 * Excluir pelo nome do ensaio resolve o caso de hoje e falha no próximo: um
 * terceiro agente de ensaio inunda a fila do mesmo jeito, em silêncio. A lista
 * declarada inverte o ônus — quem soma um escritor precisa dizer de qual lado
 * ele está, e o contrato reprova o agente que não aparecer em nenhum dos dois.
 *
 * É a mesma forma do resto do repositório: a omissão fica barulhenta em vez de
 * silenciosa.
 *
 * Módulo PURO — sem banco, sem rede. Import relativo com extensão `.ts` onde
 * for consumido por contrato: `node --test` não conhece os `paths` do tsconfig.
 */

/**
 * Agentes cujo registro retido é uma PROPOSTA: existe para uma pessoa decidir,
 * e a decisão dela muda o que acontece.
 */
export const AGENTES_QUE_ESPERAM_PESSOA = ["sla-primeiro-contato"] as const;

/**
 * Agentes cujo registro retido é um ENSAIO: preparado e retido por desenho.
 * Nada aqui vai para fila de aprovação — não há o que aprovar.
 */
export const AGENTES_DE_ENSAIO = ["sombra-do-atendimento"] as const;

export type AgenteDeSombra =
  | (typeof AGENTES_QUE_ESPERAM_PESSOA)[number]
  | (typeof AGENTES_DE_ENSAIO)[number];

/** `true` quando o registro daquele agente deve entrar na fila de uma pessoa. */
export function esperaUmaPessoa(agente: string): boolean {
  return (AGENTES_QUE_ESPERAM_PESSOA as readonly string[]).includes(agente);
}

/** `true` quando o agente é ensaio: prepara e retém, sem nada a aprovar. */
export function ehEnsaio(agente: string): boolean {
  return (AGENTES_DE_ENSAIO as readonly string[]).includes(agente);
}

/**
 * `true` quando o agente NÃO está em nenhuma das duas listas.
 *
 * Existe para o contrato conseguir reprovar o escritor novo que ninguém
 * classificou. Sem esta pergunta, um agente esquecido cairia silenciosamente
 * fora da fila — que é o defeito oposto, e igualmente mudo: a proposta que
 * ninguém vê nunca é decidida.
 */
export function naoFoiClassificado(agente: string): boolean {
  return !esperaUmaPessoa(agente) && !ehEnsaio(agente);
}
