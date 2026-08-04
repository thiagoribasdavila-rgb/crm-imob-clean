/**
 * A INGESTÃO PAROU E NINGUÉM SOUBE.
 *
 * ── O que foi medido em 03/08/2026 ──────────────────────────────────────────
 *
 * `meta_lead_events` recebeu a última linha às 15:29. Seis leads reais chegaram
 * na Meta entre 16:16 e 21:52 — nomes, telefones, e-mails, três delas marcadas
 * como Investimento — e NENHUMA entrou no CRM. Seis horas de silêncio, e o
 * silêncio só foi percebido porque o dono do produto colou a lista da Meta no
 * chat e perguntou por que as leads não estavam lá.
 *
 * Nada no produto acendeu. O painel de saúde media integrações CONFIGURADAS,
 * não integrações PRODUZINDO. Uma integração perfeitamente configurada que
 * parou de trazer lead passa por saudável em todo indicador que existia.
 *
 * ── POR QUE "HÁ QUANTO TEMPO" NÃO BASTA SOZINHO ────────────────────────────
 *
 * O teste ingênuo — "faz mais de N horas que não entra lead" — acende falso
 * toda madrugada e todo domingo. Anúncio não gera lead às 4 da manhã, e um
 * alarme que toca todo dia às 4 é um alarme que ninguém lê em uma semana.
 *
 * O que distingue "parou" de "está quieto" é a COMPARAÇÃO COM O PRÓPRIO
 * HISTÓRICO da mesma faixa de horário. Se nos últimos 14 dias esta operação
 * recebeu leads às 18h em 13 deles, seis horas de silêncio começando às 16h é
 * anomalia. Se nunca recebeu lead depois das 22h, silêncio às 23h é rotina.
 *
 * ── E POR QUE O SILÊNCIO SOZINHO TAMBÉM NÃO BASTA ──────────────────────────
 *
 * Há um segundo modo de falha, pior e mais silencioso: a lead CHEGA no evento e
 * não vira lead. Foi o caso das 42 falhas em três dias — todas de dedupe, todas
 * benignas. Mas a mesma contagem subindo por outro motivo (token vencido,
 * Página trocada, fonte desativada) seria invisível pelo critério de silêncio,
 * porque os eventos continuam entrando.
 *
 * Então o vigia tem DUAS entradas independentes, e qualquer uma acende:
 *
 *   1. SILÊNCIO ANÔMALO — parou de entrar evento numa faixa em que costuma entrar;
 *   2. ENTRA E NÃO VIRA — a taxa de falha do período estourou o teto.
 *
 * PURO: sem banco, sem rede, sem relógio próprio. Quem chama traz os fatos e o
 * instante — é o que torna cada caso abaixo reproduzível.
 */

/** Uma janela de uma hora do histórico: quantos eventos entraram naquela hora do dia. */
export type HoraDoHistorico = {
  /** 0–23, no fuso da operação. */
  hora: number;
  /** Em quantos dos dias observados entrou ao menos um evento nesta hora. */
  diasComEntrada: number;
  /** Quantos dias foram observados ao todo. */
  diasObservados: number;
};

export type FatosDaIngestao = {
  /** Instante da avaliação (ms). Entra por parâmetro para o caso ser reproduzível. */
  agora: number;
  /** Último evento recebido (ms), ou `null` se a fonte nunca produziu nada. */
  ultimoEventoEm: number | null;
  /** Hora do dia (0–23) do instante da avaliação, no fuso da operação. */
  horaAgora: number;
  /** O histórico por hora do dia, dos últimos dias. */
  historico: readonly HoraDoHistorico[];
  /** Eventos processados na janela recente e quantos falharam. */
  processados: number;
  falhados: number;
};

export type VeredictoDaIngestao = {
  /** `true` quando alguém precisa olhar AGORA. */
  acende: boolean;
  /** Qual entrada acendeu. `null` quando não acendeu. */
  motivo: "silencio_anomalo" | "entra_e_nao_vira" | "nunca_produziu" | null;
  /** Frase para o log, para a tela e para o corpo da resposta. Nunca vazia. */
  porque: string;
  /** Minutos desde o último evento, ou `null` se nunca houve um. */
  silencioEmMinutos: number | null;
  /**
   * A confiança de que ESTA hora costuma ter movimento: 0 a 1. Abaixo do piso,
   * o silêncio não é julgado — é a diferença entre madrugada e defeito.
   */
  confiancaDaFaixa: number;
};

/**
 * Quanto tempo de silêncio começa a incomodar numa faixa que costuma ter
 * movimento. Duas horas, e o número tem origem: o backfill roda de hora em hora
 * (`33 * * * *`), então uma hora de silêncio pode ser só a espera pela próxima
 * passagem. Duas significa que a passagem aconteceu e não trouxe nada.
 */
const SILENCIO_QUE_INCOMODA_MIN = 120;

/**
 * Em quantos dos dias observados a faixa precisa ter tido movimento para que o
 * silêncio nela conte como anomalia. 0,6 tolera fim de semana sem calar o vigia
 * em dia útil.
 */
const PISO_DE_CONFIANCA = 0.6;

/**
 * Teto de falha na janela. Acima disto não é ruído de dedupe — é causa de pé.
 * 40% porque a base real convive com dedupe legítima (42 de 123 em três dias,
 * ou 34%), e um teto abaixo disso acenderia sobre o normal da operação.
 */
