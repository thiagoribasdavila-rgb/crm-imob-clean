/**
 * A regra do sinal NUNCA CONTATADO, isolada do resto.
 *
 * Mora fora de `attention-signals.ts` por um motivo prático: aquele arquivo
 * começa com `import "server-only"`, o que o torna impossível de importar num
 * teste de node. A regra que decide se 443 leads aparecem ou somem da tela do
 * corretor não pode depender de subir o Next para ser verificada — então ela
 * vive aqui, pura: entra lead, sai veredito, nenhuma consulta, nenhum relógio
 * implícito (o `agora` é sempre injetado).
 *
 * `attention-signals.ts` consome esta função e a embrulha no formato
 * AttentionSignal. Um lugar só decide a regra; ver [[caminhos-divergentes]].
 */

// Tolerância depois do prazo de SLA vencido antes de virar crítico. Abaixo
// disso ainda é aviso: o corretor pode estar discando agora.
export const NEVER_CONTACTED_CRITICAL_HOURS = 24;

const HOUR_MS = 3_600_000;

export type VeredictoNuncaContatado = {
  /** Atraso em horas desde o prazo (ou desde a criação, quando não há prazo). */
  horasVencido: number;
  critico: boolean;
  /** Instante a partir do qual a condição está ativa, em ms. */
  desde: number;
  /** Falso quando a contagem caiu para `created_at` por falta de prazo gravado. */
  temPrazoGravado: boolean;
};

/**
 * Devolve o veredito, ou `null` quando não há sinal.
 *
 * `firstContactedAt` preenchido encerra a questão: o relógio parou, e o prazo
 * vencido deixa de importar. Sem prazo gravado a contagem cai para a criação
 * do lead — não ter SLA não pode ser o que salva um lead de aparecer.
 */
export function avaliarNuncaContatado(input: {
  firstContactedAtMs: number | null;
  firstContactDueAtMs: number | null;
  createdAtMs: number | null;
  agoraMs: number;
}): VeredictoNuncaContatado | null {
  if (input.firstContactedAtMs !== null) return null;
  const temPrazoGravado = input.firstContactDueAtMs !== null;
  const referencia = input.firstContactDueAtMs ?? input.createdAtMs;
  if (referencia === null || referencia > input.agoraMs) return null;
  const horasVencido = Math.max(0, Math.floor((input.agoraMs - referencia) / HOUR_MS));
  return {
    horasVencido,
    critico: horasVencido >= NEVER_CONTACTED_CRITICAL_HOURS,
    desde: referencia,
    temPrazoGravado,
  };
}
