/**
 * O AGENDADOR ACORDOU? — a distinção que a fila sozinha não faz.
 *
 * ── O QUE ISTO TORNA VISÍVEL ────────────────────────────────────────────────
 *
 * Medido em 2026-07-30, no banco vivo: dois itens `meta.lead.fetch` em
 * `integration_outbox` com `attempts = 0`, parados há 89h e 44h. Um deles era uma
 * lead paga da Meta que nunca virou registro.
 *
 * `attempts = 0` é o sinal decisivo, e ele não aparecia em lugar nenhum. De fora,
 * um worker MORTO e um worker SEM TRABALHO são idênticos: os dois deixam a fila
 * quieta. A diferença é que no primeiro caso existe trabalho parado que ninguém
 * reivindicou.
 *
 * ── POR QUE MÓDULO PURO ─────────────────────────────────────────────────────
 *
 * Esta decisão nasceu dentro da rota de prontidão e só pôde ser exercitada no
 * caso em que está tudo bem — a fila estava vazia quando foi escrita. Detector
 * cujo lado POSITIVO nunca rodou é a forma mais comum de guarda inútil neste
 * repositório. Separado, o contrato prova os dois lados.
 */

export type ItemDaFila = {
  attempts?: number | string | null;
  created_at?: string | null;
};

export type EstadoDoAgendador = {
  pendentes: number;
  /** Itens que NENHUM worker sequer reivindicou. */
  nuncaTentadas: number;
  /** Idade do mais antigo da fila, em horas. `null` quando a fila está vazia. */
  maisAntigaHoras: number | null;
  agendadorParadoProvavel: boolean;
};

/**
 * Duas horas: folgado o bastante para não acusar a cadência de 5 minutos por um
 * atraso normal, e curto o bastante para a lead da Meta não passar a noite parada.
 * Não é alarme por VOLUME — um único item nunca tentado e velho já prova que o
 * agendador não acordou, e é exatamente assim que o defeito se manifestou.
 */
export const HORAS_PARA_SUSPEITAR = 2;

export function avaliarAgendador(
  fila: ReadonlyArray<ItemDaFila>,
  agora: number = Date.now(),
): EstadoDoAgendador {
  const nuncaTentadas = fila.filter((item) => Number(item.attempts ?? 0) === 0).length;

  const idades = fila
    .map((item) => (item.created_at ? Date.parse(String(item.created_at)) : Number.NaN))
    .filter((ms) => Number.isFinite(ms))
    .map((ms) => (agora - ms) / 3_600_000);

  const maisAntigaHoras = idades.length ? Math.round(Math.max(...idades)) : null;

  return {
    pendentes: fila.length,
    nuncaTentadas,
    maisAntigaHoras,
    // As DUAS condições, e não uma: item novo e não tentado é a fila funcionando
    // normalmente; item velho JÁ tentado é worker que acorda e falha, que é outro
    // problema, com outro conserto.
    agendadorParadoProvavel: nuncaTentadas > 0 && (maisAntigaHoras ?? 0) >= HORAS_PARA_SUSPEITAR,
  };
}