const TETO_DE_FALHA = 0.4;

/** Quantos eventos são necessários para a taxa de falha significar algo. */
const AMOSTRA_MINIMA_DE_FALHA = 5;

export function avaliarIngestao(fatos: FatosDaIngestao): VeredictoDaIngestao {
  const daFaixa = fatos.historico.find((h) => h.hora === fatos.horaAgora);
  const confianca = daFaixa && daFaixa.diasObservados > 0
    ? daFaixa.diasComEntrada / daFaixa.diasObservados
    : 0;

  const silencioEmMinutos = fatos.ultimoEventoEm === null
    ? null
    : Math.max(0, Math.floor((fatos.agora - fatos.ultimoEventoEm) / 60_000));

  // ── ENTRA E NÃO VIRA ──────────────────────────────────────────────────────
  //
  // Avaliada ANTES do silêncio, e a ordem importa: quando os eventos chegam e
  // morrem, o silêncio não existe e o critério 1 nunca acenderia. Este é o modo
  // de falha que passa despercebido por mais tempo.
  if (fatos.processados >= AMOSTRA_MINIMA_DE_FALHA) {
    const taxa = fatos.falhados / fatos.processados;
    if (taxa > TETO_DE_FALHA) {
      return {
        acende: true,
        motivo: "entra_e_nao_vira",
        porque:
          `${fatos.falhados} de ${fatos.processados} eventos da Meta falharam na janela ` +
          `(${Math.round(taxa * 100)}%, teto de ${Math.round(TETO_DE_FALHA * 100)}%). ` +
          "A entrada está funcionando e as leads não estão virando lead — olhe o motivo do erro nos eventos, " +
          "não a conexão da Página.",
        silencioEmMinutos,
        confiancaDaFaixa: confianca,
      };
    }
  }

  // ── NUNCA PRODUZIU ────────────────────────────────────────────────────────
  //
  // Fonte que jamais trouxe evento não tem histórico para comparar, e chamar
  // isso de "parou" seria errado. Mas também não pode passar por saudável: uma
  // integração ligada que nunca produziu é uma integração que ninguém provou.
  if (fatos.ultimoEventoEm === null) {
    return {
      acende: true,
      motivo: "nunca_produziu",
      porque:
        "Nenhum evento de lead da Meta foi recebido até hoje. A integração pode estar " +
        "configurada e nunca ter sido exercitada — configurar não é o mesmo que funcionar.",
      silencioEmMinutos: null,
      confiancaDaFaixa: confianca,
    };
  }

  // ── SILÊNCIO ANÔMALO ──────────────────────────────────────────────────────
  const minutos = silencioEmMinutos ?? 0;
  if (minutos >= SILENCIO_QUE_INCOMODA_MIN && confianca >= PISO_DE_CONFIANCA) {
    const horas = Math.floor(minutos / 60);
    return {
      acende: true,
      motivo: "silencio_anomalo",
      porque:
        `${horas} h sem nenhum evento de lead da Meta. Nesta faixa de horário a operação recebeu leads ` +
        `em ${daFaixa?.diasComEntrada} dos últimos ${daFaixa?.diasObservados} dias — o silêncio aqui não é rotina. ` +
        "Confira, nesta ordem: o worker de backfill rodou? o token da Meta está válido? a Página continua conectada?",
      silencioEmMinutos: minutos,
      confiancaDaFaixa: confianca,
    };
  }

  // Não acende — e a frase diz POR QUE não, para que "tudo bem" seja
  // verificável em vez de ser um silêncio de segunda ordem.
  return {
    acende: false,
    motivo: null,
    porque: minutos < SILENCIO_QUE_INCOMODA_MIN
      ? `Último evento há ${minutos} min, dentro do normal.`
      : `${Math.floor(minutos / 60)} h sem evento, mas esta faixa de horário raramente tem movimento ` +
        `(${daFaixa?.diasComEntrada ?? 0} de ${daFaixa?.diasObservados ?? 0} dias). Silêncio esperado, não julgado.`,
    silencioEmMinutos: minutos,
    confiancaDaFaixa: confianca,
  };
}

/**
 * Monta o histórico por hora a partir dos carimbos crus dos eventos.
 *
 * Separado de propósito: quem chama traz os timestamps do banco e o fuso, e a
 * contagem acontece aqui, onde dá para testar sem banco.
 */
export function historicoPorHora(
  carimbos: readonly number[],
  agora: number,
  diasObservados: number,
  horaDe: (ms: number) => number,
): HoraDoHistorico[] {
  const inicio = agora - diasObservados * 24 * 60 * 60_000;
  const diasComEntradaPorHora = new Map<number, Set<string>>();
  for (const carimbo of carimbos) {
    if (carimbo < inicio || carimbo > agora) continue;
    const hora = horaDe(carimbo);
    const dia = new Date(carimbo).toISOString().slice(0, 10);
    const dias = diasComEntradaPorHora.get(hora) ?? new Set<string>();
    dias.add(dia);
    diasComEntradaPorHora.set(hora, dias);
  }
  return Array.from({ length: 24 }, (_, hora) => ({
    hora,
    diasComEntrada: diasComEntradaPorHora.get(hora)?.size ?? 0,
    diasObservados,
  }));
}
