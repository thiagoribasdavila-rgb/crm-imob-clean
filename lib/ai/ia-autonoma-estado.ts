/**
 * O ESTADO HONESTO DA IA — o que ela fez, o que propôs, e POR QUE parou.
 *
 * ── O que foi medido no banco canônico em 02/08/2026 ───────────────────────
 *
 * Cinco tabelas de EXECUÇÃO da IA estão em zero absoluto:
 *
 *     atlas_agent_runs .............. 0
 *     ai_sales_journeys ............. 0
 *     meta_executions ............... 0
 *     nightly_broker_handoffs ....... 0
 *     integration_health_snapshots .. 0
 *
 * E, ao mesmo tempo, as tabelas de PENSAMENTO têm linha:
 *
 *     ai_usage_events ............... 51
 *     ai_orchestration_decisions .... 43
 *     ai_shadow_decisions ........... 20   (todas retidas, nenhuma decidida)
 *     approval_requests .............  4   (3 já vencidas)
 *
 * A frase que este módulo existe para permitir é essa: **a IA pensou 43 vezes
 * e executou zero**. Uma tela que desenhasse "IA ativa" sobre esse banco seria
 * a pior classe de defeito deste repositório — ausência de evidência
 * apresentada como saúde.
 *
 * ── ZERO É ZERO; NÃO-LIDO É NULL ──────────────────────────────────────────
 *
 * Toda contagem aqui é `number | null`. `0` quer dizer "contei e não havia
 * nenhuma". `null` quer dizer "não consegui contar". Colapsar os dois em `0`
 * é exatamente como "ausência de dado" vira "zero" na tela — e aí a tela mente
 * sem que ninguém tenha escrito um número errado.
 *
 * ── Puro de propósito ─────────────────────────────────────────────────────
 *
 * Sem `fs`, sem rede, sem `server-only`: o catálogo de níveis
 * (`niveis-de-autonomia.ts`) lê disco e por isso ENTRA como parâmetro. Assim
 * este módulo pode ser importado pelo cliente sem arrastar `node:fs` junto, e
 * cada derivação é testável com uma tabela de entrada.
 */

/** Uma decisão de roteamento — quem a IA queria chamar e quem ela chamou. */
export type LinhaDeOrquestracao = {
  feature: string | null;
  selected_provider: string | null;
  selected_model: string | null;
  routing_reasons: string[] | null;
  human_review_required: boolean | null;
  fallback_used: boolean | null;
  created_at: string;
};

/** Uma recomendação que a IA preparou em modo sombra e não executou. */
export type LinhaDeSombra = {
  agent: string | null;
  acao: string | null;
  autonomy_level: number | null;
  retido: boolean | null;
  executado: boolean | null;
  decisao_humana: string | null;
  created_at: string;
};

/** Uma proposta esperando assinatura humana em /approvals. */
export type LinhaDeAprovacao = {
  id: string;
  request_type: string | null;
  status: string | null;
  created_at: string;
  expires_at: string | null;
};

/** Consumo real por agente — a prova de que um agente existe além do catálogo. */
export type LinhaDeConsumo = {
  agent: string | null;
  provider: string | null;
  created_at: string;
};

/**
 * As cinco contagens de EXECUÇÃO. `null` em qualquer uma significa leitura
 * falhada, e a tela é obrigada a dizer isso em vez de desenhar zero.
 *
 * ── 02/08/2026: `jornadasDeVenda` deixou de ser "linhas em ai_sales_journeys" ─
 *
 * `lib/ai/jornada-em-sombra.ts` passou a abrir jornada na ENTRADA de toda lead,
 * sem enviar nada. Contar essas linhas como execução faria a postura desta tela
 * virar "executando" na primeira lead que entrasse, com a frase «Executei N
 * ação(ões) registrada(s) — todas com aprovação nomeada» sobre um banco em que
 * NADA saiu. Seria a doença desta tela ao contrário: ausência de ação desenhada
 * como ação.
 *
 * Agora o campo conta jornada COM envio (`outbound_count > 0`), e a preparada
 * anda ao lado, fora da soma, em `jornadasEmSombra`.
 */
export type ContagemDeExecucao = {
  corridasDeAgente: number | null;
  /** Jornadas que ENVIARAM. Preparada e não enviada não entra aqui. */
  jornadasDeVenda: number | null;
  execucoesNaMeta: number | null;
  passagensParaCorretor: number | null;
  retratosDeIntegracao: number | null;
};

