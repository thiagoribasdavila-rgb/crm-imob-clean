/**
 * PREVISÃO ARITMÉTICA — o que dá para prever hoje, com rótulo.
 *
 * ── Por que este arquivo existe separado ────────────────────────────────────
 *
 * O dono pediu nove modelos. Sete deles precisam de desfecho comercial apurado,
 * e o banco canônico tinha, em 2026-07-30, UM desfecho de ganho, ZERO de perda e
 * ZERO venda com valor. Sem baseline não há modelo.
 *
 * Dois dos nove NÃO são modelo nenhum: são divisão. Carga da equipe é contagem
 * por corretor. Tempo até esgotar a fila é fila ÷ vazão. Ambos são conferíveis
 * no papel, não têm peso escondido, não têm nada para treinar e não podem
 * apodrecer por drift — a conta é a mesma amanhã.
 *
 * Estão aqui, e não junto do preditor, exatamente para que ninguém os apresente
 * como "previsão da IA". O campo `natureza: "aritmetica"` viaja no resultado
 * para a tela poder rotular, e `verificavelAMao` diz que existe uma conta a
 * refazer. Misturar as duas famílias foi historicamente o caminho pelo qual uma
 * divisão ganhou aparência de inferência.
 *
 * Puro: sem I/O, sem relógio, sem token. Custo R$ 0.
 *
 * ── SOBREPOSIÇÃO CONSOLIDADA (2026-07-30) ───────────────────────────────────
 *
 * `gargalosDaOperacao` em `lib/atlas/gemeo-digital.ts` (frente irmã, mesma
 * noite) media concentração de carteira por outro caminho: "fatia da maior
 * carteira > 1 ÷ corretores". As duas contas foram unificadas AQUI — o gêmeo
 * agora consome `cargaDaEquipePorContagem` e não tem mais desigualdade própria.
 *
 * A revisão que precedeu a fusão achou que as duas contas NÃO concordavam
 * inteiramente. Elas são a mesma desigualdade em álgebra, mas não em ponto
 * flutuante: o gêmeo comparava valores CRUS, e este módulo derivava a razão de
 * uma `cargaMedia` já arredondada em duas casas. Com [334, 333, 333] o gêmeo
 * acusava concentração e a `concentracao` daqui saía exatamente 1,00 — a
 * divergência de borda já existia antes de qualquer correção divergir. Por isso
 * o veredito agora é `concentrada`, decidido por multiplicação cruzada em
 * inteiros (ver `medirCarga`), e `concentracao` ficou sendo o que sempre foi de
 * fato: um número de EXIBIÇÃO.
 *
 * É exatamente esta a forma dos defeitos que este repositório já pagou:
 * `move.moveId` vs `move.id`, `developments` vs `crm_projects`,
 * `pipeline_history` vs `pipeline_stage_moves` — duas definições que nasceram
 * iguais e divergiram numa correção que só chegou a uma delas.
 *
 * ── E A RÉGUA, QUE ERA A OUTRA METADE DO PROBLEMA ───────────────────────────
 *
 * Unificar as funções sem unificar a régua trocaria uma divergência por outra.
 * Existem duas noções de "lead aberto" nesta base e elas DIVERGEM de verdade
 * (ver `ReguaDeAberto`). Esta função não filtra — quem filtra é o chamador — mas
 * agora ela EXIGE que a régua seja declarada e a faz viajar no resultado e na
 * fórmula. Número de carteira sem régua ao lado é a mesma classe de defeito, só
 * que com um nome de função a menos para culpar.
 */

/** Rótulo obrigatório de toda saída deste arquivo. */
export type RotuloAritmetico = {
  natureza: "aritmetica";
  /** Sempre true: a fórmula acompanha o resultado para conferência. */
  verificavelAMao: true;
  formula: string;
};

export type CargaDeCorretor = {
  corretorId: string;
  leads: number;
};

