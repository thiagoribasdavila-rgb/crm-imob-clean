/**
 * VOCABULÁRIO DE STATUS DE TAREFA — um só, para o projeto inteiro.
 *
 * Antes deste arquivo existiam CINCO definições de "tarefa concluída", uma por
 * rota, e nenhuma igual à outra:
 *
 *   /api/v1/tasks            done, concluido, concluida, completed
 *   /api/v1/calendar         concluida, cancelada, completed, cancelled
 *   /api/v1/leads/[id]       done, concluida, concluído, completed, cancelado
 *   /api/v1/ai/proactive     done, concluido, concluida, completed, cancelado, cancelled
 *   /governance/command-center  done, concluida
 *
 * O resultado prático: a MESMA tarefa contava como aberta numa tela e fechada
 * na outra. O consolidado da diretoria (lista mais curta) enxergava pendências
 * que a agenda já considerava resolvidas, e "concluído" com acento só era
 * reconhecido em um dos cinco lugares.
 *
 * ── POR QUE A LISTA É GRANDE ────────────────────────────────────────────────
 *
 * Porque a escrita também está partida, e isso é histórico, não escolha:
 *
 *   `pendente`  /api/v1/tasks (POST) e o vigia de SLA de primeiro contato
 *   `OPEN`      objeções, aprovações e o relatório semanal do parceiro
 *   `concluida` /api/v1/tasks (PATCH)
 *
 * A base de homologação hoje tem 6 tarefas, todas `pendente`. Se a leitura
 * passasse a aceitar só um vocabulário, as tarefas escritas pelo outro sumiriam
 * da tela — e tarefa que some é trabalho que ninguém faz. Aceitar os dois na
 * LEITURA e padronizar aos poucos a ESCRITA é o caminho que não perde nada no
 * meio.
 */

/** Status que significam "esta tarefa não precisa mais de ninguém". */
const ENCERRADOS = new Set([
  // concluída
  "done", "completed", "concluido", "concluída", "concluida", "concluído",
  // cancelada
  "cancelled", "canceled", "cancelado", "cancelada",
]);

/** Status que significam "esta tarefa espera alguém". */
const ABERTOS = new Set(["open", "pendente", "pending", "todo", "doing", "em_andamento"]);

const normalizar = (status: unknown) =>
  String(status ?? "").trim().toLowerCase();

/**
 * A tarefa foi encerrada?
 *
 * Status desconhecido conta como ABERTA, e não como fechada. É a escolha
 * conservadora certa: cobrar uma tarefa já feita custa um clique de quem a
 * recebe; esquecer uma pendente custa um cliente.
 */
export function tarefaEncerrada(status: unknown): boolean {
  return ENCERRADOS.has(normalizar(status));
}

/** Complemento de `tarefaEncerrada`, incluindo o status desconhecido. */
export function tarefaAberta(status: unknown): boolean {
  return !tarefaEncerrada(status);
}

/** Reconhecido explicitamente como aberto — sem contar o desconhecido. */
export function tarefaExplicitamenteAberta(status: unknown): boolean {
  return ABERTOS.has(normalizar(status));
}

/**
 * Lista para o filtro `not.in` do PostgREST.
 *
 * Devolve a forma pronta — `(done,completed,...)` — porque montar essa string à
 * mão em cada rota foi como as cinco listas divergiram.
 *
 * Sem acentos: PostgREST não escapa caracteres fora de ASCII nesse formato e a
 * consulta quebraria. Quem grava com acento é pego na leitura em memória, por
 * `tarefaEncerrada`, que é onde o acento é tratado.
 */
export function statusEncerradosParaPostgrest(): string {
  const semAcento = [...ENCERRADOS].filter((valor) => /^[a-z_]+$/.test(valor));
  return `(${semAcento.join(",")})`;
}

/** Os nomes canônicos para ESCRITA nova. Leitura continua aceitando o resto. */
export const STATUS_TAREFA_ABERTA = "pendente";
export const STATUS_TAREFA_CONCLUIDA = "concluida";
