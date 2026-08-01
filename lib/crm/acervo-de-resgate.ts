/**
 * A OFERTA ATIVA DO ACERVO DE RESGATE — uma definição só, para o banco, a rota
 * e a tela.
 *
 * ── O QUE O ACERVO É, E O QUE ELE NÃO É ─────────────────────────────────────
 *
 * Acervo de resgate é lista HISTÓRICA importada: gente que já falou com a
 * imobiliária um dia e não comprou. Não é demanda que pediu contato agora. O
 * produto distingue as duas coisas por `leads.import_batch_id`, e a central usa
 * essa distinção para dizer quem está esperando ligação.
 *
 * Misturar os dois destrói a única métrica que hoje mostra onde está o gargalo.
 * Medido em 2026-07-29: as 13 leads de acervo já migradas nasceram com
 * `first_contact_due_at` no PASSADO (06/06 a 14/07), porque o gatilho de SLA
 * carimbou o prazo a partir do `created_at` preservado da importação. Com 13 é
 * ruído. Com as 16.733 que faltam, a central mostraria ~17 mil violações de
 * primeiro contato e a métrica que revelou que o gargalo é DISTRIBUIÇÃO (272
 * leads numa pessoa, 9 corretores com zero) morreria afogada.
 *
 * Por isso a regra: **o acervo entra sem prazo; o relógio nasce no claim.**
 * Pegar é assumir.
 *
 * ── POR QUE ESTE MÓDULO EXISTE, E NÃO TRÊS CÓPIAS ───────────────────────────
 *
 * A regra da oferta aparece em quatro lugares: a RPC que grava, a rota que
 * traduz a recusa, a tela que explica antes do clique, e o contrato que prova.
 * Quatro cópias da mesma regra é a classe de defeito mais cara deste
 * repositório — `move.moveId` vs `move.id`, `pipeline_history` vs
 * `pipeline_stage_moves`, `developments` vs `crm_projects`, o predicado de
 * primeiro contato em duas versões.
 *
 * Os NÚMEROS moram aqui. O contrato executa a regra deste módulo contra o
 * comportamento do BANCO VIVO e exige que os dois concordem — é isso que faz
 * uma propriedade de banco sobreviver a mutação: trocar `5` por `7` aqui deixa
 * o módulo e o banco em desacordo, e o contrato fica vermelho.
 */

/** Tamanho do lote que o corretor pega de uma vez. É o pedido do dono: "10 por vez". */
export const LOTE_PADRAO = 10;

/**
 * A REGRA DE RECARGA, com número: o corretor pede o próximo lote quando tiver
 * MENOS DE 5 leads da oferta sem primeiro contato. Ou seja, tocou ≥6 das 10.
 *
 * Máximo possível em voo, por construção: 4 + 10 = 14 leads de resgate sem toque
 * por corretor.
 *
 * ── POR QUE 5, E O CUSTO DE CADA ALTERNATIVA (medido, não estimado) ──────────
 *
 * · SEM REGRA: um corretor esvazia o acervo em cliques e o acervo fica vazio sem
 *   ninguém ter ligado — pior que o problema de hoje. O precedente já existe
 *   nesta base: 270 leads paradas sem contato numa única pessoa, 271 na outra.
 * · DELEGAR AO TETO DE CARTEIRA (`broker_capacity_limits`, "ativas < 100"):
 *   bloqueia 2 dos 3 corretores REAIS (ddcorretorsp 112 ativas, vinicius 272) e
 *   é CEGO para o acervo — executado em 2026-07-29 com limite 1, o gatilho
 *   recusou a 2ª lead `novo` mas ACEITOU uma lead `perdido` estando estourado,
 *   porque status fechado sai pela cláusula de saída antecipada do próprio
 *   gatilho. Como 8 das 13 do pool (e 16.733 das 17.151 do v1) estão em
 *   perdido/arquivado, daria para acumular milhares lendo "0 de 100".
 * · "1 lote por dia sem exigir trabalho": 300 leads/mês sem toque por corretor —
 *   previsível e inútil, não liga ninguém a nada.
 * · "tocou TODAS as 10": um número errado congela o corretor para sempre. Só
 *   funciona porque existe descarte com motivo contando como toque — e existe.
 */
export const LIMITE_SEM_TOQUE = 5;

/** Teto diário de lotes: 3 (30 leads/dia). Limita o dano de um cliente automatizado. */
export const LOTES_POR_DIA = 3;

