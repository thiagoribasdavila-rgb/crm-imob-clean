/**
 * GRAFO DE OPORTUNIDADE DE RECEITA — o JUIZ, num lugar só.
 *
 * ── O QUE ESTE ARQUIVO É, E O QUE ELE NÃO É ─────────────────────────────────
 *
 * O grafo em si mora no PostgreSQL, como o dono pediu: views e funções sobre as
 * tabelas que JÁ existem, sem uma segunda cópia dos dados e sem banco de grafos.
 * Ver `supabase/migrations/20260730100000_grafo_de_oportunidade_de_receita.sql`.
 *
 * Este módulo é a outra metade, e tem uma regra só:
 *
 *   **O BANCO MEDE. ESTE ARQUIVO JULGA.**
 *
 * Nenhuma função SQL do grafo devolve `suficiente boolean`. Todas devolvem o
 * NUMERADOR junto com o DENOMINADOR (`desfechos_na_base`, `grupos_comparaveis`,
 * `leads_na_base`), e quem decide se aquilo dá para acreditar é
 * `avaliarProntidao` aqui embaixo — uma vez, para todo mundo.
 *
 * Por que assim: "duas cópias da mesma regra" é a classe de defeito que mais
 * apareceu neste repositório (`move.moveId` vs `move.id`, `pipeline_history` vs
 * `pipeline_stage_moves`, `developments` vs `crm_projects`, o recorte do Kanban
 * vs o da listagem). Um limiar de suficiência escrito em SQL E em TypeScript
 * seria a próxima. Aqui ele existe uma vez.
 *
 * ── A FRONTEIRA COM `compatibilidade-imovel.ts`, PARA NÃO NASCER A TERCEIRA ──
 *
 * `lib/crm/compatibilidade-imovel.ts` já responde "este CLIENTE combina com
 * este IMÓVEL?" por ATRIBUTO DECLARADO (preço, dormitório, bairro, metragem),
 * com 14 critérios e peso. Este módulo NÃO reimplementa nada disso e não tem
 * peso de critério nenhum.
 *
 * A divisão é por natureza da pergunta, não por gosto:
 *
 *   · atributo declarado (cliente × imóvel, um par por vez) ... compatibilidade-imovel.ts
 *   · aresta (quem se ligou a quem, e o que aconteceu depois) ... o grafo, em SQL
 *
 * E a medição mostra por que as duas precisam existir: por ATRIBUTO DECLARADO o
 * alcance é 13 de 482 leads (2,7%); pela ARESTA `leads.development_id` é 192 de
 * 482 (39,8%). São 14,8× mais clientes alcançados — por interesse REVELADO, que
 * é um dado mais fraco que o declarado e por isso viaja sempre rotulado como
 * proxy (`base_da_evidencia`), nunca como preferência confirmada.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * OS LIMIARES — escolha de engenharia DECLARADA, não métrica comercial medida
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Quantos desfechos rotulados um grupo precisa ter para ser RANQUEADO.
 *
 * Este número não foi calibrado contra histórico de venda — não existe histórico
 * para calibrar, e é exatamente isso que a frente tem de dizer em voz alta. Ele é
 * o piso abaixo do qual ranquear é encenação: com 2 desfechos, o "melhor" do
 * ranking muda de nome ao chegar o terceiro.
 *
 * Medido no banco canônico em 2026-07-30: a organização viva tem 88 desfechos
 * rotulados, dos quais 84 `lost`, 2 `won` e 2 `external_purchase` — e os 88
 * pendurados em 2 corretores. Nenhum grupo comparável alcança este piso com
 * VITÓRIAS, e por isso "corretor mais adequado" reprova.
 */
export const MINIMO_DESFECHOS_PARA_RANQUEAR = 10;

/**
 * Quantos grupos comparáveis a pergunta precisa ter.
 *
 * "Qual campanha performa melhor" com UMA campanha não é uma pergunta difícil,
 * é uma pergunta vazia — e a resposta ("esta") pareceria um insight. Medido:
 * `lead_attribution_touches` tem 1 `campaign_id` distinto, e 87 dos 88 desfechos
 * rotulados vêm de uma única fonte (`meta_ads`). Não há segundo grupo.
 */