/** Um agente declarado em config/orcamento-e-autonomia-da-ia.json. */
export type AgenteDoCatalogo = { agente: string; nivel: number; porque: string };

export type EntradaDoEstado = {
  /** Instante da leitura. Injetado para que a idade das propostas seja testável. */
  agora: Date;
  orquestracao: LinhaDeOrquestracao[] | null;
  sombra: LinhaDeSombra[] | null;
  aprovacoes: LinhaDeAprovacao[] | null;
  consumo: LinhaDeConsumo[] | null;
  /**
   * Quantas recomendações em sombra a organização REALMENTE tem, contadas sem
   * passar pela cerca de leitura do usuário. Existe para pegar falso zero: se
   * este número for maior que `sombra.length`, a lista chegou incompleta e a
   * tela precisa dizer isso em vez de anunciar "a IA não preparou nada".
   */
  sombraNaOrganizacao: number | null;
  execucao: ContagemDeExecucao;
  /**
   * Jornadas ABERTAS E NÃO ENVIADAS (`outbound_count = 0`). Fica fora de
   * `ContagemDeExecucao` de propósito: somá-la seria chamar de execução o que a
   * sombra existe para impedir. `null` = não consegui contar.
   */
  jornadasEmSombra: number | null;
  catalogo: AgenteDoCatalogo[];
  /**
   * Problemas apontados por `problemasDoCatalogo()`. Catálogo ilegível devolve
   * lista VAZIA de agentes, e uma lista vazia desenha "todo agente é nível 0" —
   * que é falso e tranquilizador ao mesmo tempo. Com este campo o painel diz
   * que não conseguiu ler, em vez de inventar uma governança que não leu.
   */
  problemasDoCatalogo: string[];
  /** Ações que o modo sombra retém enquanto `modoSombra.ligado` for verdadeiro. */
  acoesRetidasEmSombra: string[];
  modoSombraLigado: boolean;
};

/* ── ROTEAMENTO ────────────────────────────────────────────────────────────
   O número "65% de fallback" sozinho lê-se como falha do sistema. Ele não é.
   Das 28 quedas medidas, 10 são a governança FUNCIONANDO — dado pessoal não
   pode sair para provedor de economia nem de pesquisa, então a chamada cai no
   determinístico local de propósito. As outras 18 são degradação por custo, e
   só ESSAS têm conserto.

   Separar as duas é a única leitura que muda uma decisão: sem a separação,
   alguém "conserta" a governança achando que está consertando um defeito. */
const MARCA_DE_GOVERNANCA = "blocked_for_personal_data";
const MARCA_DE_CUSTO = "cost_aware_failover";

export type RepartoDeRoteamento = {
  total: number;
  noModeloPretendido: number;
  bloqueadoPorGovernanca: number;
  degradadoPorCusto: number;
  /** Caiu no local e o motivo não é nenhum dos dois conhecidos. Não invento causa. */
  degradadoSemMotivoDeclarado: number;
};

export function repartirRoteamento(linhas: LinhaDeOrquestracao[]): RepartoDeRoteamento {
  const reparto: RepartoDeRoteamento = {
    total: linhas.length,
    noModeloPretendido: 0,
    bloqueadoPorGovernanca: 0,
    degradadoPorCusto: 0,
    degradadoSemMotivoDeclarado: 0,
  };
  for (const linha of linhas) {
    if (!linha.fallback_used) {
      reparto.noModeloPretendido += 1;
      continue;
    }
    const motivos = (linha.routing_reasons ?? []).join(" ");
    if (motivos.includes(MARCA_DE_GOVERNANCA)) reparto.bloqueadoPorGovernanca += 1;
    else if (motivos.includes(MARCA_DE_CUSTO)) reparto.degradadoPorCusto += 1;
    else reparto.degradadoSemMotivoDeclarado += 1;
  }
  return reparto;
}

/* ── VALIDADE DAS PROPOSTAS ───────────────────────────────────────────────
   "4 pendentes" é um número verdadeiro e inútil: ele não diz que 3 delas já
   passaram do prazo e não podem mais ser assinadas. Proposta vencida não é
   uma proposta esperando — é trabalho da IA jogado fora, e é a única leitura
   que faz alguém abrir /approvals hoje. */
export type EstadoDaValidade = "vencida" | "expira_hoje" | "viva" | "sem_prazo";

