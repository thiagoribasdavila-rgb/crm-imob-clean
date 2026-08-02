/**
 * AS CAMADAS DA SALA DE COMANDO, POR PAPEL.
 *
 * Mora aqui, e não dentro da página, por dois motivos. O primeiro é de teste: o
 * `node --test` não consegue tirar tipos de `.tsx`, então uma decisão presa num
 * componente com JSX é uma decisão que nenhum contrato alcança. O segundo é de
 * projeto: isto é uma regra de negócio — quem vê o quê primeiro — e regra de
 * negócio dentro de um componente de 4.500 linhas é regra que ninguém acha.
 *
 * Módulo PURO: sem rede, sem React, sem relógio. O contrato o EXECUTA.
 */

/** As camadas recolhíveis da sala de comando. `true` = nasce recolhida. */
export type CamadasDaSala = {
  ia: boolean;
  operacao: boolean;
  fila: boolean;
  feed: boolean;
  medicao: boolean;
  sistema: boolean;
};

/**
 * ── CADA PAPEL COM A SUA IMPORTÂNCIA, E NINGUÉM PERDE NADA ──────────────────
 *
 * Decisão do dono em 02/08/2026: a sala de comando é tela DE TODOS — não se
 * esconde seção por papel. O que muda é o que já vem ABERTO.
 *
 * Antes disto a página era idêntica para os três papéis: mesma ordem, mesmas
 * camadas abertas. "Tela de todos" acabava significando "tela de ninguém em
 * particular" — o corretor rolava a operação inteira para chegar na fila dele, e
 * o diretor abria a fila de um corretor, que não é o trabalho dele.
 *
 * Nada aqui remove conteúdo: toda camada continua a um clique, e a escolha da
 * pessoa sobrevive à sessão. A precedência é: escolha da pessoa > padrão do
 * papel > padrão genérico.
 *
 *   DIRETOR   `medicao` aberta. Ele precisa da operação INTEIRA para decidir, e
 *             é ali que estão funil, evolução, equipe, projetos e alertas. A
 *             fila do corretor nasce recolhida: não é o trabalho dele.
 *   GESTOR    `fila` e `medicao` abertas. Ele decide sobre pessoas E precisa do
 *             número que sustenta a conversa.
 *   CORRETOR  `fila` aberta, `medicao` recolhida. A fila é o trabalho dele; a
 *             medição da operação inteira é o maior bloco da página e não muda
 *             nenhuma decisão que ele toma hoje.
 */
export function camadasDoPapel(papel: string): Partial<CamadasDaSala> {
  if (papel === "director" || papel === "admin") return { medicao: false, fila: true };
  if (papel === "manager" || papel === "superintendent") return { medicao: false, fila: false };
  if (papel === "broker") return { medicao: true, fila: false };
  return {};
}