export const MINIMO_GRUPOS_PARA_COMPARAR = 2;

/**
 * Cobertura mínima de um atributo declarado para ele servir de chave de leitura.
 *
 * 30% é o ponto em que a resposta deixa de ser sobre a operação e passa a ser
 * sobre a minoria que preencheu o campo. Abaixo disso, responder pela chave
 * declarada produz uma lista curta que PARECE completa — o defeito de
 * "o recorte que esvazia a lista", que já aconteceu neste repositório.
 */
export const MINIMO_COBERTURA_DECLARADA = 0.3;

/**
 * Quantas leads um empreendimento precisa concentrar para servir de vizinhança.
 *
 * Semelhança por aresta compartilhada precisa que a aresta seja compartilhada:
 * empreendimento com 1 lead não tem "lead semelhante" nenhuma dentro dele.
 */
export const MINIMO_LEADS_PARA_VIZINHANCA = 2;

/* ────────────────────────────────────────────────────────────────────────────
 * AS 7 PERGUNTAS DO DONO — nas palavras dele, com a aresta que cada uma exige
 * ──────────────────────────────────────────────────────────────────────────── */

export type ChaveDaPergunta =
  | "clientes_para_estoque_novo"
  | "imoveis_substitutos"
  | "leads_semelhantes"
  | "corretor_mais_adequado"
  | "campanha_por_perfil"
  | "oportunidades_de_recuperacao"
  | "demanda_x_oferta";

/**
 * `exige` é a linguagem do teste, não prosa: cada pergunta declara QUAL medida
 * do censo precisa passar de QUAL limiar. É o que permite `avaliarProntidao` ser
 * uma função pura e o contrato provar os dois lados sem banco.
 */
export type ExigenciaDaPergunta =
  | { tipo: "cobertura"; medida: string; minimo: number }
  | { tipo: "desfechos"; medida: string; minimo: number }
  | { tipo: "grupos"; medida: string; minimo: number }
  | { tipo: "arestas"; medida: string; minimo: number };