export type ValidadeDaProposta = {
  id: string;
  tipo: string;
  criadaEm: string;
  expiraEm: string | null;
  /** Dias inteiros desde a criação. */
  diasParada: number;
  /** Negativo = já venceu. `null` quando a proposta não tem prazo declarado. */
  diasAteVencer: number | null;
  estado: EstadoDaValidade;
};

const DIA_EM_MS = 86_400_000;

const diasEntre = (de: Date, ate: Date) => Math.floor((ate.getTime() - de.getTime()) / DIA_EM_MS);

export function avaliarValidade(linhas: LinhaDeAprovacao[], agora: Date): ValidadeDaProposta[] {
  return linhas
    .filter((linha) => (linha.status ?? "pending") === "pending")
    .map((linha) => {
      const criada = new Date(linha.created_at);
      const expira = linha.expires_at ? new Date(linha.expires_at) : null;
      const diasAteVencer = expira ? diasEntre(agora, expira) : null;
      const estado: EstadoDaValidade =
        diasAteVencer === null ? "sem_prazo" : diasAteVencer < 0 ? "vencida" : diasAteVencer === 0 ? "expira_hoje" : "viva";
      return {
        id: linha.id,
        tipo: linha.request_type ?? "proposta",
        criadaEm: linha.created_at,
        expiraEm: linha.expires_at,
        diasParada: Math.max(0, diasEntre(criada, agora)),
        diasAteVencer,
        estado,
      };
    })
    .sort((a, b) => (a.diasAteVencer ?? Number.POSITIVE_INFINITY) - (b.diasAteVencer ?? Number.POSITIVE_INFINITY));
}

/* ── CAPACIDADES ──────────────────────────────────────────────────────────
   O painel de autonomia NÃO inventa uma lista: ele renderiza o catálogo que já
   é executável (config/orcamento-e-autonomia-da-ia.json, validado por
   `niveis-de-autonomia.ts`) e cruza com o consumo medido. Duas verdades
   separadas — o que o dono autorizou, e o que de fato rodou. */
export type FaixaDeAutonomia = "sozinha" | "assinatura" | "observa";

export type CapacidadeDaIa = {
  agente: string;
  nivel: number;
  faixa: FaixaDeAutonomia;
  porque: string;
  /** Chamadas medidas em ai_usage_events na janela lida. `null` = janela não lida. */
  chamadas: number | null;
  ultimoUso: string | null;
  /** Verdadeiro quando o agente NÃO está no catálogo: nasce no nível 0, fechado. */
  foraDoCatalogo: boolean;
};

/** Nível 4 age para fora e exige assinatura; 1..3 opera dentro do próprio nível; 0 só observa. */
export const faixaDoNivel = (nivel: number): FaixaDeAutonomia =>
  nivel >= 4 ? "assinatura" : nivel >= 1 ? "sozinha" : "observa";

export function montarCapacidades(
  catalogo: AgenteDoCatalogo[],
  consumo: LinhaDeConsumo[] | null,
): CapacidadeDaIa[] {
  const medido = new Map<string, { chamadas: number; ultimo: string }>();
  for (const linha of consumo ?? []) {
    const nome = String(linha.agent ?? "").trim().toLowerCase();
    if (!nome) continue;
    const atual = medido.get(nome);
    if (!atual) medido.set(nome, { chamadas: 1, ultimo: linha.created_at });
    else {
      atual.chamadas += 1;
      if (linha.created_at > atual.ultimo) atual.ultimo = linha.created_at;
    }
  }

  const declarados = catalogo.map((item): CapacidadeDaIa => {
    const chave = item.agente.trim().toLowerCase();
    const uso = medido.get(chave);
    return {
      agente: item.agente,
      nivel: item.nivel,
      faixa: faixaDoNivel(item.nivel),
      porque: item.porque,
      chamadas: consumo === null ? null : (uso?.chamadas ?? 0),
      ultimoUso: uso?.ultimo ?? null,
      foraDoCatalogo: false,
    };
  });

  // Agente que rodou sem estar declarado. Não é curiosidade: `nivelDoAgente`
  // devolve 0 para quem não está no catálogo, então ele NASCE travado — e é
  // exatamente por isso que as 20 recomendações de `sla-primeiro-contato`
  // ficaram retidas. Sem esta linha na tela, o motivo do bloqueio fica invisível.
  const nomesDeclarados = new Set(catalogo.map((item) => item.agente.trim().toLowerCase()));
  const intrusos = [...medido.entries()]
    .filter(([nome]) => !nomesDeclarados.has(nome))
    .map(([nome, uso]): CapacidadeDaIa => ({
      agente: nome,
      nivel: 0,
      faixa: "observa",
      porque: "Não está no catálogo. Agente não declarado nasce no nível 0 — observa e não age.",
      chamadas: uso.chamadas,
      ultimoUso: uso.ultimo,
      foraDoCatalogo: true,
    }));

  return [...declarados, ...intrusos].sort((a, b) => b.nivel - a.nivel || a.agente.localeCompare(b.agente, "pt-BR"));
}

