/**
 * A JANELA DE 7 DIAS DA CAPI — a fronteira que ninguém tinha medido.
 *
 * ── O defeito, e como a causa foi encontrada ──────────────────────────────
 *
 * Medido em 03/08/2026: `meta_conversion_events` tinha 78 linhas e ZERO
 * entregues. Sessenta e sete estavam em `failed` com a mesma mensagem:
 *
 *     Meta Graph HTTP 400 [code 100/2804003]: Invalid parameter
 *
 * A mensagem não diz qual parâmetro. Testei um a um contra o dataset REAL
 * (`1360755608814341`, "ATLAS ONE - CRM"), e todos passaram: o dataset existe e
 * é alcançável; os dois tokens funcionam; o `test_event_code` de exemplo
 * funciona; `custom_data` com chave nula funciona.
 *
 * Sobrou a idade. Bissecando:
 *
 *     1 hora → OK        6 dias → OK
 *     8 dias → 2804003   41 dias → 2804003
 *
 * `2804003` é `event_time` FORA DA JANELA DE 7 DIAS. Os 67 eventos travados são
 * de 23 a 25 de junho — 41 dias. Eles NUNCA vão entrar, e o worker os retenta
 * a cada 4 horas desde então.
 *
 * ── Por que uma constante, e por que a margem ─────────────────────────────
 *
 * A janela é usada em DOIS momentos distintos — ao enfileirar e ao enviar — e
 * existe tempo entre eles. Um evento com 6 dias e 23 horas passa na fila e
 * chega ao envio com 7 dias e 1 hora: recusado, e volta para a fila para ser
 * recusado de novo.
 *
 * Por isso a margem: quem ENFILEIRA usa a janela encurtada; quem ENVIA usa a
 * janela cheia. Assim nada entra na fila para morrer nela.
 *
 * PURO: sem rede, sem banco, e o agora entra como parâmetro — senão o mesmo
 * evento teria veredito diferente conforme a hora da execução.
 */

/** A janela que a Meta aceita. Medida, não documentada: 6 dias passam, 8 não. */
export const DIAS_DA_JANELA_CAPI = 7;

/**
 * Margem para o tempo entre enfileirar e enviar.
 *
 * 12 horas cobre com folga a cadência de 4h do worker mais duas retentativas.
 * Encurtar a janela na entrada é o que impede um evento de nascer condenado.
 */
export const HORAS_DE_MARGEM = 12;

export type VereditoDaJanela = {
  dentro: boolean;
  idadeEmHoras: number;
  /** Motivo nomeado, para virar `last_error` em vez de um 400 opaco. */
  motivo: string | null;
};

/**
 * O evento cabe na janela?
 *
 * `paraEnfileirar` aplica a margem: recusa mais cedo, para não colocar na fila
 * o que vai vencer antes de sair dela.
 */
export function cabeNaJanelaDaCapi(entrada: {
  ocorridoEm: string | Date | null | undefined;
  agora: string | Date;
  paraEnfileirar?: boolean;
}): VereditoDaJanela {
  const agora = new Date(entrada.agora).getTime();
  const ocorrido = entrada.ocorridoEm ? new Date(entrada.ocorridoEm).getTime() : NaN;

  if (!Number.isFinite(ocorrido)) {
    // Sem data não dá para afirmar que cabe. Deixar passar seria descobrir o
    // problema como 400 opaco, que foi exatamente o que aconteceu por 41 dias.
    return { dentro: false, idadeEmHoras: NaN, motivo: "evento sem data de ocorrência" };
  }

  const idadeEmHoras = (agora - ocorrido) / 3_600_000;

  // Evento no FUTURO também é recusado pela Meta, e um relógio adiantado no
  // servidor produziria o mesmo 400 sem explicação.
  if (idadeEmHoras < -1) {
    return { dentro: false, idadeEmHoras, motivo: "evento com data no futuro" };
  }

  const limite = DIAS_DA_JANELA_CAPI * 24 - (entrada.paraEnfileirar ? HORAS_DE_MARGEM : 0);
  if (idadeEmHoras > limite) {
    const dias = (idadeEmHoras / 24).toFixed(1);
    return {
      dentro: false,
      idadeEmHoras,
      motivo:
        `fora da janela da CAPI: o evento tem ${dias} dias e a Meta aceita ${DIAS_DA_JANELA_CAPI}. ` +
        "Retentar não resolve — o erro 2804003 desta chamada é a idade, não o dataset nem o token.",
    };
  }

  return { dentro: true, idadeEmHoras, motivo: null };
}

/**
 * O status de quem venceu — e por que NÃO é um status novo.
 *
 * A primeira versão declarava `"expired"`, que descreve melhor o fato. O banco
 * vivo recusaria: o CHECK de `meta_conversion_events.status` aceita apenas
 * `pending | processing | delivered | failed | blocked | dead_letter`, e o
 * próprio código já avisava disso num comentário — "inventar um status a mais
 * estourava o check e o evento saía sem registro".
 *
 * Entre os que existem, `blocked` é o correto: já significa "decidimos não
 * enviar" (é o que o caminho `internal_only` usa). `failed` seria mentira —
 * misturaria prazo com erro de rede, e o painel voltaria a mostrar 67 "falhas"
 * que não são falha de nada. `dead_letter` significaria "desistimos depois de
 * tentar", e aqui nem se deve tentar.
 *
 * Um status próprio exigiria migração no banco vivo. Vale ter, mas é decisão de
 * quem opera — e não é pré-requisito para parar de retentar hoje.
 */
export const STATUS_FORA_DA_JANELA = "blocked";
