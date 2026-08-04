/**
 * QUEM PARTICIPA DA FILA DESTE PROJETO / DESTA CAMPANHA.
 *
 * ── O que existia antes ─────────────────────────────────────────────────────
 *
 * A cascata (`hierarchical-cascade.ts`) distribuía por CARGA e DISPONIBILIDADE:
 * corretor ativo, com WhatsApp conectado, dentro da capacidade, com menos leads
 * em aberto. Nada mais.
 *
 * Isso trata a equipe como intercambiável, e ela não é. Quem trabalha o Arvo não
 * é quem trabalha o Spin Mood; quem atende a campanha de investidor não é quem
 * atende a de primeiro imóvel. Sem essa noção, a lead ia para quem estava com a
 * fila mais curta — e o corretor recebia um cliente de um produto que ele não
 * conhece, no mesmo instante em que o SLA começou a correr.
 *
 * ── A regra, e o degrau que ela NÃO pode quebrar ────────────────────────────
 *
 * O elenco RESTRINGE, nunca amplia. Se existe elenco para o escopo, só entram
 * quem está nele. Quem foi deixado de fora foi deixado de fora de propósito.
 *
 * O caso difícil é: existe elenco, e ninguém dele está elegível agora
 * (desconectado, na capacidade, inativo). Duas saídas erradas e uma certa:
 *
 *   ERRADO  cair para a fila geral. Entregaria a lead exatamente a quem foi
 *           excluído — o oposto do que a regra pediu.
 *   ERRADO  segurar a lead sem dono para sempre. Ninguém olha, o SLA estoura.
 *   CERTO   pular o degrau do corretor e ir para o GERENTE, que é o degrau de
 *           escape que a cascata já tinha. Gerente é supervisor, não é um
 *           corretor excluído do elenco: dar a ele a lead não viola a regra,
 *           e alguém visível vira responsável.
 *
 * Este módulo é puro: sem banco, sem rede. A busca do elenco fica em quem chama.
 */

export type EscopoDeDistribuicao = {
  /** Empreendimento da lead. Aceita os dois nomes que o schema usa. */
  projetoId?: string | null;
  /** Campanha de origem (Meta, portal, etc.). */
  campanhaId?: string | null;
  /**
   * A FONTE (formulário Meta, fonte de portal) por onde a lead entrou.
   *
   * Mora aqui, e não num parâmetro solto, de propósito: `escopo` já é o objeto
   * que os três chamadores montam e passam. Um argumento a mais seria mais um
   * `escopo` para ninguém passar — o defeito que esta entrega encontrou quatro
   * vezes. Campo novo no objeto existente viaja de carona no que já é passado.
   *
   * Serve ao rodízio POR FONTE (`lib/distribution/rodizio-da-fonte.ts`), que
   * substitui o dono único de `meta_lead_sources.default_owner_id`.
   */
  fonteId?: string | null;
};

export type MembroDoElenco = {
  escopo: "projeto" | "campanha";
  escopoId: string;
  profileId: string;
  ativo: boolean;
};

export type ResultadoDoElenco = {
  /** Ids permitidos, ou `null` quando não há elenco (todo mundo participa). */
  permitidos: Set<string> | null;
  /** Qual elenco decidiu — campanha vence projeto. */
  decididoPor: "campanha" | "projeto" | "sem-elenco";
  /** Frase para o histórico de distribuição. Nunca vazia. */
  porque: string;
};

/**
 * Resolve o elenco aplicável a uma lead.
 *
 * CAMPANHA VENCE PROJETO, e o motivo é operacional: a campanha é a decisão mais
 * recente e mais específica. Um projeto pode ter dez campanhas; se o gestor
 * montou um time para a campanha de investidor, é esse time que atende quem
 * clicou nela — mesmo que o projeto inteiro tenha outro time padrão.
 *
 * Membro inativo é ignorado, não removido: manter a linha preserva o histórico
 * de quem já participou, e é o que permite reativar sem recadastrar.
 */
export function resolverElenco(
  escopo: EscopoDeDistribuicao,
  membros: MembroDoElenco[],
): ResultadoDoElenco {
  const ativos = membros.filter((m) => m.ativo);

  const daCampanha = escopo.campanhaId
    ? ativos.filter((m) => m.escopo === "campanha" && m.escopoId === escopo.campanhaId)
    : [];
  if (daCampanha.length > 0) {
    return {
      permitidos: new Set(daCampanha.map((m) => m.profileId)),
      decididoPor: "campanha",
      porque: `Elenco da campanha ${escopo.campanhaId}: ${daCampanha.length} corretor(es) participam.`,
    };
  }

  const doProjeto = escopo.projetoId
    ? ativos.filter((m) => m.escopo === "projeto" && m.escopoId === escopo.projetoId)
    : [];
  if (doProjeto.length > 0) {
    return {
      permitidos: new Set(doProjeto.map((m) => m.profileId)),
      decididoPor: "projeto",
      porque: `Elenco do empreendimento ${escopo.projetoId}: ${doProjeto.length} corretor(es) participam.`,
    };
  }

  return {
    permitidos: null,
    decididoPor: "sem-elenco",
    porque: "Nenhum elenco cadastrado para este escopo — a fila segue aberta a toda a equipe.",
  };
}

export type FiltragemDoElenco<T> = {
  elegiveis: T[];
  /** `true` quando o elenco existia e esvaziou a lista — quem chama deve pular para o gerente. */
  elencoEsvaziou: boolean;
  porque: string;
};

/**
 * Aplica o elenco sobre os candidatos que a cascata já considerou elegíveis
 * (ativos, conectados, dentro da capacidade).
 *
 * A ORDEM IMPORTA e é esta de propósito: o elenco entra DEPOIS dos filtros de
 * disponibilidade, não antes. Assim `elencoEsvaziou` significa exatamente "o
 * time deste escopo existe mas ninguém dele pode atender agora" — que é a
 * informação que o gerente precisa ler no histórico. Filtrar na ordem inversa
 * confundiria "não está no time" com "está indisponível".
 */
export function aplicarElenco<T extends { id: string }>(
  candidatos: T[],
  elenco: ResultadoDoElenco,
): FiltragemDoElenco<T> {
  if (elenco.permitidos === null) {
    return { elegiveis: candidatos, elencoEsvaziou: false, porque: elenco.porque };
  }
  const dentro = candidatos.filter((c) => elenco.permitidos!.has(c.id));
  if (dentro.length > 0) {
    return {
      elegiveis: dentro,
      elencoEsvaziou: false,
      porque: `${elenco.porque} ${dentro.length} de ${candidatos.length} candidato(s) disponíveis pertencem ao elenco.`,
    };
  }
  return {
    elegiveis: [],
    elencoEsvaziou: true,
    porque:
      `${elenco.porque} NENHUM deles está disponível agora ` +
      `(entre ${candidatos.length} candidato(s) da equipe, zero pertencem ao elenco). ` +
      "A lead sobe para o gerente em vez de ir a quem foi deixado fora do escopo.",
  };
}
