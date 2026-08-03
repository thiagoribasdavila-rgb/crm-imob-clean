/**
 * O QUE A SALA DE COMANDO SABE RESPONDER — catálogo declarado, não geração.
 *
 * ── Por que um catálogo, e não a IA respondendo direto ──────────────────────
 *
 * A direção escolhida para a Sala de Comando é "a IA é a interface": a pessoa
 * escreve o que quer saber e a tela responde em cartões. O risco conhecido —
 * anotado antes de começar — é que a IA hoje NÃO É MEDIDA em acerto de
 * intenção. Uma tela cuja única porta é a interpretação de um modelo fica
 * inutilizável exatamente quando o modelo erra, e o erro é silencioso: vem um
 * cartão plausível sobre outra coisa.
 *
 * Então a divisão de trabalho aqui é estrita:
 *
 *   - o CATÁLOGO (este arquivo) declara o que o produto sabe responder, e cada
 *     resposta tem dado real e ação real por trás;
 *   - o MODELO, quando entrar, só CLASSIFICA o texto digitado em uma destas
 *     intenções. Ele não inventa número, não inventa ação, não inventa
 *     pergunta;
 *   - se nada casar, a resposta é "não entendi" com as perguntas que existem —
 *     nunca o cartão mais parecido.
 *
 * O casamento abaixo é DETERMINÍSTICO por termos. Isso não é um paliativo até
 * a IA chegar: é o piso que continua valendo depois dela. Com ele a tela
 * funciona com o modelo fora do ar, e qualquer divergência entre o que o modelo
 * escolheu e o que os termos escolheriam é mensurável — que é a única forma de
 * um dia poder dizer que a IA acerta intenção.
 *
 * ── A regra que impede o cartão errado ──────────────────────────────────────
 *
 * Um grupo de termos é um E; dentro do grupo, um OU. "leads mornas sem contato"
 * casa a intenção que exige [morno] E [sem contato]. Uma pergunta que só diga
 * "leads" não casa nada específico — e é isso que se quer: pergunta vaga devolve
 * as opções, não um chute.
 *
 * PURO: sem rede, sem banco, sem relógio. Os números vêm de quem chama.
 */

export type AcaoDoCartao = {
  rotulo: string;
  /** Para onde a pessoa vai para AGIR. Cartão sem ação é resposta que morre na tela. */
  href: string;
};

export type Intencao = {
  id: string;
  /** O título do cartão. */
  titulo: string;
  /** Uma frase dizendo o que este cartão responde — vira o subtítulo. */
  responde: string;
  /**
   * Grupos de termos. TODOS os grupos precisam aparecer no texto (E); dentro de
   * cada grupo basta um (OU). Quanto mais grupos, mais específica a intenção —
   * e a mais específica ganha quando duas casam.
   */
  termos: string[][];
  acoes: AcaoDoCartao[];
};

/**
 * As perguntas que a Sala de Comando responde hoje.
 *
 * Cada uma existe porque há dado medido por trás e um lugar para agir. Uma
 * intenção sem ação não entra: responder "são 171" e deixar a pessoa sem o
 * próximo passo é a versão elegante de não responder.
 */
