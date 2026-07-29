/**
 * O CORTE DA FILA — decompor "442 nunca contatados" nos trabalhos que ele
 * esconde.
 *
 * ── POR QUE ESTE MÓDULO EXISTE ──────────────────────────────────────────────
 *
 * A pergunta de comando era "dois corretores dão conta de 442?". A medição da
 * base viva (2026-07-29, organização Atlas One) mostra que ela está mal posta:
 * não existe UMA fila de 442. Existem quatro, de naturezas incompatíveis:
 *
 *   146 · pediu contato · telefone da praça ....... isto é atendimento
 *    25 · pediu contato · DDD de outro estado
 *   108 · lista importada · telefone da praça
 *   161 · lista importada · DDD de outro estado ... isto é telemarketing frio
 *     2 · praça não medida (telefone ilegível)
 *   ───
 *   442
 *
 * E o fato que reorganiza a decisão: as faixas NÃO estão misturadas entre os
 * corretores. Um carrega 145 dos 146 pedidos reais; o outro carrega 269 de
 * lista importada e NENHUM pedido. O gargalo medido é distribuição, não
 * headcount.
 *
 * E A FAIXA É FOTO, NÃO RÓTULO. Quatro horas depois, na mesma tarde, a mesma
 * conta deu 404 (114/19/108/161/2): 36 leads tinham sido encerrados e mais dois
 * contatados enquanto isto era escrito. Ninguém toca num lead e ele migra de
 * faixa sozinho, mas a COMPOSIÇÃO muda em silêncio — por isso a resposta carrega
 * `lidoEm` e a tela diz de quando é o número.
 *
 * ── POR QUE PURO, E FORA DE `attention-signals.ts` ──────────────────────────
 *
 * Mesmo motivo declarado em `regra-nunca-contatado.ts`: aquele arquivo começa
 * com `import "server-only"` e não pode ser importado num teste de node. A
 * regra que decide em qual faixa cada um dos 442 leads cai não pode depender de
 * subir o Next para ser verificada. Aqui não há consulta, não há fetch e não há
 * relógio implícito — `agoraMs` é sempre injetado.
 *
 * ── POR QUE ELE EXPORTA TAMBÉM O FRAGMENTO DE CONSULTA ──────────────────────
 *
 * A central conta a faixa em JS sobre o instantâneo já carregado; `/leads`
 * filtra em PostgREST. Dois caminhos, mesmo nome — e é exatamente a classe de
 * bug que este repositório já pagou (RPC e fallback que divergiram na chave).
 * Por isso o predicado e o fragmento de consulta nascem lado a lado, no mesmo
 * arquivo, e o contrato prova que os dois contam igual sobre o mesmo conjunto.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
 *
 * Nenhuma escrita. Nenhum verbo em lote. Ele não arquiva, não descarta, não
 * redistribui e não agenda cadência. Divide um número medido em cinco números
 * medidos, e o vermelho continua vermelho: 442 segue 442 até alguém discar.
 */

// Caminho RELATIVO, e não o alias `@/`: o alias é resolvido pelo bundler do
// Next e não pelo node, e um módulo que só carrega dentro do Next não pode ser
// exercitado por contrato — que é a razão inteira deste arquivo existir.
import { diaDaSemanaEmSaoPaulo } from "../crm/next-action.ts";

/**
 * DDD → UF. É fato de numeração telefônica publicado pela Anatel, não métrica
 * comercial inventada: nenhum número aqui foi estimado.
 *
 * CUIDADO DE LEITURA: o DDD diz onde a LINHA foi habilitada, não onde a pessoa
 * mora. Portabilidade existe — quem habilitou em Recife e mudou para Perdizes
 * carrega 81 para sempre. Por isso "fora da praça" é FAIXA e nunca descarte, e
 * por isso a tela precisa dizer isso por extenso.
 */
export const UF_POR_DDD: Readonly<Record<string, string>> = Object.freeze({
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP", "16": "SP", "17": "SP", "18": "SP", "19": "SP",
  "21": "RJ", "22": "RJ", "24": "RJ",
  "27": "ES", "28": "ES",
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF", "62": "GO", "64": "GO", "63": "TO",
  "65": "MT", "66": "MT", "67": "MS",
  "68": "AC", "69": "RO",
  "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
  "79": "SE", "81": "PE", "87": "PE", "82": "AL", "83": "PB", "84": "RN",
  "85": "CE", "88": "CE", "86": "PI", "89": "PI",
  "91": "PA", "93": "PA", "94": "PA", "92": "AM", "97": "AM",
  "95": "RR", "96": "AP", "98": "MA", "99": "MA",
});

