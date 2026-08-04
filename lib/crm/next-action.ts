/**
 * PRÓXIMA AÇÃO — o compromisso mais barato que o corretor pode assumir.
 *
 * ── O BURACO QUE ISTO FECHA ─────────────────────────────────────────────────
 *
 * Medido na base: **208 de 217 leads sem próxima ação**. Não é desleixo da
 * operação — é que não havia porta. `next_action_at` só era escrito por dois
 * caminhos, os dois caros:
 *
 *   1. agendar uma VISITA ao imóvel — o compromisso mais pesado que existe;
 *   2. o PATCH do lead, que valida o registro inteiro (nome, telefone, e-mail,
 *      orçamento) e é um formulário, não um botão.
 *
 * Quem só quer dizer "ligo pra ele terça" não tinha onde clicar. E o que não
 * tem onde clicar não acontece.
 *
 * ── POR QUE UM MÓDULO PURO ──────────────────────────────────────────────────
 *
 * A conta de "daqui a 3 dias, em horário comercial" tem casos de borda que
 * merecem teste sem banco: fim de semana, virada de mês, horário que cairia de
 * madrugada. Separar a aritmética do gravar permite provar cada um.
 */

/** Os prazos que o corretor de fato usa. Três, não dez — lista longa vira menu. */
export const PRAZOS = [
  { chave: "amanha", rotulo: "Amanhã", dias: 1 },
  { chave: "tres_dias", rotulo: "Em 3 dias", dias: 3 },
  { chave: "semana", rotulo: "Semana que vem", dias: 7 },
] as const;

export type ChaveDePrazo = (typeof PRAZOS)[number]["chave"];

/** Começo e fim do expediente, em hora de São Paulo. */
const ABRE = 9;
const FECHA = 18;

/**
 * O fuso da OPERAÇÃO, não o do servidor.
 *
 * A primeira versão usava `getHours()` puro. No teste real o servidor rodava em
 * UTC: marquei às 15h de São Paulo (18h UTC), a conta leu 18h, achou que era
 * fim de expediente e empurrou para as 9h — que em São Paulo são 6h da manhã.
 *
 * O produto inteiro é brasileiro e a rota da agenda já declara
 * `timezone: "America/Sao_Paulo"`. A conta de expediente tem que usar o mesmo.
 */
const FUSO = "America/Sao_Paulo";

/** A hora do dia em São Paulo, seja qual for o fuso do servidor. */
function horaEmSaoPaulo(data: Date): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(data),
  );
}

/**
 * O dia da semana em São Paulo. 0 = domingo.
 *
 * EXPORTADA porque o corte da fila (lib/atlas/triagem-da-fila.ts) precisa
 * contar DIAS ÚTEIS para dizer quando cada faixa termina. Redefinir "fim de
 * semana" lá seria criar duas verdades sobre a mesma coisa dentro do mesmo
 * produto — a classe de bug [[caminhos-divergentes]], que aqui nem precisaria
 * de banco para acontecer.
 */
export function diaDaSemanaEmSaoPaulo(data: Date): number {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, weekday: "short" }).format(data);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nome);
}

/** Move a data para uma hora cheia de São Paulo, preservando o dia de lá. */
function comHoraDeSaoPaulo(data: Date, hora: number): Date {
  const atual = horaEmSaoPaulo(data);
  const ajustada = new Date(data);
  ajustada.setUTCHours(ajustada.getUTCHours() + (hora - atual));
  ajustada.setUTCMinutes(0, 0, 0);
  return ajustada;
}

/**
 * Calcula quando a próxima ação cai.
 *
 * Três regras, todas por um motivo prático:
 *
 * 1. **Preserva a hora do dia.** Marcar às 14h e receber o lembrete às 14h de
 *    quinta é o que a pessoa esperava. Fixar num horário arbitrário obrigaria
 *    todo mundo a reagendar.
 *
 * 2. **Nunca cai fora do expediente.** Marcar às 21h e agendar para as 21h de
 *    amanhã é um lembrete que ninguém vê. Fora da janela, vai para a abertura.
 *
 * 3. **Nunca cai em fim de semana.** Empurra para segunda. "Semana que vem"
 *    marcado numa quarta cairia em quarta — mas "amanhã" numa sexta cairia no
 *    sábado, e sábado o corretor não liga para lead frio.
 */