/**
 * O prazo de primeiro contato que o CLAIM carimba: 24h (1440 min), e não os 15
 * minutos do padrão nem os 5 de mídia paga.
 *
 * Lead histórica não tem meia-vida de 15 minutos, e prazo que já nasce estourado
 * não é prazo — é ruído com cara de urgência. O carimbo é atribuição DIRETA, não
 * `coalesce`: é isso que apaga o prazo vencido herdado pelas 13 já migradas.
 */
export const PRAZO_RESGATE_MINUTOS = 1440;

/**
 * Status que NUNCA entram na oferta, mesmo com lote de importação.
 *
 * `comprou_outro` está aqui por medição: o projeto v1 tem 4 leads nesse estado.
 * Oferecer para resgate quem já comprou de outro é o pior telefonema possível.
 */
export const STATUS_FORA_DA_OFERTA = [
  "ganho", "won", "vendido", "venda", "contrato", "proposta", "comprou_outro",
] as const;

/** O nome do marcador em `leads.metadata` que diz "esta lead veio da oferta ativa". */
export const MARCADOR = "acervo" as const;

/**
 * POR QUE O CONTADOR DA RECARGA É `metadata.acervo`, E NÃO `import_batch_id`.
 *
 * Medido: viniciusadolfodasilva já tem 270 leads com `import_batch_id` e 270/270
 * sem primeiro contato — o lote Arvo que a liderança empurrou para ele. Qualquer
 * regra contada por `import_batch_id` o BLOQUEIA no dia 1, e bloqueia justamente
 * quem mais precisa de ajuda. Com o marcador da oferta, o contador de todo mundo
 * começa em 0: ninguém é travado pelo passado e ninguém é premiado por ele.
 */
export const CAMINHO_DO_CONTADOR = "metadata #>> '{acervo,pegoEm}'" as const;

/**
 * O QUE CONTA COMO "TOCADA" — e o que não conta.
 *
 * `first_contacted_at` não nulo (carimbado por `complete_first_contact_sla`, que
 * dispara de atividade dos tipos call/email/whatsapp/visit/meeting/message/
 * contact e de mensagem entregue), `last_interaction_at` não nulo, ou descarte
 * com motivo (`metadata.acervo.descartadoEm`).
 *
 * Registrar NOTA não conta: nota não é contato. E para lead que já está em
 * `perdido`, mudar status não diz nada — daí o descarte precisar de marcador
 * próprio, senão a regra de recarga congelaria o corretor com 5 leads que ele
 * legitimamente decidiu não trabalhar.
 */
export const FORMAS_DE_TOCAR = [
  "first_contacted_at",
  "last_interaction_at",
  "metadata.acervo.descartadoEm",
] as const;

/** Erros NOMEADOS que a RPC levanta. A tela precisa poder explicar, não só desabilitar. */
export type MotivoDeRecusa =
  | "acervo_limite_invalido"
  | "acervo_ator_nao_e_corretor"
  | "acervo_ator_fora_da_organizacao"
  | "acervo_recarga_bloqueada"
  | "acervo_lotes_do_dia_esgotados"
  | "acervo_vazio"
  | "broker_total_capacity_reached";

type Traducao = { codigo: string; status: number; frase: string };

/**
 * De erro do banco para resposta HTTP honesta.
 *
 * 409 para "pool vazio" e "recarga bloqueada" é mais fiel que 403: não é falta
 * de permissão, é estado do mundo. 403 fica só para quem não é corretor — aí sim
 * a porta é fechada para a pessoa, não para o momento.
 */
const TRADUCOES: Record<MotivoDeRecusa, Traducao> = {
  acervo_limite_invalido: {
    codigo: "OFERTA_LOTE_INVALIDO", status: 400,
    frase: `O lote precisa ficar entre 1 e ${LOTE_PADRAO} leads.`,
  },
  acervo_ator_nao_e_corretor: {
    codigo: "OFERTA_ATOR_NAO_E_CORRETOR", status: 403,
    frase: "A oferta ativa é o auto-atendimento do corretor. Seu papel não pega leads do acervo.",
  },
  acervo_ator_fora_da_organizacao: {
    codigo: "OFERTA_ATOR_FORA_DA_ORGANIZACAO", status: 403,
    frase: "Este acervo é de outra imobiliária.",
  },
  acervo_recarga_bloqueada: {
    codigo: "OFERTA_RECARGA_BLOQUEADA", status: 409,
    frase: `Você ainda tem ${LIMITE_SEM_TOQUE} leads de resgate sem primeiro contato. Fale com elas (ou descarte com motivo) para liberar o próximo lote.`,
  },
  acervo_lotes_do_dia_esgotados: {
    codigo: "OFERTA_LOTES_DO_DIA_ESGOTADOS", status: 409,
    frase: `Você já pegou ${LOTES_POR_DIA} lotes hoje. O acervo continua aqui amanhã.`,
  },
  acervo_vazio: {
    codigo: "OFERTA_POOL_VAZIO", status: 409,
    frase: "O acervo de resgate está esgotado — não há lead histórica sem dono para pegar agora.",
  },
  broker_total_capacity_reached: {
    codigo: "OFERTA_TETO_DE_CARTEIRA", status: 409,
    frase: "Sua carteira já está no teto configurado pela liderança. Fale com seu gestor antes de pegar mais.",
  },
};