/**
 * Tamanhos do telefone canônico: 55 + DDD(2) + assinante(8 ou 9).
 *
 * Medido nos 442 da fila: 422 com 13 caracteres e 18 com 12, todos começando
 * em 55. Sobram exatamente dois fora do formato — '971567739185' e
 * '01511991096505' — e são eles que viram "praça não medida". Um deles,
 * repare, começa com 97: lido de forma ingênua viraria DDD do Amazonas. Não
 * viramos: comprimento errado é ilegível, e ilegível é ausência de dado.
 */
const COMPRIMENTOS_CANONICOS = [12, 13] as const;

const DIA_MS = 86_400_000;

/**
 * O DDD do telefone normalizado, ou `null` quando não dá para ler.
 *
 * `null` é resposta de primeira classe: significa "a posição geográfica desta
 * linha não foi medida", nunca "está fora da praça".
 */
export function dddDoTelefone(telefone: unknown): string | null {
  const bruto = typeof telefone === "string" ? telefone : "";
  if (!/^\d+$/.test(bruto)) return null;
  if (!(COMPRIMENTOS_CANONICOS as readonly number[]).includes(bruto.length)) return null;
  if (!bruto.startsWith("55")) return null;
  const ddd = bruto.slice(2, 4);
  // DDD fora do plano de numeração também é "não medido": inventar um estado
  // para ele seria exatamente o número sem lastro que este projeto proíbe.
  return Object.hasOwn(UF_POR_DDD, ddd) ? ddd : null;
}

/** A UF de um DDD, ou `null` se ele não existe no plano de numeração. */
export function ufDoDdd(ddd: string | null): string | null {
  if (!ddd) return null;
  return UF_POR_DDD[ddd] ?? null;
}

export type Praca =
  | { medida: true; ufs: string[]; ativos: number; ativosSemUf: number; motivo: null }
  | { medida: false; ufs: []; ativos: number; ativosSemUf: number; motivo: string };

/**
 * A praça onde a empresa vende, DERIVADA dos empreendimentos ativos.
 *
 * Regra dura, sem exceção: se nenhum empreendimento ativo tem `state`
 * preenchido, a praça NÃO FOI MEDIDA e o eixo geográfico some da escada —
 * jamais "todo mundo está fora". A versão invertida seria plausível e
 * completamente errada, e é o modo de falha mais caro deste corte.
 *
 * Medido hoje: 4 ativos, 3 com state='SP' e Spin Mood com city/state nulos.
 * A lacuna é declarada, não preenchida por mim.
 *
 * ATENÇÃO À TABELA: existem DUAS de empreendimento nesta base (`developments`
 * e `crm_projects`, os mesmos 4 com IDs diferentes) e só `developments` tem a
 * coluna `state`. Ler a errada devolveria praça vazia — ver [[duas-tabelas]].
 */
export function derivarPraca(
  empreendimentos: Array<{ state?: unknown; status?: unknown }>,
): Praca {
  const ativos = empreendimentos.filter(
    (item) => String(item.status ?? "").trim().toLowerCase() === "active",
  );
  const ufs = [
    ...new Set(
      ativos
        .map((item) => String(item.state ?? "").trim().toUpperCase())
        .filter((uf) => /^[A-Z]{2}$/.test(uf)),
    ),
  ].sort();
  const ativosSemUf = ativos.length - ativos.filter((item) => /^[A-Z]{2}$/.test(String(item.state ?? "").trim().toUpperCase())).length;
  if (!ufs.length) {
    return {
      medida: false,
      ufs: [],
      ativos: ativos.length,
      ativosSemUf,
      motivo: ativos.length
        ? `nenhum dos ${ativos.length} empreendimentos ativos tem a UF preenchida em developments.state`
        : "nenhum empreendimento ativo cadastrado em developments",
    };
  }
  return { medida: true, ufs, ativos: ativos.length, ativosSemUf, motivo: null };
}

