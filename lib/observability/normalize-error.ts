/**
 * Normalização de erro para log. Função PURA, separada do logger pelo mesmo motivo que a
 * redação: lógica que não toca o servidor precisa poder ser exercida por um teste.
 *
 * MOTIVO DE EXISTIR — um defeito visto em produção, não hipotético. O log de
 * atlasaios.com.br mostrava, em toda falha da ingestão de eventos:
 *
 *     "event":"v3.event_ingest_failed","error":{"value":"[object Object]"}
 *
 * A rota chamava logger.error corretamente. O problema era a normalização: ela tratava
 * só `error instanceof Error` e, para qualquer outra coisa, fazia String(error).
 *
 * Acontece que boa parte dos erros deste produto NÃO é instância de Error. O PostgREST
 * (Supabase) rejeita com objeto simples { message, details, hint, code }, e
 * `String({...})` devolve literalmente "[object Object]" — a informação inteira é
 * destruída no exato momento em que ela seria útil. O operador ficava vendo que algo
 * falhou, sem nenhuma pista do quê.
 *
 * A normalização abaixo preserva a forma do que foi lançado. A proteção de dado sensível
 * não se perde: quem chama passa o resultado por sanitizeLogMetadata, que redige por
 * nome de chave e por valor.
 */

/** JSON tolerante a referência circular — um log nunca pode derrubar o processo. */
function jsonSeguro(valor: unknown): string {
  const vistos = new WeakSet<object>();
  try {
    return JSON.stringify(valor, (_chave, v) => {
      if (typeof v === "object" && v !== null) {
        if (vistos.has(v as object)) return "[circular]";
        vistos.add(v as object);
      }
      return v;
    }) ?? "undefined";
  } catch {
    return "[não serializável]";
  }
}

export function normalizeError(error: unknown, profundidade = 0): Record<string, unknown> {
  if (error instanceof Error) {
    const saida: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    // A causa encadeada é onde costuma estar o erro de verdade quando alguém embrulha
    // a exceção original. Limitada em profundidade para não virar recursão infinita.
    const causa = (error as Error & { cause?: unknown }).cause;
    if (causa !== undefined && profundidade < 3) saida.cause = normalizeError(causa, profundidade + 1);
    return saida;
  }

  if (error !== null && typeof error === "object") {
    // O caso que produzia "[object Object]": erro do PostgREST e afins. Preservar os
    // campos devolve message, code, details e hint — que é o que explica a falha.
    //
    // A ida e volta por JSON não é preciosismo: espalhar com { ...plano } manteria uma
    // referência circular viva, e quem chama faz JSON.stringify no payload inteiro. O
    // log estouraria — virando a causa da queda que ele deveria explicar. jsonSeguro
    // troca o ciclo por "[circular]" e garante que a saída é serializável.
    const plano = error as Record<string, unknown>;
    const bruto = jsonSeguro(plano);
    let saida: Record<string, unknown>;
    try {
      const analisado = JSON.parse(bruto) as unknown;
      saida = analisado !== null && typeof analisado === "object" ? (analisado as Record<string, unknown>) : {};
    } catch {
      saida = {};
    }
    // Objeto sem nenhum campo legível (instância de classe com propriedades não
    // enumeráveis, por exemplo) ainda assim deixa rastro, em vez de sumir do log.
    if (Object.keys(saida).length === 0) saida.serialized = bruto;
    return saida;
  }

  // Primitivo lançado (string, número, null, undefined): String() aqui é correto.
  return { value: String(error ?? "unknown") };
}
