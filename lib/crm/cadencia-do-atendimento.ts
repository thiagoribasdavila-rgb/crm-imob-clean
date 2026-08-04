// Import RELATIVO com extensão `.ts`, não o atalho `@/`: os contratos rodam em
// `node --test`, que não conhece os `paths` do tsconfig. Um módulo puro que usa
// `@/` fica inalcançável por teste — e foi assim que este repositório já
// entregou "módulo com contrato" cujo contrato não conseguia nem importá-lo.
import { AMOSTRA_MINIMA_PARA_MEDIANA, medianaEmMinutos, type Mediana } from "../relatorio-incorporador/apuracao.ts";

/**
 * CADÊNCIA, VOLUME DE TRABALHO E O QUE AINDA NÃO DÁ PARA AFIRMAR.
 *
 * O dono pediu "toda a cadência e os contatos para podermos analisar o volume de
 * trabalho e efetividade na conversão". Três perguntas: QUANTO cada pessoa
 * trabalhou, com QUE INTERVALO, e se isso CONVERTE.
 *
 * ── O LASTRO, MEDIDO NO BANCO VIVO EM 2026-08-02 ────────────────────────────
 *
 * `activities` tem 481 linhas e TODAS são `pipeline_stage_changed`. Isso NÃO
 * quer dizer "zero contato": o registro de contato do CRM mora em
 * `lead_events` (36 `call` + 14 `whatsapp` medidos em 02/08/2026), e concluir
 * ausência a partir da tabela errada foi um defeito real desta própria frente.
 * O rastro ABUNDANTE de trabalho continua sendo a movimentação do funil, em
 * `pipeline_stage_moves` (478 linhas), e é dela que sai toda a cadência abaixo:
 * 50 contatos não sustentam mediana de intervalo. Este módulo mede o que
 * existe e diz, por escrito, o que não existe.
 *
 *   478 movimentos · 444 leads · 2 atores · 27/07 a 02/08
 *   429 das 444 leads (96,6%) têm UM ÚNICO movimento
 *    34 intervalos entre toques ao todo, em 15 leads
 *    13 desses 34 intervalos duram menos de 5 minutos
 *
 * ── POR QUE O PISO DE LOTE EXISTE ───────────────────────────────────────────
 *
 * Um corretor não liga para a mesma pessoa duas vezes em 90 segundos. Intervalo
 * curtíssimo é edição em lote — o funil sendo arrumado numa sentada — e entrou
 * no ledger com a mesma forma de um toque real. Somar os dois produz uma
 * "mediana de cadência" de minutos que descreve o mouse do operador, não o
 * atendimento. Os dois lados são publicados: o que conta como trabalho e o que
 * foi descartado como lote, com o tamanho de cada um.
 *
 * ── O QUE ESTE MÓDULO SE RECUSA A CALCULAR ──────────────────────────────────
 *
 * Taxa de conversão por corretor. Não por escrúpulo estatístico com n=2, mas
 * porque as duas fontes de "venda" DISCORDAM sobre quem vendeu:
 *
 *   leads.status = 'ganho' .......... Claudia Ferreira, Monique Teles
 *   ledger com to_stage='ganho' ..... Antonio Junior, Claudia Ferreira
 *
 * Uma única lead aparece nas duas. Antonio Junior foi movido para "Ganhos" e
 * terminou em "Perdido"; Monique Teles está ganha sem o ledger ter registrado.
 * Antes de existir taxa, precisa existir concordância sobre o numerador.
 *
 * ── A REGRA QUE MANDA AQUI ──────────────────────────────────────────────────
 *
 * `medido: false` quer dizer "não sei", e carrega o MOTIVO. Zero quer dizer
 * "medi, e deu zero". A tela nunca recebe um número que precise adivinhar de
 * qual dos dois se trata — foi assim que este produto já desenhou ausência de
 * dado como desempenho ruim de gente.
 */

/** A linha do ledger, exatamente como a rota a lê. */
export type Movimento = {
  id: string;
  lead_id: string | null;
  actor_id: string | null;
  from_stage: string | null;
  to_stage: string | null;
  reversal_of: string | null;
  occurred_at: string | null;
};