export const INTENCOES: readonly Intencao[] = [
  {
    id: "mornas-sem-contato",
    titulo: "Leads mornas ainda sem primeiro contato",
    responde: "quantas leads na faixa morna nunca foram contatadas, e quem pode assumi-las",
    termos: [
      ["morna", "mornas", "morno", "mornos", "tepid"],
      ["sem contato", "nao contatada", "não contatada", "nunca contatad", "sem primeiro contato", "sem atendimento"],
    ],
    acoes: [
      { rotulo: "Ver a lista", href: "/leads?score=warm&attention=sem-primeiro-contato" },
      { rotulo: "Distribuir", href: "/distribution" },
    ],
  },
  {
    id: "sem-primeiro-contato",
    titulo: "Leads sem primeiro contato",
    responde: "quantas leads entraram e ninguém falou com elas ainda, em qualquer faixa",
    termos: [["sem contato", "sem primeiro contato", "nao contatada", "não contatada", "nunca contatad", "sem atendimento", "ninguem falou", "ninguém falou"]],
    acoes: [
      { rotulo: "Ver a fila por SLA", href: "/leads?attention=sem-primeiro-contato" },
      { rotulo: "Distribuir", href: "/distribution" },
    ],
  },
  {
    id: "mornas",
    titulo: "Leads na faixa morna",
    responde: "quantas leads estão na faixa de score morna, prontas para trabalho ativo",
    termos: [["morna", "mornas", "morno", "mornos"]],
    acoes: [{ rotulo: "Ver a lista", href: "/leads?score=warm" }],
  },
  {
    id: "quentes",
    titulo: "Leads quentes",
    responde: "quantas leads estão na faixa quente, onde o tempo de resposta decide a venda",
    termos: [["quente", "quentes", "hot"]],
    acoes: [{ rotulo: "Ver a lista", href: "/leads?score=hot" }],
  },
  {
    id: "decisoes-pendentes",
    titulo: "Decisões esperando você",
    responde: "o que a IA propôs e está parado à espera de uma pessoa decidir",
    termos: [["decisao", "decisão", "decisoes", "decisões", "aprovar", "aprovacao", "aprovação", "pendente", "pendencia", "pendência"]],
    acoes: [{ rotulo: "Abrir a fila", href: "/approvals" }],
  },
  {
    id: "estoque",
    titulo: "Estoque disponível",
    /**
     * ── ESTA É A ÚNICA INTENÇÃO QUE NÃO AFIRMA UM NÚMERO, E É DE PROPÓSITO ────
     *
     * MEDIDO no banco vivo em 03/08/2026: existem TRÊS tabelas disputando o
     * significado de "unidade", e elas discordam.
     *
     *   properties        110 linhas, 104 disponíveis   R$ 41.822.186
     *   units              30 linhas                    R$  9.205.000
     *   inventory_units     0 linhas                    —  (o fluxo de
     *                                                      importação trata
     *                                                      esta como canônica)
     *
     * E `developments.total_units` declara um quarto número: 693 unidades
     * somadas (Tiê 321, Arvo 262, Inside Perdizes 80, Spin Mood 30).
     *
     * Escolher uma delas aqui produziria um cartão confiante e provavelmente
     * errado, respondendo "onde o dinheiro está" — a pergunta mais cara que a
     * diretoria faz — com a tabela que por acaso o programador conhecia. Este
     * repositório já pagou por isso: duas verdades sobre o mesmo fato, cada
     * leitor com a sua, e ninguém sabendo qual olhar.
     *
     * Enquanto a fonte não for decidida, o cartão leva a pessoa ao lugar onde o
     * dado mora e diz que há divergência. Responder "não sei ainda, e é por
     * isto" é mais útil do que um total que não se sustenta.
     */
    responde: "onde as unidades estão cadastradas hoje — há três fontes divergentes, e a boa ainda não foi decidida",
    termos: [["estoque", "unidade", "unidades", "vgv", "disponivel", "disponível", "inventario", "inventário"]],
    acoes: [{ rotulo: "Ver empreendimentos", href: "/developments" }],
  },
  {
    id: "gasto-de-midia",
    titulo: "Gasto de mídia",
    responde: "quanto foi investido em campanhas no período e o que isso trouxe",
    termos: [["gasto", "gastos", "investimento", "investido", "verba", "custo", "cpl", "midia", "mídia", "anuncio", "anúncio"]],
    acoes: [
      { rotulo: "Ver campanhas", href: "/marketing" },
      { rotulo: "Relatório de marketing", href: "/reports/marketing" },
    ],
  },
  {
    id: "conversao",
    titulo: "Conversão do funil",
    responde: "quantas leads viraram venda, e por onde as outras saíram",
    termos: [["conversao", "conversão", "converteu", "funil", "taxa", "venda", "vendas", "ganho", "ganhos"]],
    acoes: [{ rotulo: "Ver o funil", href: "/analytics/funnel" }],
  },
  {
    id: "carteira-dos-corretores",
    titulo: "Carteira dos corretores",
    responde: "como as leads estão distribuídas entre a equipe, e quem está sobrecarregado",
    termos: [["corretor", "corretores", "equipe", "carteira", "time", "distribuic", "distribuiç"]],
    acoes: [
      { rotulo: "Ver distribuição", href: "/distribution" },
      { rotulo: "Capacidade da equipe", href: "/analytics/enterprise" },
    ],
  },
  {
    id: "criativos-esperando",
    titulo: "Criativos esperando aprovação",
    responde: "quais peças a IA compôs e estão paradas antes de poderem ir ao ar",
    termos: [["criativo", "criativos", "peca", "peça", "pecas", "peças", "campanha", "campanhas", "anuncio", "anúncio"], ["aprova", "aprovar", "aprovacao", "aprovação", "esperando", "parado", "parada", "pendente"]],
    acoes: [{ rotulo: "Abrir a Caixa de Aprovações", href: "/approvals" }],
  },
];