/**
 * QUAL RÉGUA DE "LEAD ABERTO" PRODUZIU A CONTAGEM.
 *
 * Existem duas nesta base e elas DIVERGEM em dado real, não em teoria. Medido em
 * 2026-07-30 na organização viva: a carteira de `ddcorretorsp` tem 112 leads
 * abertos pela régua da RPC e 110 pela régua da listagem. A diferença são os
 * dois leads em `comprou_outro`, que a listagem trata como terminal e a RPC
 * `redistribute_absent_broker_leads` não — ela move essas leads.
 *
 * Este módulo NÃO filtra: quem decide o que é lead aberto é o chamador, que é o
 * único que tem os status na mão. O que o módulo faz é EXIGIR que a régua venha
 * declarada e carregá-la no resultado, para que dois números de carteira nunca
 * mais possam ser comparados sem que a diferença de régua apareça primeiro.
 *
 * Foi essa a lição de consolidar as duas funções de concentração: unificar a
 * conta sem unificar (ou declarar) a régua só trocaria uma divergência por outra.
 */
export type ReguaDeAberto = "rpc_redistribuicao" | "listagem_de_leads";

/** O que cada régua conta, por extenso — viaja na `formula` de toda saída. */
export const REGUAS_DE_ABERTO: Readonly<Record<ReguaDeAberto, string>> = {
  rpc_redistribuicao:
    "régua da RPC redistribute_absent_broker_leads, em que `comprou_outro` conta como ABERTO porque a função move essa lead",
  listagem_de_leads:
    "régua da listagem de leads, em que `comprou_outro` é terminal e NÃO conta como aberto",
};