/**
 * Traduz a mensagem crua do Postgres. Procura o nome do erro DENTRO da mensagem
 * porque o supabase-js entrega `message` com prefixos que variam por versão.
 */
export function traduzirRecusaDoAcervo(mensagemDoBanco: unknown): Traducao & { motivo: MotivoDeRecusa | null } {
  const texto = String(mensagemDoBanco ?? "");
  for (const motivo of Object.keys(TRADUCOES) as MotivoDeRecusa[]) {
    if (texto.includes(motivo)) return { ...TRADUCOES[motivo], motivo };
  }
  return {
    motivo: null, codigo: "OFERTA_RECUSADA", status: 409,
    frase: "A regra da oferta ativa recusou este pedido.",
  };
}

/** Todos os motivos, para quem precisa iterar (contrato e tela). */
export function motivosDeRecusa(): MotivoDeRecusa[] {
  return Object.keys(TRADUCOES) as MotivoDeRecusa[];
}

export type EstadoDaOferta = {
  /** Papel comercial resolvido do ator. */
  papel: string | null;
  /** Leads da OFERTA na carteira dele, sem nenhum toque. */
  semToque: number;
  /** Lotes que ele já pegou hoje. */
  lotesHoje: number;
  /** Tamanho do pool agora. */
  disponivel: number;
  /** Teto de carteira configurado pela liderança, se existir. */
  tetoDeCarteira?: number | null;
  /** Carteira total da pessoa — TODAS as leads, inclusive perdido/arquivado. */
  carteiraTotal?: number | null;
};

export type Veredito = {
  pode: boolean;
  motivo: MotivoDeRecusa | null;
  /** O que a tela escreve. Bloqueio é FRASE, não botão cinza. */
  frase: string;
  /** Quantas leads este pedido levaria se fosse aceito agora. */
  lote: number;
};

/**
 * A MESMA ORDEM DE VERIFICAÇÃO DA RPC. A tela usa isto para explicar antes do
 * clique; o contrato usa para conferir que o banco decide igual.
 *
 * A ordem importa e não é cosmética: quem não é corretor ouve isso primeiro,
 * mesmo com o acervo vazio — porque o problema dele não é o acervo. E "acervo
 * esgotado" só aparece para quem PODERIA pegar, o que é a diferença entre
 * "acabou para todos" e "você já pegou o seu lote".
 */
export function avaliarPedidoDeLote(estado: EstadoDaOferta, pedido = LOTE_PADRAO): Veredito {
  const recusa = (motivo: MotivoDeRecusa, lote = 0): Veredito => ({
    pode: false, motivo, frase: TRADUCOES[motivo].frase, lote,
  });

  if (pedido < 1 || pedido > LOTE_PADRAO) return recusa("acervo_limite_invalido");
  if (estado.papel !== "broker") return recusa("acervo_ator_nao_e_corretor");
  if (estado.semToque >= LIMITE_SEM_TOQUE) return recusa("acervo_recarga_bloqueada");
  if (estado.lotesHoje >= LOTES_POR_DIA) return recusa("acervo_lotes_do_dia_esgotados");

  // Teto humano, quando existir. Conferido AQUI e não delegado ao gatilho:
  // medido, o gatilho é cego para lead em status fechado, e o acervo é quase
  // todo status fechado.
  let lote = pedido;
  const teto = estado.tetoDeCarteira ?? null;
  if (teto !== null) {
    const espaco = teto - (estado.carteiraTotal ?? 0);
    if (espaco <= 0) return recusa("broker_total_capacity_reached");
    lote = Math.min(lote, espaco);
  }

  if (estado.disponivel < 1) return recusa("acervo_vazio");
  lote = Math.min(lote, estado.disponivel);

  return {
    pode: true, motivo: null, lote,
    frase: `Pegar ${lote} ${lote === 1 ? "lead" : "leads"} do acervo`,
  };
}