/**
 * As faixas.
 *
 * Duas perguntas, ambas respondidas por dado JÁ GRAVADO:
 *
 *  1. ALGUÉM PEDIU CONTATO? — `import_batch_id` responde. Medido na fila:
 *     270 vieram de importação em lote ('Relatório Arvo'), 172 não. Escolhido
 *     em vez de casar `source` por texto porque é estrutural: a coluna existe
 *     para dizer "esta linha entrou por carga, não por formulário", e é a
 *     mesma que o gatilho de aviso de lead nova já consulta para não disparar
 *     269 avisos numa importação.
 *
 *  2. O TELEFONE É DA PRAÇA? — DDD contra a UF dos empreendimentos ativos.
 *
 * O que este corte NÃO usa, de propósito: `score_ia`. Medido na fila — 427 dos
 * 442 leads compartilham dois valores (15 para toda a lista importada, 35 para
 * a maior parte dos meta_ads) e o máximo da base inteira é 50. O score É a
 * origem com passos a mais; ordenar por ele é ordenar por origem fingindo
 * julgamento por lead. E é por isso que "quentes" lê 0 na diretoria e é
 * matematicamente incapaz de ler outra coisa: a regra é
 * `temperature=quente OR score>=70` contra uma base cujo teto é 50.
 */
export const FAIXAS_DA_FILA = [
  {
    chave: "pediu_na_praca",
    rotulo: "Pediu contato · telefone da praça",
    criterio: "entrou por formulário/campanha e o DDD é de um estado onde a empresa vende",
    atendimento: true,
  },
  {
    chave: "pediu_fora_da_praca",
    rotulo: "Pediu contato · DDD de outro estado",
    criterio: "entrou por formulário/campanha, mas o DDD foi habilitado fora da praça",
    atendimento: true,
  },
  {
    chave: "lista_na_praca",
    rotulo: "Lista importada · telefone da praça",
    criterio: "entrou por importação em lote e o DDD é de um estado onde a empresa vende",
    atendimento: false,
  },
  {
    chave: "lista_fora_da_praca",
    rotulo: "Lista importada · DDD de outro estado",
    criterio: "entrou por importação em lote e o DDD foi habilitado fora da praça",
    atendimento: false,
  },
  {
    chave: "praca_nao_medida",
    rotulo: "Praça não medida (telefone ilegível)",
    criterio: "o telefone gravado não permite ler DDD — ausência de dado, não 'fora da praça'",
    atendimento: false,
  },
] as const;

export type ChaveDeFaixa = (typeof FAIXAS_DA_FILA)[number]["chave"];

/** As faixas que sobram quando o eixo geográfico colapsa (praça não medida). */
export const FAIXAS_SEM_PRACA = [
  {
    chave: "pediu",
    rotulo: "Pediu contato",
    criterio: "entrou por formulário/campanha",
    atendimento: true,
  },
  {
    chave: "lista",
    rotulo: "Lista importada",
    criterio: "entrou por importação em lote",
    atendimento: false,
  },
] as const;

export type ChaveDeFaixaSemPraca = (typeof FAIXAS_SEM_PRACA)[number]["chave"];

export const CHAVES_DE_FAIXA: readonly string[] = [
  ...FAIXAS_DA_FILA.map((faixa) => faixa.chave),
  ...FAIXAS_SEM_PRACA.map((faixa) => faixa.chave),
];

export function ehChaveDeFaixa(valor: unknown): valor is ChaveDeFaixa | ChaveDeFaixaSemPraca {
  return typeof valor === "string" && CHAVES_DE_FAIXA.includes(valor);
}

export type LeadNaTriagem = {
  id: string;
  /** Preenchido ⇒ a linha entrou por carga, não por pedido de contato. */
  importBatchId: string | null;
  phoneNormalized: string | null;
  createdAtMs: number | null;
  donoId: string | null;
  /**
   * O predicado da FILA é do chamador, de propósito: ele tem de ser o MESMO
   * `first_contacted_at IS NULL` que a central publica em `firstContactOverdue`
   * e que o filtro `attention=never_contacted` aplica. Duas definições de fila
   * seria a divergência que este módulo existe para evitar.
   */
  naFila: boolean;
};

/**
 * Em qual faixa o lead cai. `praca.medida === false` colapsa o eixo geográfico
 * e devolve só "pediu"/"lista" — nunca "todos fora".
 */