export type CargaDaEquipe = RotuloAritmetico & {
  /**
   * A régua que produziu as contagens, ecoada como recebida. Sem ela o número
   * não é comparável com nenhum outro número de carteira desta base.
   */
  regua: ReguaDeAberto;
  /** `false` quando não há carteira nenhuma para contar — e aí nada é afirmado. */
  calculavel: boolean;
  /** Motivo por extenso quando `calculavel` é false. */
  motivo: string | null;
  totalDeLeads: number;
  corretores: number;
  /** Corretores COM carteira. */
  comCarteira: number;
  /** Corretores ativos SEM lead nenhum. Nove deles, na medição de 2026-07-30. */
  semCarteira: string[];
  cargaMedia: number | null;
  cargaMaxima: number | null;
  /**
   * maior carga ÷ carga média, ARREDONDADO em duas casas. 1 = perfeitamente
   * distribuído. `null` quando não calculável. Não é "risco de burnout" nem nota
   * de desempenho: é uma razão, e é um número de EXIBIÇÃO.
   *
   * ⚠ NÃO derive o veredito daqui: use `concentrada`. Com [334, 333, 333] esta
   * razão sai 1,00 por arredondamento enquanto a carteira está de fato acima da
   * média. Foi exatamente essa borda que separava as duas contas antes da fusão.
   */
  concentracao: number | null;
  /**
   * O VEREDITO — a maior carteira está acima do rateio uniforme?
   *
   * É a UMA definição de "concentração de carteira" desta base. `gargalosDaOperacao`
   * no gêmeo digital lê este campo em vez de refazer a desigualdade.
   */
  concentrada: boolean;
  ranking: CargaDeCorretor[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const formulaDaCarga = (regua: ReguaDeAberto) =>
  `carga(corretor) = leads com assigned_to = corretor, contados pela ${REGUAS_DE_ABERTO[regua]}; ` +
  "concentração = maior carga ÷ carga média; concentrada quando maior carga × corretores > total de leads";

const FORMULA_SEM_REGUA =
  "sem régua de 'lead aberto' declarada não há fórmula: a mesma carteira vale 112 ou 110 conforme a régua";

/**
 * O núcleo — uma conta, dois portões de entrada.
 *
 * `cargaDaEquipe` entra com uma lead por item; `cargaDaEquipePorContagem` entra
 * com a carteira já somada, que é o que o gêmeo digital tem na mão. As duas
 * descem para cá de propósito: dois caminhos até a mesma resposta são dois
 * lugares para uma correção chegar só a um.
 */
function medirCarga(
  contagem: ReadonlyMap<string, number>,
  totalDeLeads: number,
  corretoresAtivos: readonly string[],
  regua: ReguaDeAberto,
): CargaDaEquipe {
  const reguaDeclarada = Object.prototype.hasOwnProperty.call(REGUAS_DE_ABERTO, String(regua));
  const base: RotuloAritmetico = {
    natureza: "aritmetica",
    verificavelAMao: true,
    formula: reguaDeclarada ? formulaDaCarga(regua) : FORMULA_SEM_REGUA,
  };

  const idsConhecidos = new Set<string>([...corretoresAtivos.map((id) => String(id || "").trim())]);
  idsConhecidos.delete("");
  for (const id of contagem.keys()) idsConhecidos.add(id);

  const ranking: CargaDeCorretor[] = [...idsConhecidos]
    .map((corretorId) => ({ corretorId, leads: contagem.get(corretorId) ?? 0 }))
    .sort((a, b) => b.leads - a.leads || a.corretorId.localeCompare(b.corretorId));

  const semCarteira = ranking.filter((r) => r.leads === 0).map((r) => r.corretorId);
  const comCarteira = ranking.length - semCarteira.length;

  const recusa = (motivo: string): CargaDaEquipe => ({
    ...base,
    regua,
    calculavel: false,
    motivo,
    totalDeLeads,
    corretores: ranking.length,
    comCarteira,
    semCarteira,
    cargaMedia: null,
    cargaMaxima: null,
    concentracao: null,
    concentrada: false,
    ranking,
  });

  // Régua ausente é erro de programação, não condição de dado — mas a resposta é
  // a mesma do resto do módulo (recusa com motivo) e não uma exceção: esta conta
  // alimenta um painel, e derrubar o painel inteiro por causa de um rótulo
  // trocaria um número sem régua por uma tela em branco.
  if (!reguaDeclarada) {
    return recusa(
      `régua de "lead aberto" não declarada (recebido: ${JSON.stringify(regua)}). ` +
        `A mesma carteira vale 112 pela régua da RPC e 110 pela régua da listagem — ` +
        `sem saber qual foi usada, a contagem não é comparável com nenhuma outra.`,
    );
  }
  if (!ranking.length) return recusa("nenhum corretor informado — não há sobre quem contar");
  if (totalDeLeads === 0) return recusa("nenhuma lead atribuída — a carteira inteira está vazia");

  // A média divide pelos corretores CONHECIDOS, incluindo os de carteira vazia.
  // Dividir só pelos que têm lead esconderia a má distribuição: com 468 leads em
  // 3 de 12 corretores, a média "por quem tem" daria 156 e pareceria saudável,
  // enquanto a média real da equipe é 39.
  const cargaMedia = r2(totalDeLeads / ranking.length);
  const cargaMaxima = ranking[0].leads;
  const concentracao = cargaMedia > 0 ? r2(cargaMaxima / cargaMedia) : null;

  /**
   * O veredito, por multiplicação CRUZADA e não por divisão.
   *
   * `maiorCarga ÷ média > 1` e `fatia > 1 ÷ corretores` são a mesma desigualdade
   * na álgebra; em ponto flutuante não são. Multiplicar em vez de dividir mantém
   * a comparação em inteiros, onde ela é exata: [334, 333, 333] dá 1002 > 1000 —
   * concentrada — enquanto `concentracao` arredonda para 1,00 e diria que não.
   * Essa borda era a divergência REAL entre as duas contas que este arquivo
   * consolidou; decidir pelo número de exibição a traria de volta.
   */
  const concentrada = cargaMaxima * ranking.length > totalDeLeads;

  return {
    ...base,
    regua,
    calculavel: true,
    motivo: null,
    totalDeLeads,
    corretores: ranking.length,
    comCarteira,
    semCarteira,
    cargaMedia,
    cargaMaxima,
    concentracao,
    concentrada,
    ranking,
  };
}

/**
 * Conta a carteira de cada corretor e mede a concentração, a partir das leads.
 *
 * `corretoresAtivos` entra separado da distribuição porque o corretor com
 * carteira VAZIA não aparece em `leads.assigned_to` — e ele é justamente o caso
 * que interessa ver. Derivar a lista de corretores só das leads esconderia
 * exatamente quem não recebeu nada, que é o problema medido nesta base.
 *
 * `regua` é obrigatória e não tem padrão. Um padrão viraria a régua invisível de
 * quem não a informou, que é o defeito com outro nome.
 */
export function cargaDaEquipe(
  atribuicoes: readonly { assignedTo: string | null }[],
  corretoresAtivos: readonly string[],
  regua: ReguaDeAberto,
): CargaDaEquipe {
  const contagem = new Map<string, number>();
  let totalDeLeads = 0;
  for (const item of atribuicoes) {
    const id = String(item?.assignedTo || "").trim();
    if (!id) continue;
    contagem.set(id, (contagem.get(id) ?? 0) + 1);
    totalDeLeads += 1;
  }
  return medirCarga(contagem, totalDeLeads, corretoresAtivos, regua);
}

/**
 * A mesma conta, para quem já tem a carteira SOMADA.
 *
 * Existe para o gêmeo digital, que mede `CarteiraObservada.abertos` por corretor
 * ao ler o banco e não guarda a lista de leads. Sem esta porta ele teria de
 * reexpandir 385 contagens em 385 objetos só para o núcleo recontar — ou, o que
 * de fato aconteceu antes, manter a própria desigualdade.
 *
 * Contagem zero registra o corretor com carteira vazia, que é o caso que o
 * relatório existe para encontrar.
 */
export function cargaDaEquipePorContagem(
  contagens: readonly { corretorId: string; leads: number }[],
  corretoresAtivos: readonly string[],
  regua: ReguaDeAberto,
): CargaDaEquipe {
  const contagem = new Map<string, number>();
  let totalDeLeads = 0;
  for (const item of contagens) {
    const id = String(item?.corretorId || "").trim();
    if (!id) continue;
    const leads = finito(item?.leads) && item.leads > 0 ? Math.floor(item.leads) : 0;
    contagem.set(id, (contagem.get(id) ?? 0) + leads);
    totalDeLeads += leads;
  }
  return medirCarga(contagem, totalDeLeads, corretoresAtivos, regua);
}

export type TempoAteEsgotarFila = RotuloAritmetico & {
  /** `false` quando a vazão medida é zero — e aí NÃO se devolve infinito. */
  calculavel: boolean;
  motivo: string | null;
  fila: number;
  /** Movimentações observadas na janela. */
  movimentacoesNaJanela: number;
  janelaEmSemanas: number;
  /** Movimentações por semana, medidas. */
  vazaoSemanal: number | null;
  semanasParaEsgotar: number | null;
};

const FORMULA_FILA = "semanas = fila ÷ (movimentações na janela ÷ semanas da janela)";

/**
 * Quantas semanas a fila atual leva para ser atendida no ritmo observado.
 *
 * Vazão zero devolve `calculavel: false`, não `Infinity` e não um número grande.
 * Isso é deliberado: `Infinity` serializa como `null` em JSON e a tela mostraria
 * um campo vazio sem explicação; um número grande seria lido como estimativa. A
 * resposta honesta é "não previsível — nenhuma movimentação na janela".
 *
 * A janela entra como argumento em semanas porque a conversão de dias para
 * semanas é onde mora o erro fácil: 28 dias são 4 semanas, e quem divide por
 * 7 dentro E fora da função conta duas vezes.
 */
export function tempoAteEsgotarFila(
  fila: number,
  movimentacoesNaJanela: number,
  janelaEmSemanas: number,
): TempoAteEsgotarFila {
  const base: RotuloAritmetico = {
    natureza: "aritmetica",
    verificavelAMao: true,
    formula: FORMULA_FILA,
  };
  const filaSegura = finito(fila) && fila >= 0 ? Math.floor(fila) : 0;
  const movimentos = finito(movimentacoesNaJanela) && movimentacoesNaJanela >= 0
    ? movimentacoesNaJanela
    : 0;
  const semanasDaJanela = finito(janelaEmSemanas) && janelaEmSemanas > 0 ? janelaEmSemanas : 0;

  if (semanasDaJanela === 0) {
    return {
      ...base,
      calculavel: false,
      motivo: "janela inválida — sem período não existe vazão",
      fila: filaSegura,
      movimentacoesNaJanela: movimentos,
      janelaEmSemanas: 0,
      vazaoSemanal: null,
      semanasParaEsgotar: null,
    };
  }
  const vazaoSemanal = r2(movimentos / semanasDaJanela);
  if (vazaoSemanal <= 0) {
    return {
      ...base,
      calculavel: false,
      motivo: "não previsível — nenhuma movimentação observada na janela",
      fila: filaSegura,
      movimentacoesNaJanela: movimentos,
      janelaEmSemanas: semanasDaJanela,
      vazaoSemanal: 0,
      semanasParaEsgotar: null,
    };
  }
  return {
    ...base,
    calculavel: true,
    motivo: null,
    fila: filaSegura,
    movimentacoesNaJanela: movimentos,
    janelaEmSemanas: semanasDaJanela,
    vazaoSemanal,
    semanasParaEsgotar: r2(filaSegura / vazaoSemanal),
  };
}