/**
 * Um valor medido, ou a razão de não haver valor.
 *
 * `valor: null` é inalcançável quando `medido` é `true`, então a tela não
 * consegue imprimir "0" por engano: o discriminante obriga o ramo.
 */
export type Medicao<T> =
  | { medido: true; valor: T; amostra: number; porque: null }
  | { medido: false; valor: null; amostra: number; porque: string };

export function medido<T>(valor: T, amostra: number): Medicao<T> {
  return { medido: true, valor, amostra, porque: null };
}

export function naoMedido<T>(amostra: number, porque: string): Medicao<T> {
  return { medido: false, valor: null, amostra, porque };
}

/**
 * Abaixo disto, dois movimentos na mesma lead são a mesma sentada de trabalho.
 *
 * 5 minutos separa 13 dos 34 intervalos observados. O valor é uma escolha, e
 * por isso viaja para a tela em `pisoDeLoteMin`: quem lê o número vê a régua.
 */
export const PISO_DE_LOTE_MS = 5 * 60_000;

/**
 * Movimentos que continuam valendo: fora os desfeitos e fora as próprias
 * reversões.
 *
 * O ledger não apaga nada — desfazer grava uma segunda linha apontando para a
 * primeira. Contar as duas dobra o trabalho de quem corrigiu um engano, que é
 * exatamente o comportamento que não se quer punir.
 */
export function movimentosLiquidos(movimentos: readonly Movimento[]): Movimento[] {
  const desfeitos = new Set(
    movimentos.map((linha) => linha.reversal_of).filter((valor): valor is string => Boolean(valor)),
  );
  return movimentos.filter((linha) => !linha.reversal_of && !desfeitos.has(String(linha.id)));
}

/** Milissegundos de uma data ISO, ou `null` se a linha não tem quando. */
function instante(valor: string | null): number | null {
  if (!valor) return null;
  const ms = Date.parse(valor);
  return Number.isFinite(ms) ? ms : null;
}

export type IntervalosDaBase = {
  /** Intervalos que representam duas idas distintas à mesma lead. */
  trabalho: number[];
  /** Intervalos curtos demais para serem dois toques: edição em lote. */
  lote: number[];
  /** Leads que receberam 2+ movimentos — as únicas que têm intervalo. */
  leadsComIntervalo: number;
  /** Leads com um único movimento: cadência é indefinida nelas, não é zero. */
  leadsComToqueUnico: number;
};

/**
 * Os intervalos entre toques consecutivos, lead a lead.
 *
 * Só faz sentido dentro da MESMA lead: o tempo entre um movimento na lead A e o
 * seguinte na lead B mede a agenda do corretor, não a cadência de ninguém.
 */
export function intervalosDaBase(movimentos: readonly Movimento[]): IntervalosDaBase {
  const porLead = new Map<string, number[]>();
  for (const linha of movimentosLiquidos(movimentos)) {
    const leadId = String(linha.lead_id || "");
    const quando = instante(linha.occurred_at);
    if (!leadId || quando === null) continue;
    const lista = porLead.get(leadId);
    if (lista) lista.push(quando);
    else porLead.set(leadId, [quando]);
  }

  const trabalho: number[] = [];
  const lote: number[] = [];
  let leadsComIntervalo = 0;
  let leadsComToqueUnico = 0;

  for (const instantes of porLead.values()) {
    if (instantes.length < 2) {
      leadsComToqueUnico += 1;
      continue;
    }
    leadsComIntervalo += 1;
    const ordenados = [...instantes].sort((a, b) => a - b);
    for (let indice = 1; indice < ordenados.length; indice += 1) {
      const delta = ordenados[indice] - ordenados[indice - 1];
      if (delta < PISO_DE_LOTE_MS) lote.push(delta);
      else trabalho.push(delta);
    }
  }

  return { trabalho, lote, leadsComIntervalo, leadsComToqueUnico };
}

