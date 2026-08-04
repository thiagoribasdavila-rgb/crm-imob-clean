/**
 * O QUE ESTÁ CONSTRUÍDO E APAGADO.
 *
 * ── O que este módulo existe para responder ─────────────────────────────────
 *
 * Levantado em 03/08/2026 no banco vivo: 82 tabelas com ZERO linhas, 67 delas
 * com código que as lê. Nenhuma está quebrada. Elas estão APAGADAS — o recurso
 * foi construído inteiro e ninguém preencheu a configuração que o acende.
 *
 * O produto não tinha como dizer isso. `prontidao-das-integracoes.ts` responde
 * "a credencial está boa?"; nada respondia "esta capacidade está no ar?". A
 * diferença aparece no pior lugar: um painel de verba vazio parece "não gastei
 * nada" em vez de "não cadastrei orçamento", e um rodízio sem elenco parece
 * "não uso rodízio" em vez de "montei o rodízio e nunca escalei ninguém".
 *
 * ── POR QUE ISTO NÃO É UM "TODO LIST" ──────────────────────────────────────
 *
 * Cada linha traz o CUSTO DE HOJE, medido, e não um lembrete. "Cadastre a verba"
 * não move ninguém; "R$ 4.355,83 saíram este mês e o plano de eficiência está
 * vazio porque nenhum orçamento foi cadastrado" move. A frase sem número foi o
 * que fez 67 tabelas vazias passarem despercebidas por semanas.
 *
 * ── A REGRA QUE IMPEDE ESTE PAINEL DE VIRAR RUÍDO ──────────────────────────
 *
 * Capacidade cujo pré-requisito não está pronto NÃO aparece como pendência da
 * pessoa: aparece como BLOQUEADA, com o pré-requisito nomeado. Mandar alguém
 * cadastrar o dataset da CAPI enquanto o token da Meta não existe é gastar a
 * atenção dela no degrau errado — e ensinar a ignorar a lista inteira.
 *
 * PURO: sem banco, sem rede, sem relógio.
 */

export type FatoMedido = {
  /** Identificador estável da capacidade. */
  chave: string;
  /** Quantas linhas de configuração existem. 0 = apagada. */
  configuradas: number;
  /** Quantas seriam necessárias para considerar acesa (1 basta na maioria). */
  minimo?: number;
  /**
   * O pré-requisito está pronto? `undefined` quando a capacidade não depende de
   * nada. `false` bloqueia e tira a capacidade da fila de ação da pessoa.
   */
  prerequisitoPronto?: boolean;
};

export type Capacidade = {
  chave: string;
  /** Nome curto, do jeito que a operação chama. */
  titulo: string;
  /** O que deixa de funcionar enquanto está apagada. Sem jargão. */
  oQueFicaNoEscuro: string;
  /** A ação ÚNICA que acende. Verbo no infinitivo, um passo só. */
  comoAcender: string;
  /** Onde fazer isso. Caminho interno do produto. */
  onde: string;
  /** Nome do pré-requisito, para a mensagem de bloqueio. */
  prerequisito?: string;
  /**
   * Peso da consequência: quanto custa continuar apagada. Ordena a lista.
   * 3 = dinheiro saindo ou lead parada; 2 = decisão às cegas; 1 = conforto.
   */
  peso: 1 | 2 | 3;
};

export type LinhaDoPainel = {
  chave: string;
  titulo: string;
  estado: "acesa" | "apagada" | "bloqueada";
  /** Frase pronta, já com o custo medido. Nunca vazia. */
  frase: string;
  comoAcender: string | null;
  onde: string | null;
  peso: number;
  configuradas: number;
};

/**
 * Cruza o catálogo com o que foi medido.
 *
 * Capacidade sem fato medido vira `bloqueada` com a frase de "não consegui
 * medir" — nunca `acesa`. Ausência de medição não pode virar boa notícia: é a
 * mesma regra que o resto do produto aplica a contagem que não pôde ser lida.
 */
