/**
 * A INTENÇÃO QUE VEM NA URL — e por que ela estava sendo jogada fora.
 *
 * ── O DEFEITO, MEDIDO ────────────────────────────────────────────────────────
 *
 * `lib/atlas/navigation.ts` declara uma AÇÃO PRIMÁRIA para cada destino, com o
 * resultado comercial que ela deve produzir. Nove delas carregam um parâmetro:
 *
 *   Sala de comando → /pipeline?focus=priority   ("Avançar a oportunidade mais relevante")
 *   Tarefas         → /tasks?create=1            ("Agendar uma ação rastreável")
 *   Agenda          → /calendar?create=1         ("Reservar uma ação com cliente")
 *   Corretores      → /brokers?view=performance  ("Direcionar apoio a quem precisa")
 *   Distribuição    → /distribution?queue=unassigned
 *   Vendas          → /sales?view=forecast
 *   Usuários        → /users?create=1
 *   Vendas externas → /external-sales?create=1
 *   Configurações   → /settings?view=environment
 *
 * Em 2026-07-29 medi as nove telas de destino: NENHUMA lia parâmetro de URL.
 * Ou seja, as nove promessas eram decorativas — a pessoa clicava em "Nova
 * tarefa" e chegava em /tasks com nada aberto, clicava em "Abrir fila sem
 * responsável" e via a fila inteira. O catálogo prometia um resultado e a tela
 * entregava uma navegação.
 *
 * É a mesma classe do `/customers?focus=priority`, que também era decorativo, e
 * a mesma raiz da entrega anterior: o CRM inteiro tratava a barra de endereço
 * como enfeite. Nada disso aparecia em teste, porque a tela ABRIA — só não
 * fazia o que o botão dizia.
 *
 * ── POR QUE UM MÓDULO, E NÃO nove leituras soltas ────────────────────────────
 *
 * Porque nove cópias de "leia o parâmetro" divergem — é a classe de defeito que
 * este repositório mais pagou. Aqui a lista de intenções é FECHADA e derivada
 * do próprio catálogo: parâmetro que a navegação não promete não vira
 * comportamento, e promessa nova sem tratamento aparece no contrato.
 *
 * Sem `server-only`: assim o contrato executa a regra em vez de grepá-la.
 */

/** O que uma tela pode ser instruída a fazer ao abrir. */
export type IntencaoDeAbertura =
  /** Abrir o formulário de criação já na tela. */
  | { tipo: "criar" }
  /** Focar o item de maior prioridade, em vez da lista inteira. */
  | { tipo: "focar"; alvo: string }
  /** Abrir numa visão específica (aba, recorte, painel). */
  | { tipo: "visao"; alvo: string }
  /** Abrir já filtrado por uma fila nomeada. */
  | { tipo: "fila"; alvo: string };

/**
 * As chaves aceitas. Fechada de propósito: um parâmetro inventado na barra de
 * endereço não pode virar comportamento silencioso, e uma tela que reage a algo
 * que a navegação não promete é uma superfície que ninguém consegue auditar.
 */
const CHAVES: ReadonlyArray<{ chave: string; monta: (valor: string) => IntencaoDeAbertura | null }> = [
  { chave: "create", monta: (valor) => (valor === "1" ? { tipo: "criar" } : null) },
  { chave: "focus", monta: (valor) => (valor ? { tipo: "focar", alvo: valor } : null) },
  { chave: "view", monta: (valor) => (valor ? { tipo: "visao", alvo: valor } : null) },
  { chave: "queue", monta: (valor) => (valor ? { tipo: "fila", alvo: valor } : null) },
];

/**
 * Lê a intenção de uma query string. Recebe texto em vez de tocar `window`
 * para poder ser exercitada sem navegador — e para deixar explícito, em cada
 * chamada, de onde a string veio.
 *
 * Devolve `null` quando não há intenção reconhecível. `null` NÃO é erro: é o
 * caso normal de quem abriu a tela pelo menu.
 */
export function lerIntencaoDaUrl(queryString: string): IntencaoDeAbertura | null {
  let parametros: URLSearchParams;
  try {
    parametros = new URLSearchParams(queryString);
  } catch {
    // URL malformada nunca pode impedir a tela de carregar.
    return null;
  }
  for (const { chave, monta } of CHAVES) {
    const valor = parametros.get(chave);
    if (valor === null) continue;
    const intencao = monta(valor.trim());
    if (intencao) return intencao;
  }
  return null;
}

/** Conveniência para componentes cliente: lê a URL da própria janela. */
export function lerIntencaoDaJanela(): IntencaoDeAbertura | null {
  if (typeof window === "undefined") return null;
  return lerIntencaoDaUrl(window.location.search);
}

/** `true` se a intenção pede o formulário de criação. */
export function pedeCriar(intencao: IntencaoDeAbertura | null): boolean {
  return intencao?.tipo === "criar";
}

/** O alvo pedido para um tipo, ou `null`. */
export function alvoDaIntencao(
  intencao: IntencaoDeAbertura | null,
  tipo: "focar" | "visao" | "fila",
): string | null {
  return intencao && intencao.tipo === tipo ? intencao.alvo : null;
}