/* ── POSTURA E MOTIVO ─────────────────────────────────────────────────────── */

/**
 * `sem_leitura` existe para que o robô nunca diga "parada" quando na verdade
 * ele não conseguiu ler o banco. Não saber e saber que não houve nada são
 * estados diferentes, e confundi-los é a mesma doença de desenhar zero para
 * ausência.
 */
export type PosturaDaIa = "sem_leitura" | "parada" | "propondo" | "executando";

export type ClasseDeMotivo = "governanca" | "assinatura" | "configuracao" | "leitura";

export type MotivoDeParada = {
  id: string;
  titulo: string;
  detalhe: string;
  classe: ClasseDeMotivo;
};

export type EstadoDaIa = {
  postura: PosturaDaIa;
  /** Soma das execuções lidas. `null` quando nenhuma das cinco tabelas foi lida. */
  execucoes: number | null;
  execucao: ContagemDeExecucao;
  /** Jornadas preparadas e não enviadas. NUNCA somada em `execucoes`. */
  jornadasEmSombra: number | null;
  /** Recomendações preparadas e retidas pelo modo sombra, entre as LEGÍVEIS. */
  retidas: number | null;
  /** Existem na organização e não chegaram na leitura. Zero é o estado saudável. */
  sombraOculta: number;
  /** Das retidas, quantas ninguém aceitou nem recusou. É o silêncio, não o volume. */
  retidasSemVeredicto: number;
  /** Das retidas sem veredicto, a mais antiga em dias. */
  diasDaRetidaMaisAntiga: number | null;
  propostas: ValidadeDaProposta[] | null;
  propostasVencidas: number;
  /** Propostas que ainda dá para assinar. Vencida não espera ninguém — morreu. */
  propostasVivas: number;
  /** Tudo que depende de um humano agora. É o único número que pede decisão. */
  aguardandoHumano: number;
  roteamento: RepartoDeRoteamento | null;
  capacidades: CapacidadeDaIa[];
  /** Vazio = catálogo lido e válido. Com item = o painel NÃO pode ser lido como verdade. */
  problemasDoCatalogo: string[];
  motivos: MotivoDeParada[];
  /** Frase única do robô. Nunca afirma atividade que a contagem não sustenta. */
  frase: string;
};

const somarLidos = (valores: Array<number | null>) => {
  const lidos = valores.filter((valor): valor is number => valor !== null);
  return lidos.length ? lidos.reduce((total, valor) => total + valor, 0) : null;
};