export type CadenciaDaBase = {
  /** Mediana do intervalo entre toques, em minutos. Reusa a régua de amostra. */
  intervaloMediano: Mediana;
  intervalosDeTrabalho: number;
  intervalosDeLote: number;
  leadsComIntervalo: number;
  leadsComToqueUnico: number;
  /** Fração das leads tocadas que nunca receberam um segundo toque (0–1). */
  fracaoComToqueUnico: number | null;
  pisoDeLoteMin: number;
};

/**
 * A cadência da base inteira — não por pessoa.
 *
 * Por pessoa seria uma tabela de uma linha com 33 intervalos e outra com zero:
 * a comparação existiria na tela e não existiria no dado.
 */
export function cadenciaDaBase(movimentos: readonly Movimento[]): CadenciaDaBase {
  const { trabalho, lote, leadsComIntervalo, leadsComToqueUnico } = intervalosDaBase(movimentos);
  const tocadas = leadsComIntervalo + leadsComToqueUnico;
  return {
    intervaloMediano: medianaEmMinutos(trabalho),
    intervalosDeTrabalho: trabalho.length,
    intervalosDeLote: lote.length,
    leadsComIntervalo,
    leadsComToqueUnico,
    fracaoComToqueUnico: tocadas > 0 ? leadsComToqueUnico / tocadas : null,
    pisoDeLoteMin: Math.round(PISO_DE_LOTE_MS / 60_000),
  };
}

export type VolumeDaPessoa = {
  id: string;
  movimentos: number;
  leadsTocadas: number;
  /** Dias do calendário (UTC) em que a pessoa moveu alguma coisa. */
  diasAtivos: number;
  /**
   * Movimentos por dia EM QUE TRABALHOU — não por dia da janela.
   *
   * Dividir pela janela transformaria férias em baixo desempenho. Esta razão
   * responde "quanto rende um dia de trabalho", e `diasAtivos` responde
   * "quantos dias houve" — as duas perguntas ficam separadas de propósito.
   */
  movimentosPorDiaAtivo: number | null;
  ultimoEm: string | null;
};

/** Volume de movimentação por pessoa, do ledger líquido. */
export function volumePorPessoa(movimentos: readonly Movimento[]): VolumeDaPessoa[] {
  const acumulado = new Map<string, { movimentos: number; leads: Set<string>; dias: Set<string>; ultimoEm: string | null }>();

  for (const linha of movimentosLiquidos(movimentos)) {
    const atorId = String(linha.actor_id || "");
    if (!atorId) continue;
    const atual = acumulado.get(atorId) ?? { movimentos: 0, leads: new Set<string>(), dias: new Set<string>(), ultimoEm: null };
    atual.movimentos += 1;
    if (linha.lead_id) atual.leads.add(String(linha.lead_id));
    if (linha.occurred_at) {
      // Fatia de 10 caracteres do ISO = o dia em UTC. A operação é brasileira e
      // um fuso deslocaria a virada do dia, mas o número publicado é "quantos
      // dias distintos", que não muda de tamanho por causa do deslocamento.
      atual.dias.add(linha.occurred_at.slice(0, 10));
      if (!atual.ultimoEm || linha.occurred_at > atual.ultimoEm) atual.ultimoEm = linha.occurred_at;
    }
    acumulado.set(atorId, atual);
  }

  return [...acumulado.entries()]
    .map(([id, dados]) => ({
      id,
      movimentos: dados.movimentos,
      leadsTocadas: dados.leads.size,
      diasAtivos: dados.dias.size,
      movimentosPorDiaAtivo: dados.dias.size > 0 ? Math.round((dados.movimentos / dados.dias.size) * 10) / 10 : null,
      ultimoEm: dados.ultimoEm,
    }))
    .sort((a, b) => b.movimentos - a.movimentos || b.leadsTocadas - a.leadsTocadas);
}

/**
 * Quantas pessoas precisam ter movimentado para uma comparação entre elas
 * significar alguma coisa, e quanto cada uma precisa ter feito.
 *
 * Duas pessoas onde uma fez 477 e a outra fez 1 não são duas observações: são
 * uma pessoa e uma testemunha.
 */
