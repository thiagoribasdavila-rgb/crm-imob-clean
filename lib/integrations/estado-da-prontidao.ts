/**
 * OS SEIS ESTADOS DA PRONTIDÃO — e por que a ORDEM entre eles é o que importa.
 *
 * ── O DEFEITO QUE ISTO RESOLVE ──────────────────────────────────────────────
 *
 * `/api/v1/ready` respondia com um booleano e uma lista de alertas. Isso junta
 * coisas que exigem reações opostas:
 *
 *   · fila pausada de propósito     → não faça nada, foi decisão sua
 *   · agendador morto               → acorde alguém, lead está parando
 *   · segredo do cron ausente       → configure, nunca chegou a funcionar
 *   · leitura falhou                → não sei dizer, não conclua nada
 *
 * Medido em 2026-07-30: um kill switch acionado produzia exatamente a mesma tela
 * que um agendador morto. Quem olhasse não teria como distinguir uma pausa
 * intencional de 44 horas de fila parada — e foi assim que 44h49m passaram
 * despercebidas.
 *
 * ── A PRECEDÊNCIA, QUE É A PARTE NÃO ÓBVIA ──────────────────────────────────
 *
 * Um sistema pausado ACUMULA fila. Se "fila parada" tivesse precedência sobre
 * "pausado", toda pausa intencional seria reportada como incidente depois de
 * alguns minutos — e o alerta que grita sempre é o alerta que ninguém lê.
 *
 * Por isso: PAUSADO vence PARADO. E `not_configured` vence `unhealthy`, porque
 * "nunca foi ligado" não é "quebrou": o conserto é configurar, não investigar.
 */

export type EstadoDaProntidao =
  | "healthy"
  | "degraded"
  | "paused_by_kill_switch"
  | "not_configured"
  | "unhealthy"
  | "unknown";

export type ObservacaoDaProntidao = {
  /** O banco respondeu? Sem ele nada mais importa. */
  bancoOk: boolean;
  /** `ATLAS_CRON_SECRET` presente. Só o booleano — nunca o valor. */
  segredoDoCronConfigurado: boolean;
  /** Kill switch acionado. */
  pausada: boolean;
  /** Conseguimos LER a fila? `false` = não sabemos, e isso não é zero. */
  filaMedida: boolean;
  /** Itens em `failed` + `dead_letter`. */
  itensComFalha: number;
  /** Conseguimos avaliar o agendador? */
  agendadorMedido: boolean;
  /**
   * O agendador está parado: existe item elegível há tempo demais sem ninguém
   * pegar. É diferente de "fila vazia" — worker morto e worker sem trabalho
   * deixam a fila igualmente quieta.
   */
  agendadorParado: boolean;
  /**
   * A fila deu SINAL para opinar sobre o agendador? Ver
   * `lib/integrations/agendador-parado.ts`: a heurística só acusa parada
   * quando há item NUNCA TENTADO e velho. Sem isso ela devolve
   * `parado: false`, e antes de 02/08/2026 este arquivo lia esse false como
   * "executa". Não é a mesma coisa.
   */
  agendadorObservavel?: boolean;
};

export type VereditoDaProntidao = {
  estado: EstadoDaProntidao;
  /** Frase para humano. Diz o que É e o que FAZER. */
  motivo: string;
  /** Alguém precisa agir agora? Pausa intencional NÃO precisa. */
  exigeAcao: boolean;
  /** Distingue "está tudo bem" de "não deu para saber". */
  medido: boolean;
};