export function derivarEstadoDaIa(entrada: EntradaDoEstado): EstadoDaIa {
  const { agora, execucao } = entrada;

  const execucoes = somarLidos([
    execucao.corridasDeAgente,
    execucao.jornadasDeVenda,
    execucao.execucoesNaMeta,
    execucao.passagensParaCorretor,
    execucao.retratosDeIntegracao,
  ]);

  const sombra = entrada.sombra;
  const retidasLista = sombra?.filter((linha) => linha.retido === true && linha.executado !== true) ?? null;
  const retidas = retidasLista ? retidasLista.length : null;
  const semVeredicto = retidasLista?.filter((linha) => !linha.decisao_humana) ?? [];
  const diasDaRetidaMaisAntiga = semVeredicto.length
    ? Math.max(...semVeredicto.map((linha) => diasEntre(new Date(linha.created_at), agora)))
    : null;

  // FALSO ZERO: a contagem da organização é maior que a lista que chegou. Não é
  // "a IA não preparou nada" — é "você não está enxergando o que ela preparou".
  const sombraOculta =
    entrada.sombraNaOrganizacao !== null && sombra !== null
      ? Math.max(0, entrada.sombraNaOrganizacao - sombra.length)
      : 0;

  const propostas = entrada.aprovacoes ? avaliarValidade(entrada.aprovacoes, agora) : null;
  const propostasVencidas = propostas?.filter((item) => item.estado === "vencida").length ?? 0;
  const roteamento = entrada.orquestracao ? repartirRoteamento(entrada.orquestracao) : null;
  const capacidades = montarCapacidades(entrada.catalogo, entrada.consumo);

  const nadaFoiLido =
    execucoes === null && sombra === null && entrada.aprovacoes === null && entrada.orquestracao === null;

  const propostasVivas = propostas?.filter((item) => item.estado !== "vencida").length ?? 0;
  const jornadasEmSombra = entrada.jornadasEmSombra;
  // Jornada preparada empurra a postura para "propondo", NUNCA para
  // "executando": ela é trabalho feito e retido, que é exatamente o que
  // "propondo" descreve.
  const postura: PosturaDaIa = nadaFoiLido
    ? "sem_leitura"
    : (execucoes ?? 0) > 0
      ? "executando"
      : (retidas ?? 0) > 0 || (propostas?.length ?? 0) > 0 || sombraOculta > 0 || (jornadasEmSombra ?? 0) > 0
        ? "propondo"
        : "parada";

  const motivos: MotivoDeParada[] = [];

  if (entrada.problemasDoCatalogo.length) {
    motivos.push({
      id: "catalogo",
      titulo: "Não consegui ler a declaração de níveis",
      detalhe: `O painel de autonomia abaixo está incompleto: ${entrada.problemasDoCatalogo.join(" · ")}. Nível de agente sem declaração lida vale 0 no motor, mas a tela não pode apresentar isso como se fosse a governança em vigor.`,
      classe: "leitura",
    });
  }

  if (nadaFoiLido) {
    motivos.push({
      id: "leitura",
      titulo: "Não consegui ler o meu próprio histórico",
      detalhe:
        "Nenhuma das tabelas de evidência respondeu. Não estou dizendo que não fiz nada — estou dizendo que não sei. São coisas diferentes e a segunda não vira zero.",
      classe: "leitura",
    });
  }

  if (sombraOculta > 0) {
    motivos.push({
      id: "sombra-oculta",
      titulo: `${sombraOculta} recomendação(ões) existem e você não consegue ler`,
      detalhe:
        `A organização tem ${entrada.sombraNaOrganizacao} registro(s) em modo sombra e a sua leitura devolveu ${sombra?.length ?? 0}. ` +
        "Não estou dizendo que a IA não preparou nada — estou dizendo que a lista chegou incompleta. A política de leitura de `ai_shadow_decisions` precisa ser revista pelo time de banco.",
      classe: "leitura",
    });
  }

  if ((jornadasEmSombra ?? 0) > 0) {
    motivos.push({
      id: "jornada-em-sombra",
      titulo: `${jornadasEmSombra} jornada(s) de venda abertas e nenhuma mensagem enviada`,
      detalhe:
        "Cada lead que entra recebe um braço sorteado — `ia` ou `humano` — e a jornada nasce preparada. Nada sai: `message_templates` não tem template aprovado, e sem template oficial a IA não fala com ninguém. " +
        "QUEM RESOLVE: o dono, submetendo e aprovando o template na conta oficial da Meta. Enquanto isso, os DOIS braços recebem o mesmo tratamento — o que existe é preparação, não experimento.",
      classe: "configuracao",
    });
  }

  if ((retidas ?? 0) > 0) {
    const acoes = [...new Set(retidasLista!.map((linha) => linha.acao).filter(Boolean))] as string[];
    const retidaPorSombra = acoes.filter((acao) => entrada.acoesRetidasEmSombra.includes(acao));
    motivos.push({
      id: "sombra",
      titulo: `${retidas} recomendação(ões) preparada(s) e retida(s)`,
      detalhe:
        entrada.modoSombraLigado && retidaPorSombra.length
          ? `Modo sombra ligado retém ${retidaPorSombra.join(", ")}. Preparei o payload e não executei — é o comportamento contratado, não uma falha.`
          : "Preparei e não executei. O nível declarado do agente não alcança a ação pedida.",
      classe: "governanca",
    });
    if (semVeredicto.length) {
      motivos.push({
        id: "sem-veredicto",
        titulo: `${semVeredicto.length} sem nenhuma decisão humana`,
        detalhe: `A mais antiga está parada há ${diasDaRetidaMaisAntiga} dia(s). Sem aceite ou recusa eu não aprendo com nenhuma delas — o registro guarda recomendação, decisão e resultado, e faltam as duas últimas colunas.`,
        classe: "assinatura",
      });
    }
  }

  if (propostasVencidas > 0) {
    motivos.push({
      id: "vencidas",
      titulo: `${propostasVencidas} proposta(s) venceram sem assinatura`,
      detalhe: "Passaram do prazo em /approvals e não podem mais ser ativadas. Trabalho preparado e perdido.",
      classe: "assinatura",
    });
  }
  if (propostasVivas > 0) {
    motivos.push({
      id: "aguardando",
      titulo: `${propostasVivas} proposta(s) ainda dá(ão) para assinar`,
      detalhe: "Esperando aprovação humana em /approvals. Eu não ativo sozinho o que gasta dinheiro ou fala com o cliente.",
      classe: "assinatura",
    });
  }

  if (roteamento && roteamento.degradadoPorCusto > 0) {
    motivos.push({
      id: "roteamento",
      titulo: `${roteamento.degradadoPorCusto} de ${roteamento.total} chamadas caíram no modelo local`,
      detalhe:
        "Failover por custo/disponibilidade: eu queria um modelo melhor e respondi com o determinístico. Isto tem conserto — é configuração de provedor, não regra de governança.",
      classe: "configuracao",
    });
  }
  if (roteamento && roteamento.bloqueadoPorGovernanca > 0) {
    motivos.push({
      id: "governanca",
      titulo: `${roteamento.bloqueadoPorGovernanca} chamadas bloqueadas por dado pessoal`,
      detalhe:
        "Dado pessoal não vai para provedor de economia nem de pesquisa. Estas quedas são a regra funcionando; consertá-las seria quebrá-la.",
      classe: "governanca",
    });
  }

  const frase = montarFrase({ postura, execucoes, retidas, sombraOculta, propostasVencidas, propostasVivas, roteamento, jornadasEmSombra });

  return {
    postura,
    execucoes,
    execucao,
    jornadasEmSombra,
    retidas,
    sombraOculta,
    retidasSemVeredicto: semVeredicto.length,
    diasDaRetidaMaisAntiga,
    propostas,
    propostasVencidas,
    propostasVivas,
    aguardandoHumano: semVeredicto.length + propostasVivas,
    roteamento,
    capacidades,
    problemasDoCatalogo: entrada.problemasDoCatalogo,
    motivos,
    frase,
  };
}

