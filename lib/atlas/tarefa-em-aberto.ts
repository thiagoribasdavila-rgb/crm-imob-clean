/**
 * O predicado de "tarefa ainda em aberto", isolado do resto.
 *
 * Existe por causa de uma divergência medida: `broker-daily/route.ts` já
 * derivava "tem tarefa vencida para esta lead" da tabela VIVA `tasks`
 * (`overdueByLead`), enquanto o sinal de atenção `follow_up_overdue` lia
 * `followups` — uma tabela com ZERO linhas em produção e sem NENHUM caminho de
 * INSERT em todo o repositório (a única escrita é um UPDATE por id em
 * `app/api/v2/approvals/[id]/route.ts`, de uma linha que nunca pôde nascer).
 *
 * Resultado: o mesmo fato — "havia algo agendado para esta lead e o prazo
 * passou" — tinha duas fontes, uma viva e uma morta, e o alerta lia a morta.
 * Ver [[caminhos-divergentes]].
 *
 * Mora fora de `attention-signals.ts` porque aquele arquivo começa com
 * `import "server-only"` e não pode ser importado por um teste de node. Aqui é
 * puro: entra status, sai veredito. Nenhuma consulta, nenhum relógio implícito
 * (o `agora` é sempre injetado). Sem imports — inclusive sem `@/`, que node não
 * resolve.
 */

/**
 * Status que significam "esta tarefa não cobra mais nada de ninguém".
 *
 * A comparação é feita sobre o texto normalizado (sem acento, minúsculo), por
 * isso "concluído", "CONCLUIDO" e "Concluida" caem todos aqui. Em produção os
 * status vivos são `pendente` e `OPEN` — nenhum deles concluído, o que é
 * justamente o ponto: eles CONTINUAM cobrando.
 */
export const STATUS_DE_TAREFA_CONCLUIDA: ReadonlySet<string> = new Set([
  "done",
  "concluido",
  "concluida",
  "completed",
  "cancelado",
  "cancelada",
]);

/** Minúsculas e sem acento — o mesmo tratamento nos dois lados da comparação. */
export function normalizarStatus(valor: unknown): string {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** true quando o status indica tarefa encerrada (feita ou cancelada). */
export function tarefaEstaConcluida(status: unknown): boolean {
  return STATUS_DE_TAREFA_CONCLUIDA.has(normalizarStatus(status));
}

/**
 * true quando a tarefa continua cobrando E o prazo já passou.
 *
 * Sem prazo gravado a tarefa NÃO é vencida: uma tarefa sem data não está
 * atrasada, está sem data. Tratar `null` como vencido marcaria a carteira
 * inteira — a mesma classe de erro que `primeiroContatoMensuravel` evita em
 * `attention-signals.ts`, onde ausência de leitura não pode virar afirmação.
 */
export function tarefaVencida(
  status: unknown,
  prazoMs: number | null,
  agoraMs: number,
): boolean {
  if (tarefaEstaConcluida(status)) return false;
  if (prazoMs === null || !Number.isFinite(prazoMs)) return false;
  return prazoMs < agoraMs;
}