export function avaliarProntidao(o: ObservacaoDaProntidao): VereditoDaProntidao {
  // 1. Sem banco não há o que afirmar sobre mais nada.
  if (!o.bancoOk) {
    return {
      estado: "unhealthy",
      motivo: "O banco não respondeu. Nenhuma outra medida desta resposta é confiável enquanto isso durar.",
      exigeAcao: true,
      medido: true,
    };
  }

  // 2. PAUSADO vence PARADO — e esta é a linha que impede o alarme falso.
  //    Um sistema pausado acumula fila por construção; reportar isso como
  //    incidente ensinaria a ignorar o alerta.
  if (o.pausada) {
    return {
      estado: "paused_by_kill_switch",
      motivo:
        "Fila PAUSADA de propósito pelo kill switch. O processamento está bloqueado por decisão, não por falha — nada a investigar. Para retomar, remova ATLAS_OUTBOX_PAUSADO do ambiente.",
      exigeAcao: false,
      medido: true,
    };
  }

  // 3. "Nunca foi ligado" não é "quebrou". O conserto é configurar.
  if (!o.segredoDoCronConfigurado) {
    return {
      estado: "not_configured",
      motivo:
        "ATLAS_CRON_SECRET não está no ambiente: o worker recusa qualquer chamada com 401 e o agendamento nunca chegou a funcionar. Isto é configuração pendente, não incidente.",
      exigeAcao: true,
      medido: true,
    };
  }

  // 4. Não conseguimos medir. Declarar isso é o oposto de dizer "está tudo bem".
  if (!o.filaMedida || !o.agendadorMedido) {
    return {
      estado: "unknown",
      motivo:
        "Não foi possível ler a fila ou avaliar o agendador. Ausência de medição NÃO é ausência de problema — não conclua nada a partir desta resposta.",
      exigeAcao: true,
      medido: false,
    };
  }

  // 5. Agendador parado com fila elegível: lead entra e não é trabalhada.
  if (o.agendadorParado) {
    return {
      estado: "unhealthy",
      motivo:
        "Há item elegível na fila há tempo demais sem ninguém pegar: o agendamento não está executando. Cada minuto aqui é lead que chegou e não foi trabalhada.",
      exigeAcao: true,
      medido: true,
    };
  }

  // 6. NÃO DÁ PARA AFIRMAR QUE RODA — e afirmar mesmo assim foi o defeito.
  //
  // Medido em 02/08/2026: a fila tinha 10 itens, todos com `attempts = 1`.
  // Nenhum nunca-tentado, então `agendadorParado` veio false e este arquivo
  // concluía "O agendamento executa". Não executava: ZERO disparos por
  // `schedule` em todos os workflows do repositório, medido pela API do GitHub
  // no mesmo instante.
  //
  // Fila sem item elegível é indistinguível de agendador saudável. A escolha
  // anterior era o lado otimista; a honesta é dizer que não se sabe. É a mesma
  // regra do custo de IA: sem tarifa o custo é NULO, não zero.
  if (o.agendadorObservavel === false) {
    return {
      estado: "unknown",
      motivo:
        o.itensComFalha > 0
          ? `Não dá para afirmar que o agendamento executa: nenhum item elegível na fila para observar. E há ${o.itensComFalha} item(ns) em failed/dead_letter, que não saem sozinhos.`
          : "Não dá para afirmar que o agendamento executa: nenhum item elegível na fila para observar. Fila vazia prova que não há trabalho represado, não que o worker acorda.",
      exigeAcao: true,
      medido: false,
    };
  }

  // 7. Roda, mas com entrega que não aconteceu.
  if (o.itensComFalha > 0) {
    return {
      estado: "degraded",
      motivo: `O agendamento executa, mas ${o.itensComFalha} item(ns) estão em failed/dead_letter — cada um é uma entrega que não aconteceu e não vai acontecer sozinha.`,
      exigeAcao: true,
      medido: true,
    };
  }

  return {
    estado: "healthy",
    motivo: "Agendamento executando, fila sem falha pendente e banco respondendo.",
    exigeAcao: false,
    medido: true,
  };
}

/**
 * O texto que a tela mostra ao lado do estado. Existe porque a diferença entre
 * PAUSA e INCIDENTE precisa estar escrita onde a pessoa olha — não no código.
 */
export const EXPLICACAO_DO_ESTADO: Record<EstadoDaProntidao, string> = {
  healthy: "Tudo medido e funcionando.",
  degraded: "Funciona, mas há entregas que falharam. Investigue sem urgência de madrugada.",
  paused_by_kill_switch: "Pausa INTENCIONAL. Não é pane, não acorde ninguém — alguém decidiu parar e o motivo está declarado.",
  not_configured: "Nunca chegou a funcionar por falta de configuração. Não é regressão; é passo pendente.",
  unhealthy: "Falha real acontecendo agora. Lead pode estar parando de chegar ao corretor.",
  unknown: "Não foi possível medir. Este estado NÃO significa que está tudo bem.",
};
