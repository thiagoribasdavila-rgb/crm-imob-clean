/**
 * A SAÚDE DA ENTRADA DA META — e por que silêncio não é sintoma.
 *
 * ── O alarme que eu quase construí errado ─────────────────────────────────
 *
 * O pedido natural é "alertar quando ficar sem eventos". Medido em 03/08/2026:
 * o último evento tinha 6 dias. Um alarme por silêncio teria acendido — e
 * estaria ERRADO, porque a lead mais nova na Meta era de 26/07. Não havia nada
 * para entregar. O webhook estava perfeito.
 *
 * Um vigia que acende quando não há defeito é pior que nenhum: a operação
 * aprende a ignorá-lo, e no dia do defeito real ele acende junto com o ruído de
 * sempre.
 *
 * O sintoma verdadeiro não é a ausência de evento — é a DIVERGÊNCIA entre os
 * dois lados. A Meta tem lead que o CRM não tem, e o tempo passa. Por isso o
 * estado se decide com dois números, nunca um:
 *
 *   · há quanto tempo o CRM não recebe evento;
 *   · quantas leads a Meta tem e o CRM não (a represa).
 *
 *   represa = 0                        → EM DIA, mesmo em silêncio de semanas
 *   represa > 0 e evento recente       → ATRASADO, a esteira está andando
 *   represa > 0 e silêncio prolongado  → MUDO, e isto é o defeito
 *
 * PURO: sem rede, sem banco, sem relógio próprio — o agora entra como
 * parâmetro, senão o mesmo dado daria veredito diferente conforme a hora.
 */

export type EstadoDaEntrada = "sem_configuracao" | "em_dia" | "atrasado" | "mudo" | "nunca_recebeu";

export type Veredicto = {
  estado: EstadoDaEntrada;
  /** Frase para a tela. Diz o que aconteceu E o que fazer. */
  resumo: string;
  /** Verdadeiro só quando exige ação — é o que a Sala de Comando deve acender. */
  exigeAcao: boolean;
  horasSemEvento: number | null;
  represa: number;
};

/** Acima disto, silêncio COM represa deixa de ser demora e vira defeito. */
export const HORAS_ATE_MUDO = 24;

export function avaliarEntradaDaMeta(entrada: {
  ultimoEventoEm: string | null;
  represa: number;
  fontesAtivas: number;
  agora: string;
}): Veredicto {
  const represa = Math.max(0, Math.floor(Number(entrada.represa) || 0));
  const agora = new Date(entrada.agora).getTime();
  const ultimo = entrada.ultimoEventoEm ? new Date(entrada.ultimoEventoEm).getTime() : null;
  const horasSemEvento =
    ultimo && Number.isFinite(ultimo) ? Math.max(0, Math.floor((agora - ultimo) / 3_600_000)) : null;

  if (!entrada.fontesAtivas) {
    return {
      estado: "sem_configuracao",
      resumo:
        "Nenhum formulário da Meta está ativo no CRM. Toda lead que chegar agora vai para a fila sem destino — " +
        "ative os formulários que a operação vai atender em Marketing.",
      exigeAcao: true,
      horasSemEvento,
      represa,
    };
  }

  if (horasSemEvento === null) {
    // Sem nenhum evento na história: só é problema se há lead esperando. Uma
    // integração recém-ligada, sem campanha rodando, é legitimamente silenciosa.
    return represa > 0
      ? {
          estado: "mudo",
          resumo: `A Meta tem ${represa} lead(s) que o CRM nunca recebeu, e nenhum evento chegou até hoje. O webhook não está entregando.`,
          exigeAcao: true,
          horasSemEvento: null,
          represa,
        }
      : {
          estado: "nunca_recebeu",
          resumo: "Nenhuma lead chegou ainda, e não há nenhuma esperando na Meta. Nada a fazer — a integração está pronta.",
          exigeAcao: false,
          horasSemEvento: null,
          represa,
        };
  }

  if (represa === 0) {
    return {
      estado: "em_dia",
      resumo:
        horasSemEvento >= HORAS_ATE_MUDO
          ? `Sem eventos há ${horasSemEvento}h — e sem nada esperando na Meta. Silêncio de campanha parada, não de falha.`
          : `Entrada em dia. Último evento há ${horasSemEvento}h e nenhuma lead esperando.`,
      exigeAcao: false,
      horasSemEvento,
      represa,
    };
  }

  if (horasSemEvento < HORAS_ATE_MUDO) {
    return {
      estado: "atrasado",
      resumo: `${represa} lead(s) esperando na Meta, mas a esteira está andando (último evento há ${horasSemEvento}h). Recupere pela represa em Marketing.`,
      exigeAcao: true,
      horasSemEvento,
      represa,
    };
  }

  return {
    estado: "mudo",
    resumo:
      `${represa} lead(s) na Meta sem entrar e ${horasSemEvento}h sem nenhum evento. ` +
      "Confira a inscrição leadgen da Página e o endereço de callback — isto não é campanha parada.",
    exigeAcao: true,
    horasSemEvento,
    represa,
  };
}
