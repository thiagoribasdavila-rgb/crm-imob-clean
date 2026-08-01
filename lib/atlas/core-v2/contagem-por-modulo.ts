/* Import RELATIVO, não `@/`: os módulos puros deste repositório precisam rodar
   sob `node --test`, que não conhece o alias. Foi o que quebrou este arquivo na
   primeira execução. */
import { canonicalPipelineStage } from "../pipeline-stages.ts";

/**
 * O QUE CADA MÓDULO CONTA — e por que três deles contavam a mesma coisa.
 *
 * ── Medido na produção ─────────────────────────────────────────────────────
 *
 * O painel "Saúde operacional dos módulos" mostrava:
 *
 *     Leads .............. 482
 *     Pipeline ........... 482
 *     Tarefas e agenda ..... 7
 *     Clientes 360 ....... 482
 *
 * Três de quatro módulos com o MESMO número. Não era erro de cálculo: os três
 * chamavam `readState(leadResult, …)`, e `readState` devolve `result.count` —
 * o total de leads.
 *
 * Também não é factualmente falso. O pipeline realmente contém aquelas leads, e
 * Clientes 360 realmente as enxerga. O problema é outro: **um painel que repete
 * o mesmo número três vezes não informa nada sobre dois dos três módulos.** O
 * diretor lê "482, 482, 482" e não fica sabendo se o funil tem movimento nem se
 * há cliente alcançável.
 *
 * ── O que cada um passa a contar ───────────────────────────────────────────
 *
 *   Leads ......... todas. É o acervo, e o total é a resposta certa.
 *   Pipeline ...... só as ABERTAS. Um funil não "contém" o que já foi ganho ou
 *                   perdido — isso é histórico, não trabalho em andamento.
 *   Clientes 360 .. as com contato ALCANÇÁVEL (telefone ou e-mail). Uma visão
 *                   unificada de alguém que não dá para chamar não é cliente
 *                   360, é linha de banco.
 *
 * Módulo puro: sem banco, sem rede. Existe separado para poder ser testado — a
 * versão anterior desta regra vivia embutida numa chamada de função e por isso
 * nunca teve contrato.
 */

/** As etapas que tiram a lead do trabalho em andamento. */
const ETAPAS_FECHADAS = new Set(["ganho", "perdido", "comprou_outro"]);

export type LeadParaContagem = {
  status?: unknown;
  phone?: unknown;
  email?: unknown;
};

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Leads em andamento no funil.
 *
 * Usa `canonicalPipelineStage`, a mesma régua do resto do produto — escrever
 * uma lista de status aqui criaria a segunda definição de "fechado", e este
 * repositório já pagou caro por duas verdades sobre o mesmo fato.
 */
export function contarNoFunil(leads: LeadParaContagem[]): number {
  return leads.filter((lead) => {
    const etapa = canonicalPipelineStage(lead.status);
    // Etapa desconhecida conta como ABERTA: some no funil quem já saiu dele por
    // prova, nunca por falta de informação. Sumir com lead que ninguém
    // classificou é a forma silenciosa de perdê-la.
    return etapa === null || !ETAPAS_FECHADAS.has(etapa);
  }).length;
}

/**
 * Leads que dá para alcançar.
 *
 * Telefone OU e-mail — basta um canal. Exigir os dois reprovaria a maioria das
 * leads de anúncio, que chegam só com telefone, e o número deixaria de
 * descrever a operação.
 */
export function contarAlcancaveis(leads: LeadParaContagem[]): number {
  return leads.filter((lead) => texto(lead.phone).length > 0 || texto(lead.email).length > 0).length;
}