export function classificarNaFila(
  lead: Pick<LeadNaTriagem, "importBatchId" | "phoneNormalized">,
  praca: Praca,
): ChaveDeFaixa | ChaveDeFaixaSemPraca {
  const pediu = !lead.importBatchId;
  if (!praca.medida) return pediu ? "pediu" : "lista";
  const uf = ufDoDdd(dddDoTelefone(lead.phoneNormalized));
  if (!uf) return "praca_nao_medida";
  const naPraca = praca.ufs.includes(uf);
  if (pediu) return naPraca ? "pediu_na_praca" : "pediu_fora_da_praca";
  return naPraca ? "lista_na_praca" : "lista_fora_da_praca";
}

export type FaixaMedida = {
  chave: string;
  rotulo: string;
  criterio: string;
  atendimento: boolean;
  total: number;
  /** Quem carrega a faixa. É esta coluna que torna a má alocação óbvia. */
  donos: Array<{ id: string; total: number }>;
  /** Idade do lead mais antigo DENTRO da faixa, em dias. `null` = não medida. */
  idadeMaisAntigaDias: number | null;
  /**
   * Prova no registro (leitura, jamais escrita): quantos, dentro da faixa,
   * repetem o telefone de um lead mais ANTIGO ainda vivo. Medido hoje: 0 em
   * 442 — 447 telefones distintos para 447 leads vivos. A fila é gente de
   * verdade, e este zero é a resposta a "será que o denominador está inflado?".
   */
  telefoneRepetido: number;
};

export type ResultadoDaTriagem = {
  total: number;
  eixoGeografico: boolean;
  faixas: FaixaMedida[];
  /** Soma das faixas. Se divergir de `total`, é defeito — e o contrato pega. */
  somaDasFaixas: number;
};

/**
 * Decompõe a fila. Só conta: nenhum número sai daqui sem um lead por trás.
 *
 * `leads` recebe a carteira viva INTEIRA (não só a fila) porque a detecção de
 * telefone repetido precisa enxergar o sobrevivente mais antigo mesmo quando
 * ele já foi contatado.
 */
export function triarFila(
  leads: LeadNaTriagem[],
  praca: Praca,
  opcoes: { agoraMs: number },
): ResultadoDaTriagem {
  const catalogo = praca.medida ? FAIXAS_DA_FILA : FAIXAS_SEM_PRACA;
  const maisAntigoPorTelefone = new Map<string, number>();
  for (const lead of leads) {
    const telefone = lead.phoneNormalized;
    if (!telefone) continue;
    const nascimento = lead.createdAtMs;
    if (nascimento === null) continue;
    const atual = maisAntigoPorTelefone.get(telefone);
    if (atual === undefined || nascimento < atual) maisAntigoPorTelefone.set(telefone, nascimento);
  }

  const fila = leads.filter((lead) => lead.naFila);
  const faixas: FaixaMedida[] = catalogo.map((definicao) => {
    const dentro = fila.filter((lead) => classificarNaFila(lead, praca) === definicao.chave);
    const porDono = new Map<string, number>();
    for (const lead of dentro) {
      const dono = lead.donoId ?? "";
      porDono.set(dono, (porDono.get(dono) ?? 0) + 1);
    }
    const nascimentos = dentro.map((lead) => lead.createdAtMs).filter((valor): valor is number => valor !== null);
    return {
      chave: definicao.chave,
      rotulo: definicao.rotulo,
      criterio: definicao.criterio,
      atendimento: definicao.atendimento,
      total: dentro.length,
      donos: [...porDono.entries()]
        .map(([id, total]) => ({ id, total }))
        .sort((esquerda, direita) => direita.total - esquerda.total)
        .slice(0, 4),
      idadeMaisAntigaDias: nascimentos.length
        ? Math.max(0, Math.floor((opcoes.agoraMs - Math.min(...nascimentos)) / DIA_MS))
        : null,
      telefoneRepetido: dentro.filter((lead) => {
        const telefone = lead.phoneNormalized;
        if (!telefone || lead.createdAtMs === null) return false;
        const maisAntigo = maisAntigoPorTelefone.get(telefone);
        return maisAntigo !== undefined && maisAntigo < lead.createdAtMs;
      }).length,
    };
  });

  return {
    total: fila.length,
    eixoGeografico: praca.medida,
    faixas,
    somaDasFaixas: faixas.reduce((soma, faixa) => soma + faixa.total, 0),
  };
}

// ── O FRAGMENTO DE CONSULTA ────────────────────────────────────────────────
//
// O MESMO corte, expresso em PostgREST, para que o clique em "146" devolva 146
// e não "cerca de". Quando a faixa não é expressável, a resposta é `null` e a
// rota RECUSA (FAIXA_NAO_SUPORTADA) — filtro que devolve número errado é pior
// que filtro ausente, como este repositório já aprendeu com `project_id`.