export const PERGUNTAS_DO_DONO: ReadonlyArray<{
  chave: ChaveDaPergunta;
  /** As palavras do dono, sem tradução para jargão. */
  pergunta: string;
  /** A função SQL que responde. `null` = não existe função porque não há aresta. */
  funcao: string | null;
  /** TODAS têm de passar. Uma reprovada reprova a pergunta. */
  exige: ReadonlyArray<ExigenciaDaPergunta>;
  /** O dado a coletar primeiro se reprovar — a recomendação, não um lamento. */
  coletar: string;
}> = [
  {
    chave: "clientes_para_estoque_novo",
    pergunta: "encontrar clientes compatíveis com novo estoque",
    funcao: "grafo_clientes_para_empreendimento",
    // `pares_de_oferta_comparaveis >= 1` é a exigência que faz esta pergunta ser
    // sobre estoque NOVO. Estoque novo não tem lead pendurada nele ainda — a
    // única forma de achar candidato é transferir interesse de um empreendimento
    // COMPARÁVEL. Sem par comparável não há de onde transferir, e a função cai no
    // recorte `mesma_cidade`, que em São Paulo não é compatibilidade.
    exige: [
      { tipo: "cobertura", medida: "lead_interesse_revelado", minimo: MINIMO_COBERTURA_DECLARADA },
      { tipo: "grupos", medida: "pares_de_oferta_comparaveis", minimo: 1 },
    ],
    coletar:
      "preco do empreendimento (0 de 4 tem price_min/price_max) e bairro comparavel: os 3 empreendimentos com bairro estao em 3 bairros DIFERENTES, entao ha ZERO pares comparaveis e nada de onde transferir interesse para um lancamento",
  },
  {
    chave: "imoveis_substitutos",
    pergunta: "imóveis substitutos",
    funcao: "grafo_empreendimentos_substitutos",
    exige: [
      { tipo: "grupos", medida: "pares_de_oferta_comparaveis", minimo: MINIMO_GRUPOS_PARA_COMPARAR },
      { tipo: "arestas", medida: "leads_com_co_interesse", minimo: MINIMO_LEADS_PARA_VIZINHANCA },
    ],
    coletar:
      "preco e bairro do acervo: 0 de 4 empreendimentos tem preco, e os 3 com bairro estao em 3 bairros DIFERENTES — zero pares comparaveis por bairro",
  },
  {
    chave: "leads_semelhantes",
    pergunta: "leads semelhantes",
    funcao: "grafo_leads_semelhantes",
    exige: [{ tipo: "cobertura", medida: "lead_interesse_revelado", minimo: MINIMO_COBERTURA_DECLARADA }],
    coletar:
      "nada bloqueia: 192 leads penduradas em empreendimento e 8 fontes distintas ja formam vizinhanca por aresta compartilhada",
  },
  {
    chave: "corretor_mais_adequado",
    pergunta: "corretor mais adequado",
    funcao: "grafo_aptidao_do_corretor",
    // ⚠ O SEGUNDO maior, não o maior. Esta exigência começou como
    // `desfechos_por_corretor_maximo >= 10` e PASSOU com 87 — só que os 87 são de
    // UM corretor e o outro tem 1. Um grupo com base e outro sem não é
    // comparação, é um número sozinho com vizinho decorativo. O 2º maior é a
    // estatística que cobra base nos DOIS lados do ranking.
    //
    // E `ganhos_rotulados` exige 10, não 2: "melhor desempenho" quer dizer
    // VENDER, e 2 vitórias na base inteira não calibram taxa de conversão de
    // ninguém. A versão anterior pedia 2 e passava — pediria o que já existe.
    exige: [
      { tipo: "desfechos", medida: "desfechos_por_corretor_2o_maior", minimo: MINIMO_DESFECHOS_PARA_RANQUEAR },
      { tipo: "grupos", medida: "corretores_com_desfecho", minimo: MINIMO_GRUPOS_PARA_COMPARAR },
      { tipo: "desfechos", medida: "ganhos_rotulados", minimo: MINIMO_DESFECHOS_PARA_RANQUEAR },
    ],
    coletar:
      "desfecho rotulado no SEGUNDO corretor (o 1o tem 87, o 2o tem 1) e vitorias: ha 2 ganhos rotulados na base inteira. Ranquear aptidao com 2 vitorias e sorteio com cara de metrica",
  },
  {
    chave: "campanha_por_perfil",
    pergunta: "campanha com melhor desempenho por perfil",
    funcao: "grafo_desempenho_de_campanha",
    // Medido, e é a nuance mais interessante da frente: no eixo CAMPANHA o 2º
    // maior é 12 (Meta Ads 75, uma campanha por FK 12, Indicação 1) — ou seja há
    // base para comparar PERDA entre duas campanhas. O que falta é VITÓRIA: 2 na
    // base inteira, ambas na mesma campanha. "Melhor desempenho" quer dizer
    // vender, então a pergunta reprova por `ganhos_rotulados`, não por base.
    exige: [
      { tipo: "desfechos", medida: "desfechos_por_campanha_2o_maior", minimo: MINIMO_DESFECHOS_PARA_RANQUEAR },
      { tipo: "grupos", medida: "campanhas_com_desfecho", minimo: MINIMO_GRUPOS_PARA_COMPARAR },
      { tipo: "desfechos", medida: "ganhos_rotulados", minimo: MINIMO_DESFECHOS_PARA_RANQUEAR },
    ],
    coletar:
      "vitoria rotulada por campanha: ha base para comparar PERDA (2a campanha com 12 desfechos) mas 2 ganhos na base inteira, os dois na mesma campanha. Falta tambem campaign_id, que cobre 24 leads de 482 contra 212 do texto livre",
  },
  {
    chave: "oportunidades_de_recuperacao",
    pergunta: "oportunidades de recuperação",
    funcao: "grafo_oportunidades_de_recuperacao",
    exige: [{ tipo: "arestas", medida: "leads_recuperaveis", minimo: MINIMO_LEADS_PARA_VIZINHANCA }],
    coletar:
      "nada bloqueia a LISTA: 91 leads perdidas e 473 sem primeiro contato. O que falta e o consentimento por lead — lead_contact_preferences tem 0 linhas, e a base legal hoje vem da FONTE, nao da pessoa",
  },
  {
    chave: "demanda_x_oferta",
    pergunta: "relações entre demanda e oferta",
    funcao: "grafo_demanda_x_oferta",
    exige: [
      { tipo: "cobertura", medida: "lead_bairro_declarado", minimo: MINIMO_COBERTURA_DECLARADA },
      { tipo: "arestas", medida: "unidades_no_acervo", minimo: MINIMO_LEADS_PARA_VIZINHANCA },
    ],
    coletar:
      "bairro desejado da lead (6 de 482) e estoque unitario: units, inventory_units e properties tem 0 linhas, e units_available e nulo nas 6 tipologias — nao existe OFERTA contavel para confrontar com demanda",
  },
];