export function calcularProximaAcao(prazo: ChaveDePrazo, agora: Date): Date {
  const dias = PRAZOS.find((p) => p.chave === prazo)?.dias;
  if (!dias) throw new Error(`Prazo desconhecido: ${prazo}`);

  let quando = new Date(agora.getTime() + dias * 86_400_000);

  const hora = horaEmSaoPaulo(quando);
  if (hora < ABRE || hora >= FECHA) {
    quando = comHoraDeSaoPaulo(quando, ABRE);
  }

  while ([0, 6].includes(diaDaSemanaEmSaoPaulo(quando))) {
    quando = comHoraDeSaoPaulo(new Date(quando.getTime() + 86_400_000), ABRE);
  }

  return quando;
}

/** Rótulos curtos do que se vai fazer. O agenda mostra este texto. */
export const ACOES = [
  { chave: "ligar", rotulo: "Ligar" },
  { chave: "whatsapp", rotulo: "Mandar WhatsApp" },
  { chave: "enviar_material", rotulo: "Enviar material" },
  { chave: "visita", rotulo: "Combinar visita" },
  { chave: "proposta", rotulo: "Preparar proposta" },
] as const;

export type ChaveDeAcao = (typeof ACOES)[number]["chave"];

export function rotuloDaAcao(chave: string): string | null {
  return ACOES.find((a) => a.chave === chave)?.rotulo ?? null;
}

/**
 * Texto que vai para a coluna `next_action`, e que a agenda exibe.
 *
 * Sem rótulo, a agenda mostraria "Follow-up com Fulano" e nada mais — a pessoa
 * chega na hora sem lembrar o que ia fazer. O rótulo é o que separa um lembrete
 * de um compromisso.
 */
export function descreverProximaAcao(acao: ChaveDeAcao, observacao?: string): string {
  const base = rotuloDaAcao(acao) ?? "Follow-up";
  const extra = (observacao ?? "").trim().slice(0, 120);
  return extra ? `${base} — ${extra}` : base;
}

/**
 * ── "NÃO DEU ERRO" NUNCA FOI "GRAVOU" ───────────────────────────────────────
 *
 * A tela só pode desenhar a marcação que o SERVIDOR devolveu. Um `response.ok`
 * sozinho não prova escrita nenhuma: no PostgREST um `update` que não casa com
 * linha alguma volta 200, sem erro e sem linha — e a rota que não pede `select`
 * de volta não tem como distinguir os dois casos. Se um dia isso acontecer aqui,
 * o corretor veria "✓ terça, 14h30" numa lead que continua sem compromisso, e a
 * próxima auditoria concluiria de novo que ninguém agenda.
 *
 * Por isso a confirmação é o ECO: a resposta precisa dizer o que ficou gravado.
 * Marcação exige uma data que o `Date` consiga ler; limpeza exige o `null`
 * explícito. Qualquer outra forma é recusa — e recusa aparece para quem clicou,
 * porque marcação que some em silêncio é pior que erro.
 *
 * Função PURA e exportada para ser exercitável sem navegador: a regra que
 * separa "gravou" de "respondeu" é justamente a que nenhum teste de render
 * pegaria.
 */
export type LeituraDaMarcacao =
  | { confirmado: true; quando: string | null; descricao: string | null }
  | { confirmado: false; motivo: string };

export function lerRespostaDaMarcacao(
  intencao: "marcar" | "limpar",
  ok: boolean,
  corpo: unknown,
): LeituraDaMarcacao {
  const raiz = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;

  if (!ok) {
    const erro = (raiz.error && typeof raiz.error === "object" ? raiz.error : {}) as Record<string, unknown>;
    const mensagem = typeof erro.message === "string" && erro.message.trim() ? erro.message.trim() : "";
    return { confirmado: false, motivo: mensagem || "Não foi possível marcar." };
  }

  const dados = (raiz.data && typeof raiz.data === "object" ? raiz.data : null) as Record<string, unknown> | null;
  if (!dados) {
    return { confirmado: false, motivo: "O servidor respondeu sem dizer o que gravou." };
  }

  const eco = dados.proximaAcaoEm;
  const descricao = typeof dados.descricao === "string" && dados.descricao.trim() ? dados.descricao.trim() : null;

  if (intencao === "limpar") {
    // `null` explícito é a confirmação da limpeza. `undefined` é ausência de
    // resposta — e ausência não pode virar "limpou", senão a tela apaga um
    // compromisso que continua no banco.
    if (eco !== null) return { confirmado: false, motivo: "O servidor não confirmou a limpeza." };
    return { confirmado: true, quando: null, descricao: null };
  }

  if (typeof eco !== "string" || Number.isNaN(new Date(eco).getTime())) {
    return { confirmado: false, motivo: "O servidor não devolveu a data gravada." };
  }
  return { confirmado: true, quando: eco, descricao };
}