export function montarPainel(
  catalogo: readonly Capacidade[],
  fatos: readonly FatoMedido[],
  custos: Readonly<Record<string, string>> = {},
): LinhaDoPainel[] {
  const porChave = new Map(fatos.map((f) => [f.chave, f]));

  const linhas = catalogo.map((cap): LinhaDoPainel => {
    const fato = porChave.get(cap.chave);
    const custo = custos[cap.chave];

    if (!fato) {
      return {
        chave: cap.chave, titulo: cap.titulo, estado: "bloqueada",
        frase: `Não consegui medir se ${cap.titulo.toLowerCase()} está no ar. O estado é desconhecido, não saudável.`,
        comoAcender: null, onde: null, peso: cap.peso, configuradas: 0,
      };
    }

    if (fato.prerequisitoPronto === false) {
      return {
        chave: cap.chave, titulo: cap.titulo, estado: "bloqueada",
        frase: `Depende de ${cap.prerequisito ?? "outro passo"}, que ainda não está pronto. ${cap.oQueFicaNoEscuro}`,
        // Sem ação: mandar agir aqui gastaria a atenção no degrau errado.
        comoAcender: null, onde: null, peso: cap.peso, configuradas: fato.configuradas,
      };
    }

    const minimo = fato.minimo ?? 1;
    if (fato.configuradas >= minimo) {
      return {
        chave: cap.chave, titulo: cap.titulo, estado: "acesa",
        frase: `No ar — ${fato.configuradas} ${fato.configuradas === 1 ? "configuração" : "configurações"}.`,
        comoAcender: null, onde: null, peso: cap.peso, configuradas: fato.configuradas,
      };
    }

    return {
      chave: cap.chave, titulo: cap.titulo, estado: "apagada",
      // O custo medido entra ANTES da instrução: é ele que faz alguém agir.
      frase: custo ? `${custo} ${cap.oQueFicaNoEscuro}` : cap.oQueFicaNoEscuro,
      comoAcender: cap.comoAcender, onde: cap.onde,
      peso: cap.peso, configuradas: fato.configuradas,
    };
  });

  // Apagadas primeiro (é onde há ação), depois bloqueadas, acesas por último.
  // Dentro de cada grupo, maior consequência na frente.
  const ordem = { apagada: 0, bloqueada: 1, acesa: 2 } as const;
  return linhas.sort((a, b) =>
    ordem[a.estado] - ordem[b.estado] || b.peso - a.peso || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

/** Um número só para o cabeçalho: quantas capacidades esperam por alguém. */
export function resumo(linhas: readonly LinhaDoPainel[]) {
  return {
    apagadas: linhas.filter((l) => l.estado === "apagada").length,
    bloqueadas: linhas.filter((l) => l.estado === "bloqueada").length,
    acesas: linhas.filter((l) => l.estado === "acesa").length,
    total: linhas.length,
  };
}

/**
 * O catálogo desta operação.
 *
 * Cada linha nasceu de uma medição de 03/08/2026, não de imaginação — e é por
 * isso que `oQueFicaNoEscuro` fala de coisa concreta em vez de "melhora a
 * experiência".
 */
export const CATALOGO: readonly Capacidade[] = [
  {
    chave: "whatsapp_do_corretor",
    titulo: "WhatsApp do corretor",
    oQueFicaNoEscuro: "A distribuição automática exige o canal ligado: enquanto ninguém conectar, TODA lead de anúncio entra represada, sem dono.",
    comoAcender: "Conectar o número de pelo menos um corretor",
    onde: "/integrations/whatsapp",
    peso: 3,
  },
  {
    chave: "fila_de_atendimento",
    titulo: "Fila de atendimento",
    oQueFicaNoEscuro: "Sem elenco em nenhum escopo, a lead vai para o corretor com menos leads em aberto da equipe inteira — quem trabalha o Arvo pode receber lead do Spin Mood.",
    comoAcender: "Colocar corretores na fila de um empreendimento",
    onde: "/distribution",
    peso: 3,
  },
  {
    chave: "verba_por_produto",
    titulo: "Verba por produto",
    oQueFicaNoEscuro: "O plano de eficiência de verba e o CAC alvo ficam vazios — e painel de verba vazio lê-se como 'não gastei', não como 'não cadastrei'.",
    comoAcender: "Cadastrar o orçamento semanal e o CAC alvo de cada produto",
    onde: "/marketing",
    peso: 3,
  },
  {
    chave: "canal_de_aviso_do_corretor",
    titulo: "Canal de aviso do corretor",
    oQueFicaNoEscuro: "O aviso de lead nova não alcança quem está com o Atlas fechado — e o prazo de primeiro contato mais curto é de 5 minutos.",
    comoAcender: "Cadastrar o canal de aviso de cada corretor",
    onde: "/brokers",
    peso: 2,
  },
  {
    chave: "limites_de_carteira",
    titulo: "Limites de carteira",
    oQueFicaNoEscuro: "A métrica 'carteiras no limite' não tem lastro: sem limite cadastrado ela mostra '—', e o motor não bloqueia sobrecarga de ninguém.",
    comoAcender: "Definir o máximo de leads ativas por corretor",
    onde: "/distribution",
    peso: 2,
  },
  {
    chave: "prioridade_por_origem",
    titulo: "Prioridade por origem e SLA",
    oQueFicaNoEscuro: "Toda origem entra com a mesma prioridade e o mesmo prazo: lead de anúncio pago espera igual a lead de portal.",
    comoAcender: "Salvar a prioridade e o SLA das origens que mais convertem",
    onde: "/distribution",
    peso: 2,
  },
  {
    chave: "dataset_da_capi",
    titulo: "Conversão em produção na Meta",
    // Medido em 03/08/2026: 1 dataset cadastrado, ZERO em produção. Dataset em
    // modo TESTE recebe o evento e a Meta não o usa para otimizar — por isso a
    // conta desta capacidade é sobre `mode='live'`, não sobre existir linha.
    oQueFicaNoEscuro: "O dataset está em modo teste: a Meta recebe a venda e NÃO a usa para otimizar. Ela segue otimizando para quem preenche formulário, não para quem compra.",
    comoAcender: "Promover o dataset para produção",
    onde: "/integrations/meta",
    prerequisito: "o token de conversões da Meta",
    peso: 3,
  },
];