/** Índice por chave, para quem tem a chave na mão e precisa da definição. */
export const POR_CHAVE = new Map(PERGUNTAS_DO_DONO.map((p) => [p.chave, p]));

/* ────────────────────────────────────────────────────────────────────────────
 * O JUIZ
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * O que o banco mede. As chaves são os nomes das medidas em `exige.medida`, e é
 * `public.grafo_censo_de_prontidao()` quem as produz — este tipo é o contrato
 * entre os dois lados.
 */
export type MedicaoDoCenso = Readonly<Record<string, number>>;

export type VeredictoDaPergunta = {
  chave: ChaveDaPergunta;
  pergunta: string;
  funcao: string | null;
  suficiente: boolean;
  /** Toda exigência com o valor MEDIDO ao lado — o denominador nunca fica de fora. */
  exigencias: Array<{ medida: string; minimo: number; medido: number | null; passou: boolean }>;
  /** Vazio quando `suficiente`. Nunca uma frase amena quando não é. */
  coletar: string;
};

/**
 * Julga as 7 perguntas contra uma medição.
 *
 * ── A DECISÃO QUE PARECE DETALHE E NÃO É ────────────────────────────────────
 *
 * Medida AUSENTE (`undefined`) reprova, e reprova com `medido: null` — não com
 * `medido: 0`. Os dois reprovariam, mas contam histórias diferentes: 0 é "medi e
 * não tem", null é "não medi". Trocar um pelo outro é como o único evento CAPI
 * desta base ficou marcado `delivered` com `attempts=0` — um estado inventado que
 * parecia informação.
 */
export function avaliarProntidao(medicao: MedicaoDoCenso): VeredictoDaPergunta[] {
  return PERGUNTAS_DO_DONO.map((p) => {
    const exigencias = p.exige.map((e) => {
      const bruto = medicao[e.medida];
      const medido = typeof bruto === "number" && Number.isFinite(bruto) ? bruto : null;
      return { medida: e.medida, minimo: e.minimo, medido, passou: medido !== null && medido >= e.minimo };
    });
    const suficiente = exigencias.length > 0 && exigencias.every((e) => e.passou);
    return {
      chave: p.chave,
      pergunta: p.pergunta,
      funcao: p.funcao,
      suficiente,
      exigencias,
      coletar: suficiente ? "" : p.coletar,
    };
  });
}

/**
 * "2 de 7" — o resultado da frente, calculado, nunca digitado.
 *
 * `faltando` vem ORDENADO pelo número de exigências reprovadas: a pergunta que
 * falha por um dado só é a próxima a destravar, e é essa a recomendação útil.
 */