/**
 * `like` com sublinhado casa UM caractere: `5511_________` é exatamente
 * "55, 11 e mais nove". Assim o comprimento entra no filtro do banco, e um
 * '971567739185' não vira DDD 97 nem no JS nem no SQL.
 */
function padroesDoDdd(ddd: string): string[] {
  return COMPRIMENTOS_CANONICOS.map((tamanho) => `phone_normalized.like.55${ddd}${"_".repeat(tamanho - 4)}`);
}

export type FragmentoDaFaixa = {
  /** `nulo` = pediu contato; `preenchido` = veio de importação em lote. */
  importBatch: "nulo" | "preenchido";
  /**
   * Expressão para `.or()`. `null` quando a faixa não restringe telefone
   * (eixo geográfico colapsado).
   */
  telefoneOr: string | null;
};

/**
 * Traduz a faixa para o vocabulário do PostgREST, ou `null` quando não dá.
 *
 * `praca_nao_medida` devolve `null` de propósito: ela é o COMPLEMENTO de
 * (comprimento canônico ∧ DDD do plano), e a negação de um grupo lógico não
 * sobrevive à tradução sem virar uma expressão que eu não conseguiria provar
 * idêntica ao JS. Preferimos recusar a listar 2 leads com um filtro que talvez
 * devolva outra coisa.
 */
/**
 * TAMANHO: com praça = SP, "na praça" gera 18 termos (638 bytes) e "fora da
 * praça" gera 116 (4,1 KB; 4,3 KB depois de codificar a URL). Medido e
 * executado contra a base viva. Se a praça crescer a ponto de a URL passar de
 * ~7 KB, o caminho é o servidor recusar a faixa — nunca truncar a lista de
 * DDDs, que devolveria silenciosamente um número menor.
 */
export function fragmentoDaFaixa(chave: string, praca: Praca): FragmentoDaFaixa | null {
  if (!praca.medida) {
    if (chave === "pediu") return { importBatch: "nulo", telefoneOr: null };
    if (chave === "lista") return { importBatch: "preenchido", telefoneOr: null };
    return null;
  }
  const dddsDaPraca = Object.keys(UF_POR_DDD).filter((ddd) => praca.ufs.includes(UF_POR_DDD[ddd]!)).sort();
  const dddsDeFora = Object.keys(UF_POR_DDD).filter((ddd) => !praca.ufs.includes(UF_POR_DDD[ddd]!)).sort();
  const juntar = (ddds: string[]) => ddds.flatMap(padroesDoDdd).join(",");
  if (chave === "pediu_na_praca") return { importBatch: "nulo", telefoneOr: juntar(dddsDaPraca) };
  if (chave === "pediu_fora_da_praca") return { importBatch: "nulo", telefoneOr: juntar(dddsDeFora) };
  if (chave === "lista_na_praca") return { importBatch: "preenchido", telefoneOr: juntar(dddsDaPraca) };
  if (chave === "lista_fora_da_praca") return { importBatch: "preenchido", telefoneOr: juntar(dddsDeFora) };
  return null;
}

// ── A CONSEQUÊNCIA DITA ────────────────────────────────────────────────────
//
// A metade que ninguém mediu é o RITMO. A organização tem 4 tarefas e 5
// contatos na vida inteira, e o simulador de capacidade recusa projetar por
// falta de base (mínimo de 3 atores; há 2 corretores com carteira). Então o
// ritmo é DECLARADO pelo diretor, datado, rotulado como premissa dele, e some
// em um clique. Sem declaração a resposta é literalmente "sem prazo" — que é
// uma resposta melhor do que uma data inventada.

/** Depois de quantos dias a premissa precisa ser reconfirmada. */
export const DIAS_ATE_RECONFIRMAR_RITMO = 14;

/**
 * Avança `dias` DIAS ÚTEIS a partir de `agoraMs`.
 *
 * Reusa `diaDaSemanaEmSaoPaulo` de `lib/crm/next-action.ts` em vez de redefinir
 * "dia útil" aqui. Duas definições de fim de semana no mesmo produto é a classe
 * de bug [[caminhos-divergentes]], e ela não precisa de banco para acontecer.
 *
 * Feriado e férias NÃO entram: não existe calendário gravado nesta base. O
 * prazo é por isso OTIMISTA, e a tela diz isso por extenso.
 */