export const PESSOAS_MINIMAS_PARA_COMPARAR = 2;
export const MOVIMENTOS_MINIMOS_PARA_ENTRAR_NA_COMPARACAO = 10;
/** Acima desta fatia, o ledger é de uma pessoa só e a tabela não compara nada. */
export const CONCENTRACAO_QUE_IMPEDE_COMPARACAO = 0.8;

export type ConcentracaoDoLedger = {
  totalDeMovimentos: number;
  pessoas: number;
  /** Pessoas com volume suficiente para entrar numa comparação. */
  pessoasComVolume: number;
  /** Fatia da maior contribuinte (0–1), ou `null` sem movimento nenhum. */
  maiorFatia: number | null;
  /** Comparar volume ENTRE pessoas diz alguma coisa hoje? */
  comparavel: boolean;
  porque: string;
};

/**
 * Se a tabela de volume por pessoa pode ser lida como comparação.
 *
 * `/brokers` promete no próprio texto que não há ranking punitivo. Ordenar por
 * volume sem dizer que o ledger é de uma pessoa só entrega exatamente o ranking
 * que a tela nega — e ainda erra, porque as outras carteiras têm 1 e 2 leads.
 */
export function concentracaoDoLedger(volumes: readonly VolumeDaPessoa[]): ConcentracaoDoLedger {
  const totalDeMovimentos = volumes.reduce((soma, pessoa) => soma + pessoa.movimentos, 0);
  const pessoasComVolume = volumes.filter(
    (pessoa) => pessoa.movimentos >= MOVIMENTOS_MINIMOS_PARA_ENTRAR_NA_COMPARACAO,
  ).length;
  const maior = volumes.reduce((topo, pessoa) => Math.max(topo, pessoa.movimentos), 0);
  const maiorFatia = totalDeMovimentos > 0 ? maior / totalDeMovimentos : null;

  if (totalDeMovimentos === 0) {
    return { totalDeMovimentos, pessoas: volumes.length, pessoasComVolume, maiorFatia, comparavel: false, porque: "Nenhuma movimentação registrada na janela." };
  }
  if (pessoasComVolume < PESSOAS_MINIMAS_PARA_COMPARAR) {
    return {
      totalDeMovimentos,
      pessoas: volumes.length,
      pessoasComVolume,
      maiorFatia,
      comparavel: false,
      porque: `Só ${pessoasComVolume} pessoa com ${MOVIMENTOS_MINIMOS_PARA_ENTRAR_NA_COMPARACAO}+ movimentos na janela. Não há entre quem comparar.`,
    };
  }
  if (maiorFatia !== null && maiorFatia >= CONCENTRACAO_QUE_IMPEDE_COMPARACAO) {
    return {
      totalDeMovimentos,
      pessoas: volumes.length,
      pessoasComVolume,
      maiorFatia,
      comparavel: false,
      porque: `Uma pessoa responde por ${Math.round(maiorFatia * 100)}% da movimentação. A ordem da lista é volume, não desempenho.`,
    };
  }
  return { totalDeMovimentos, pessoas: volumes.length, pessoasComVolume, maiorFatia, comparavel: true, porque: "" };
}

export type FontesDaVenda = {
  /** Leads com `leads.status = 'ganho'`. */
  porStatus: readonly string[];
  /** Leads com um movimento `to_stage = 'ganho'` no ledger. */
  porLedger: readonly string[];
};

export type VeredictoDaConversao = {
  /** Leads que as DUAS fontes reconhecem como venda. */
  concordam: number;
  /** Leads que só uma das fontes reconhece. */
  divergem: number;
  porStatus: number;
  porLedger: number;
  /** Dá para publicar taxa de conversão por pessoa? */
  afirmavel: boolean;
  porque: string;
};

/**
 * O veredicto sobre "efetividade na conversão".
 *
 * Duas barreiras, e a primeira é a que ninguém esperava: as fontes discordam
 * sobre QUEM vendeu. Enquanto discordarem, a taxa não tem numerador — e taxa
 * sem numerador confiável é a métrica mais cara que um CRM pode imprimir,
 * porque decide comissão e demissão.
 */