export function veredicto(medicao: MedicaoDoCenso): {
  respondiveis: number;
  total: number;
  frase: string;
  faltando: Array<{ chave: ChaveDaPergunta; reprovadas: number; coletar: string }>;
} {
  const avaliadas = avaliarProntidao(medicao);
  const respondiveis = avaliadas.filter((a) => a.suficiente).length;
  const faltando = avaliadas
    .filter((a) => !a.suficiente)
    .map((a) => ({
      chave: a.chave,
      reprovadas: a.exigencias.filter((e) => !e.passou).length,
      coletar: a.coletar,
    }))
    .sort((x, y) => x.reprovadas - y.reprovadas);
  return {
    respondiveis,
    total: avaliadas.length,
    frase: `${respondiveis} de ${avaliadas.length} perguntas do dono têm dado suficiente hoje`,
    faltando,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * A HONESTIDADE DO RANKING
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Três níveis, e o do meio é o que evita a mentira mais comum.
 *
 * `sem_base` não é "ruim": é "não sei". Um painel que pinta sem_base de vermelho
 * está dizendo que o corretor é fraco quando o que houve foi ninguém rotular
 * desfecho. Nesta base, 84 dos 88 rótulos são `lost` — tratar ausência de
 * vitória como incompetência puniria a operação pelo estado do CADASTRO.
 */
export type NivelDeEvidencia = "rankeavel" | "indicativo" | "sem_base";

/**
 * Classifica uma linha de ranking pelo DENOMINADOR que ela carrega.
 *
 * Toda função SQL do grafo que ordena algo devolve `desfechos_na_base`. Esta é a
 * função que decide o que fazer com aquele número — e é a razão de nenhuma view
 * ter coluna `suficiente`.
 */
export function nivelDeEvidencia(desfechosNaBase: number | null | undefined): NivelDeEvidencia {
  const n = typeof desfechosNaBase === "number" && Number.isFinite(desfechosNaBase) ? desfechosNaBase : 0;
  if (n >= MINIMO_DESFECHOS_PARA_RANQUEAR) return "rankeavel";
  if (n > 0) return "indicativo";
  return "sem_base";
}

/**
 * A frase que acompanha um número fraco. Existe para o painel não ter de
 * escolher palavra — e para ninguém "melhorar" o texto até ele virar elogio.
 */
export function avisoDaBase(desfechosNaBase: number | null | undefined): string {
  const nivel = nivelDeEvidencia(desfechosNaBase);
  const n = typeof desfechosNaBase === "number" && Number.isFinite(desfechosNaBase) ? desfechosNaBase : 0;
  if (nivel === "rankeavel") return "";
  if (nivel === "indicativo") {
    return `indicativo, não ranking: ${n} desfecho${n === 1 ? "" : "s"} rotulado${n === 1 ? "" : "s"} na base (mínimo ${MINIMO_DESFECHOS_PARA_RANQUEAR})`;
  }
  return "sem desfecho rotulado na base — a ordem desta lista não significa desempenho";
}

/* ────────────────────────────────────────────────────────────────────────────
 * A BASE DA EVIDÊNCIA — de onde a aresta veio, sempre visível
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Interesse REVELADO (a lead está pendurada no empreendimento) não é preferência
 * DECLARADA (a pessoa disse o bairro que quer). Os dois viram "candidato", e
 * confundi-los é como uma lista de recuperação vira ligação para quem nunca
 * pediu nada.
 *
 * A ordem é de força decrescente, e é ela que ordena os candidatos quando o
 * empate é técnico.
 */
export const FORCA_DA_BASE: Readonly<Record<string, number>> = {
  atributo_declarado: 3,
  interesse_revelado: 2,
  mesmo_bairro: 2,
  co_interesse: 2,
  mesma_cidade: 1,
  mesma_fonte: 1,
};

/** Rótulo humano de uma base, para o painel não inventar sinônimo. */
export function rotuloDaBase(base: string): string {
  switch (base) {
    case "atributo_declarado":
      return "a pessoa declarou";
    case "interesse_revelado":
      return "interesse revelado (proxy)";
    case "mesmo_bairro":
      return "mesmo bairro do acervo";
    case "co_interesse":
      return "mesma pessoa se interessou pelos dois";
    case "mesma_cidade":
      return "mesma cidade — recorte grosso";
    case "mesma_fonte":
      return "mesma fonte de origem";
    default:
      return base;
  }
}
