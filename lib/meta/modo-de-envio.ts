/**
 * MODO DE ENVIO DA CONVERSÃO — uma definição só, para todos os caminhos.
 *
 * `meta_conversion_configs.mode` decide UMA coisa e só uma: se o evento sai com
 * `test_event_code` junto. Com o código, a Meta recebe o evento na aba de teste
 * do Gerenciador de Eventos e NÃO o usa para otimizar entrega — é assim que ela
 * separa ensaio de sinal. Sem o código, o evento entra na otimização real.
 *
 * ── O DEFEITO QUE ESTE MÓDULO FECHA (medido em 02/08/2026) ──────────────────
 *
 * O modo também decidia se a conversão era ENFILEIRADA. `lib/meta/conversions.ts`
 * só criava a tarefa no outbox com `mode = 'test'`, e não enfileirar era o
 * caminho de SUCESSO daquele `return`: no dia em que alguém promovesse o dataset
 * para produção — e existe rota para isso, `conversion_go_live` —, a fila
 * simplesmente parava de ser alimentada sem um único erro em lugar nenhum.
 *
 * A pinça era perfeita e fechava dos dois lados: em teste a Meta recebia e não
 * aprendia; fora do teste o CRM não enviava. Não havia estado em que o sinal
 * chegasse valendo.
 *
 * Enfileirar passou a depender de `enabled`, que é a chave de liga/desliga da
 * organização. O modo só é lido na hora do envio, que é onde ele significa algo.
 *
 * ── POR QUE VALOR DESCONHECIDO CAI PARA TESTE ───────────────────────────────
 *
 * Comparação exata com `"live"`, sem trim nem lowercase: qualquer outra coisa é
 * teste. Errar para o lado do teste custa um evento não contabilizado; errar
 * para o outro contamina a otimização real com dado que ninguém validou. E o
 * erro não fica mudo — em modo teste o envio EXIGE `test_event_code`, então um
 * `mode` estranho sem código estoura no worker com a frase que diz o que houve.
 */
export type ModoDeEnvioDeConversao = "test" | "live";

export function normalizarModoDeEnvio(valor: unknown): ModoDeEnvioDeConversao {
  return valor === "live" ? "live" : "test";
}

/**
 * O MESMO predicado responde "exigir o código?" e "mandar o código no corpo?".
 *
 * Separar as duas perguntas cria as duas metades do acidente: exigir e não
 * mandar (o evento vai como produção achando que é ensaio) ou mandar sem exigir
 * (o evento vira ensaio sem ninguém pedir, e a otimização nunca recebe nada).
 * Enquanto for esta função nos dois lugares, as respostas não têm como divergir.
 */
export function deveEnviarCodigoDeTeste(modo: ModoDeEnvioDeConversao): boolean {
  return modo === "test";
}