/**
 * O contador que a tela mostra SEMPRE, para a trava nunca ser surpresa.
 * "Você tem 0 de 4 leads de resgate sem primeiro contato."
 */
export function fraseDoContador(semToque: number): string {
  return `Você tem ${semToque} de ${LIMITE_SEM_TOQUE - 1} leads de resgate sem primeiro contato.`;
}

/**
 * O AVISO DE CANAL — a frase honesta, antes do clique.
 *
 * ── O QUE FOI MEDIDO, E O QUE ISSO OBRIGA A TELA A DIZER ────────────────────
 *
 * No pool: 0 leads com consentimento `concedido`, 13 com `nao_perguntado`.
 * `lead_contact_preferences` 0 linhas, `messaging_suppressions` 0 linhas — não
 * existe registro de opt-out. Ausência de "não" NÃO é "sim": a tela diz
 * "consentimento não perguntado", nunca "sem restrição".
 *
 * `evaluateReactivationPlan` executado com os números do pool devolve
 * `eligible: false` com exatamente `["consent_missing","approved_template_missing"]`.
 *
 * ACHADO CONTRAINTUITIVO: `official_whatsapp_api_missing` NÃO dispara neste
 * ambiente, porque `officialApiReady` é `Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN)`
 * e as duas variáveis estão preenchidas. Presença de variável não é verificação
 * na Meta — o número está NOT_VERIFIED do lado de lá e este código não tem como
 * ver isso. Então a tela NÃO pode prometer canal oficial com base nesse sinal.
 * O único caminho hoje é LIGAR (linha do próprio corretor) ou e-mail individual.
 */
export function avisoDeCanal(input: {
  bloqueiosDeReativacao: readonly string[];
  semConsentimento: number;
  comTelefone: number;
  comEmail: number;
  total: number;
}): { frase: string; disparoEmMassaBloqueado: boolean; caminho: string } {
  const disparoEmMassaBloqueado = input.bloqueiosDeReativacao.length > 0;
  const consentimento = input.semConsentimento >= input.total && input.total > 0
    ? "Nenhuma destas leads tem consentimento registrado — o estado é “não perguntado”, que não é o mesmo que “sem restrição”."
    : `${input.semConsentimento} de ${input.total} sem consentimento registrado.`;
  const caminho = input.comTelefone > 0
    ? "Ligação individual pela sua linha é o caminho."
    : "Só há e-mail: contato individual por e-mail é o caminho.";
  return {
    disparoEmMassaBloqueado,
    caminho,
    frase: disparoEmMassaBloqueado
      ? `${consentimento} Disparo em massa está BLOQUEADO (${input.bloqueiosDeReativacao.join(", ")}). ${caminho}`
      : `${consentimento} ${caminho}`,
  };
}

/**
 * "ATRASADA NO PRIMEIRO CONTATO" — a definição que a central do corretor
 * precisava aprender.
 *
 * ── O DEFEITO QUE ISTO FECHA (classe "caminhos divergentes") ────────────────
 *
 * Existem TRÊS predicados de primeiro-contato-atrasado no código. Dois já olham
 * o prazo (`first_contact_due_at < now() and first_contacted_at is null`) e por
 * isso o acervo sem prazo sai da conta sozinho. O terceiro —
 * `analytics/broker-daily`, `!lead.first_contacted_at`, sem olhar prazo nenhum —
 * é a CENTRAL DO CORRETOR, e prazo NULL não protege nada ali.
 *
 * Hoje o acervo escapa por acidente: `CLOSED = {ganho,perdido,arquivado,
 * comprou_outro}` tira perdido/arquivado de `activeLeads` — 8 das 13 do pool e
 * 16.733 das 17.151 do v1. Mas as 5 do pool em `novo`/`contato` JÁ contam como
 * atrasadas hoje. E qualquer decisão futura de mover status para dentro do funil
 * ressuscita as ~17 mil violações de uma vez.
 *
 * A regra: para lead de ACERVO, atraso exige prazo gravado e vencido — que é
 * exatamente o que o claim carimba. Para demanda que pediu contato, nada muda.
 */
export function primeiroContatoAtrasado(
  lead: {
    first_contacted_at?: unknown;
    import_batch_id?: unknown;
    first_contact_due_at?: unknown;
  },
  agora: number = Date.now(),
): boolean {
  if (lead.first_contacted_at) return false;
  const ehAcervo = Boolean(lead.import_batch_id);
  if (!ehAcervo) return true;
  const prazo = lead.first_contact_due_at ? Date.parse(String(lead.first_contact_due_at)) : NaN;
  return Number.isFinite(prazo) && prazo < agora;
}