/** Sem acento, minúsculo, espaços colapsados — para o texto casar com os termos. */
export function normalizar(texto: string): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    // Faixa dos diacríticos combinantes por escape, e não pelo caractere: escrito
    // literal, o intervalo depende de o arquivo sobreviver a toda ferramenta que
    // o tocar, e um acento perdido no meio do caminho vira um regex que não casa
    // nada — silenciosamente.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type Resposta =
  | { tipo: "entendi"; intencao: Intencao; alternativas: Intencao[] }
  | { tipo: "ambigua"; candidatas: Intencao[] }
  | { tipo: "nao_entendi"; sugestoes: Intencao[] };

/** Quantos grupos da intenção aparecem no texto. Só conta se TODOS aparecerem. */
function casa(intencao: Intencao, textoNormalizado: string): boolean {
  return intencao.termos.every((grupo) => grupo.some((termo) => textoNormalizado.includes(normalizar(termo))));
}

/**
 * Resolve o que a pessoa digitou para uma intenção do catálogo.
 *
 * Nunca devolve um cartão por aproximação. Os três desfechos são honestos:
 * entendi (com as vizinhas, para corrigir em um clique), ambígua (duas
 * igualmente específicas — quem escolhe é a pessoa) e não entendi (com o que
 * existe). O terceiro é o que impede o defeito silencioso desta direção: um
 * cartão plausível sobre a pergunta errada.
 */
export function resolverPergunta(texto: string, catalogo: readonly Intencao[] = INTENCOES): Resposta {
  const alvo = normalizar(texto);
  if (alvo.length === 0) return { tipo: "nao_entendi", sugestoes: [...catalogo].slice(0, 4) };

  const casadas = catalogo.filter((i) => casa(i, alvo));
  if (casadas.length === 0) return { tipo: "nao_entendi", sugestoes: [...catalogo].slice(0, 4) };

  // Mais grupos = mais específica. "mornas sem contato" (2 grupos) ganha de
  // "mornas" (1 grupo): quem pediu o recorte estreito não quer o largo.
  const porEspecificidade = [...casadas].sort((a, b) => b.termos.length - a.termos.length);
  const maisEspecifica = porEspecificidade[0];
  const empatadas = porEspecificidade.filter((i) => i.termos.length === maisEspecifica.termos.length);

  if (empatadas.length > 1) return { tipo: "ambigua", candidatas: empatadas };

  return {
    tipo: "entendi",
    intencao: maisEspecifica,
    alternativas: porEspecificidade.slice(1),
  };
}

/** As perguntas que a tela oferece antes de a pessoa digitar qualquer coisa. */
export function perguntasSugeridas(catalogo: readonly Intencao[] = INTENCOES): Intencao[] {
  return [...catalogo].slice(0, 4);
}