function montarFrase(dados: {
  postura: PosturaDaIa;
  execucoes: number | null;
  retidas: number | null;
  sombraOculta: number;
  propostasVencidas: number;
  propostasVivas: number;
  roteamento: RepartoDeRoteamento | null;
  jornadasEmSombra: number | null;
}): string {
  if (dados.postura === "sem_leitura") return "Não consegui ler o meu histórico. Prefiro dizer isso a fingir atividade.";
  if (dados.postura === "executando") return `Executei ${dados.execucoes} ação(ões) registrada(s) — todas com aprovação nomeada.`;
  if (dados.postura === "propondo") {
    const partes: string[] = [];
    if (dados.roteamento?.total) partes.push(`analisei ${dados.roteamento.total} vezes`);
    if (dados.jornadasEmSombra) partes.push(`abri ${dados.jornadasEmSombra} jornadas com o braço sorteado e não enviei nada`);
    if (dados.retidas) partes.push(`preparei ${dados.retidas} ações`);
    if (dados.sombraOculta) partes.push(`preparei outras ${dados.sombraOculta} que esta tela não consegue ler`);
    if (dados.propostasVivas) partes.push(`${dados.propostasVivas} esperam sua assinatura`);
    if (dados.propostasVencidas) partes.push(`${dados.propostasVencidas} venceram sem resposta`);
    return `Não executei nada: ${partes.join(", ")}.`;
  }
  return "Ainda não fiz nada nesta operação. Não é modéstia — é o que o registro mostra.";
}

/* ── EMOJI COM CARGA ──────────────────────────────────────────────────────
   Um por POSTURA, e nenhum como marcador de seção. Cada um é o próprio estado
   desenhado: pausa, ampulheta, engrenagem, interrogação. Se a postura mudar, o
   glifo muda — é informação, não enfeite. */
export const GLIFO_DA_POSTURA: Record<PosturaDaIa, string> = {
  sem_leitura: "❓",
  parada: "⏸",
  propondo: "⏳",
  executando: "⚙️",
};

export const ROTULO_DA_POSTURA: Record<PosturaDaIa, string> = {
  sem_leitura: "sem leitura",
  parada: "parada",
  propondo: "propondo",
  executando: "executando",
};