export function avancarDiasUteis(agoraMs: number, dias: number): number {
  if (!Number.isFinite(agoraMs) || !Number.isFinite(dias) || dias <= 0) return agoraMs;
  let quando = agoraMs;
  let restantes = Math.ceil(dias);
  let guarda = 0;
  while (restantes > 0 && guarda < 10_000) {
    quando += DIA_MS;
    guarda += 1;
    const diaDaSemana = diaDaSemanaEmSaoPaulo(new Date(quando));
    if (diaDaSemana !== 0 && diaDaSemana !== 6) restantes -= 1;
  }
  return quando;
}

export type PrazoDaFaixa = {
  /** Dias úteis para percorrer a faixa, já contando a espera das faixas acima. */
  diasUteis: number;
  /** Dias úteis que a faixa passa esperando antes de começar. */
  diasUteisAteComecar: number;
  /** Quando a ÚLTIMA primeira ligação da faixa acontece, em ms. */
  terminaEmMs: number;
  /** Nunca fala de receita nem de conversão. A unidade é sempre esta. */
  unidade: "primeira ligação";
};

/**
 * Aritmética honesta: fila ÷ (corretores × ritmo), em dias úteis, arredondando
 * SEMPRE para cima.
 *
 * Devolve `null` quando falta insumo — corretor zero, ritmo não declarado ou
 * faixa vazia. `null` é "sem prazo", e "sem prazo" é estado de primeira classe.
 */
export function prazoDaFaixa(input: {
  tamanhoDaFaixa: number;
  acumuladoAntes: number;
  corretores: number;
  ritmoPorCorretorPorDiaUtil: number | null;
  agoraMs: number;
}): PrazoDaFaixa | null {
  const { tamanhoDaFaixa, acumuladoAntes, corretores, ritmoPorCorretorPorDiaUtil, agoraMs } = input;
  if (ritmoPorCorretorPorDiaUtil === null) return null;
  if (!Number.isFinite(ritmoPorCorretorPorDiaUtil) || ritmoPorCorretorPorDiaUtil <= 0) return null;
  if (!Number.isFinite(corretores) || corretores <= 0) return null;
  if (tamanhoDaFaixa <= 0) return null;
  const porDiaUtil = corretores * ritmoPorCorretorPorDiaUtil;
  const diasUteisAteComecar = Math.ceil(acumuladoAntes / porDiaUtil);
  const diasUteis = Math.ceil((acumuladoAntes + tamanhoDaFaixa) / porDiaUtil);
  return {
    diasUteis,
    diasUteisAteComecar,
    terminaEmMs: avancarDiasUteis(agoraMs, diasUteis),
    unidade: "primeira ligação",
  };
}

/**
 * A linha INVERTIDA, que é onde a decisão nasce: para zerar a faixa em N dias
 * úteis, quantas primeiras ligações por corretor por dia seriam necessárias?
 *
 * É ela que torna numérico o confronto "dobrar o ritmo de quem já está aqui"
 * contra "contratar" — sem que o diretor faça conta, e sem nenhum botão de
 * contratar por perto.
 */
export function ritmoNecessarioPara(input: {
  tamanhoDaFaixa: number;
  acumuladoAntes: number;
  corretores: number;
  diasUteis: number;
}): number | null {
  const { tamanhoDaFaixa, acumuladoAntes, corretores, diasUteis } = input;
  if (!Number.isFinite(corretores) || corretores <= 0) return null;
  if (!Number.isFinite(diasUteis) || diasUteis <= 0) return null;
  if (tamanhoDaFaixa <= 0) return null;
  return Math.ceil((acumuladoAntes + tamanhoDaFaixa) / (corretores * diasUteis));
}

/**
 * A premissa envelhece à vista. Passados 14 dias da declaração, o prazo volta a
 * exigir confirmação antes de valer — porque número digitado uma vez e
 * persistido vira "medição" na cabeça de quem lê duas semanas depois, e alguém
 * acaba defendendo contratação com ele.
 */
export function premissaPrecisaReconfirmar(declaradaEmMs: number | null, agoraMs: number): boolean {
  if (declaradaEmMs === null || !Number.isFinite(declaradaEmMs)) return true;
  return agoraMs - declaradaEmMs >= DIAS_ATE_RECONFIRMAR_RITMO * DIA_MS;
}