export function veredictoDaConversao(fontes: FontesDaVenda): VeredictoDaConversao {
  const status = new Set(fontes.porStatus.map(String).filter(Boolean));
  const ledger = new Set(fontes.porLedger.map(String).filter(Boolean));
  const concordam = [...status].filter((id) => ledger.has(id)).length;
  const uniao = new Set([...status, ...ledger]);
  const divergem = uniao.size - concordam;

  if (uniao.size === 0) {
    return { concordam, divergem, porStatus: status.size, porLedger: ledger.size, afirmavel: false, porque: "Nenhuma venda registrada em nenhuma das duas fontes." };
  }
  if (divergem > 0) {
    return {
      concordam,
      divergem,
      porStatus: status.size,
      porLedger: ledger.size,
      afirmavel: false,
      porque: `As duas fontes de venda discordam em ${divergem} de ${uniao.size} leads: a etapa da lead e o histórico do funil apontam vendas diferentes. Sem um numerador único não existe taxa.`,
    };
  }
  if (concordam < AMOSTRA_MINIMA_PARA_MEDIANA) {
    return {
      concordam,
      divergem,
      porStatus: status.size,
      porLedger: ledger.size,
      afirmavel: false,
      porque: `${concordam} venda(s) no total. Uma venda a mais dobraria a taxa de alguém — o número diria mais sobre o acaso que sobre a pessoa.`,
    };
  }
  return { concordam, divergem, porStatus: status.size, porLedger: ledger.size, afirmavel: true, porque: "" };
}

/**
 * Minutos em texto curto para a tela.
 *
 * Mora aqui, e não no `.tsx`, porque `node --test` não tira tipos de JSX:
 * qualquer regra escrita lá dentro fica fora do alcance de todo contrato. A
 * conversão tem casos de borda de verdade (menos de um minuto, hora exata,
 * mais de um dia) e cada um deles decide uma frase que o gestor vai ler.
 */
export function formatarDuracaoEmMinutos(minutos: number | null): string | null {
  if (minutos === null || !Number.isFinite(minutos) || minutos < 0) return null;
  if (minutos < 1) return "menos de 1 min";
  const total = Math.round(minutos);
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas < 24) return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`;
  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;
  return horasRestantes === 0 ? `${dias}d` : `${dias}d ${horasRestantes}h`;
}

/**
 * Quantos toques a lead levou até avançar de etapa — quando levou.
 *
 * Fica preparado para o contato virar rastro: hoje só há movimentação, e o
 * resultado sai `medido: false` com o motivo na mão. Quando `activities`
 * receber ligação e WhatsApp, a mesma função passa a contar toques de verdade
 * sem a tela mudar de forma.
 */
export function toquesAteAvancar(movimentos: readonly Movimento[], avancou: (de: string | null, para: string | null) => boolean): Medicao<number> {
  const porLead = new Map<string, Movimento[]>();
  for (const linha of movimentosLiquidos(movimentos)) {
    const leadId = String(linha.lead_id || "");
    if (!leadId || instante(linha.occurred_at) === null) continue;
    const lista = porLead.get(leadId);
    if (lista) lista.push(linha);
    else porLead.set(leadId, [linha]);
  }

  const contagens: number[] = [];
  for (const linhas of porLead.values()) {
    const ordenadas = [...linhas].sort((a, b) => (instante(a.occurred_at) ?? 0) - (instante(b.occurred_at) ?? 0));
    const posicao = ordenadas.findIndex((linha) => avancou(linha.from_stage, linha.to_stage));
    if (posicao >= 0) contagens.push(posicao + 1);
  }

  if (contagens.length < AMOSTRA_MINIMA_PARA_MEDIANA) {
    return naoMedido(contagens.length, `Só ${contagens.length} lead(s) avançaram de etapa com histórico suficiente para contar toques.`);
  }
  const ordenadas = [...contagens].sort((a, b) => a - b);
  const meio = Math.floor(ordenadas.length / 2);
  const bruto = ordenadas.length % 2 ? ordenadas[meio] : (ordenadas[meio - 1] + ordenadas[meio]) / 2;
  return medido(Math.round(bruto * 10) / 10, contagens.length);
}
