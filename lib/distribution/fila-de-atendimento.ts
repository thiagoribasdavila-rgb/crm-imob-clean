/**
 * A FILA DE ATENDIMENTO — de quem é a vez.
 *
 * ── O que existia antes ─────────────────────────────────────────────────────
 *
 * `elenco-por-escopo.ts` responde QUEM PODE receber a lead deste empreendimento
 * ou desta campanha. Ele restringe um conjunto; não ordena ninguém. Decidido o
 * conjunto, a cascata escolhia por MENOR CARGA — quem tem menos leads em aberto
 * recebe a próxima.
 *
 * Menor carga é justa em média e injusta no dia. Quem fecha rápido esvazia a
 * carteira e volta a receber; quem está trabalhando cinco atendimentos longos
 * fica sem lead nova por dias. Nenhum dos dois consegue prever quando é a sua
 * vez, e "quando é a minha vez" é a pergunta que o corretor faz de manhã.
 *
 * ── A regra, e por que o ponteiro é DERIVADO ────────────────────────────────
 *
 * Rodízio de verdade: a fila tem uma ordem fixa (1º, 2º, 3º…) que a liderança
 * monta, e a próxima lead vai para quem vem DEPOIS de quem recebeu por último.
 * Deu a volta, recomeça.
 *
 * O ponteiro NÃO é guardado em coluna. Ele sai de quem recebeu por último de
 * verdade — `lead_distribution_history` cruzado com o escopo da lead. Guardar o
 * ponteiro criaria uma segunda verdade: bastaria uma lead atribuída à mão, por
 * transferência ou por cobertura de ausência, para o ponteiro apontar para um
 * lugar que a operação não viveu. Derivado, ele não tem como divergir do que
 * aconteceu.
 *
 * ── QUEM É PULADO NÃO É EXPULSO ─────────────────────────────────────────────
 *
 * A vez pode cair em alguém que não pode atender agora (fora da fila, sem
 * WhatsApp, na capacidade). A lead não espera: passa para o próximo elegível. O
 * motivo do pulo sai escrito, porque corretor que vê a vez passar sem
 * explicação conclui que o rodízio é fachada — e ele estaria certo em concluir,
 * se ninguém escrevesse.
 *
 * Este módulo é puro: sem banco, sem rede, sem relógio. Quem chama traz os
 * fatos.
 */

export type MembroDaFila = {
  profileId: string;
  /** Fora da fila (`ativo: false`) preserva o histórico e permite voltar sem recadastrar. */
  ativo: boolean;
  /** Ordem escolhida pela liderança. `null` = nunca foi ordenado à mão. */
  posicao: number | null;
  /** Quando entrou na fila (ISO). Desempate estável de quem não tem posição. */
  entrouEm: string | null;
};

export type EstadoDoCorretor = {
  profileId: string;
  /** Última lead DESTE escopo que caiu para ele (ISO), ou `null` se nunca recebeu. */
  ultimaLeadEm: string | null;
  /** Pode receber AGORA (online, com WhatsApp, dentro da capacidade). */
  elegivelAgora: boolean;
  /** Por que não pode, quando não pode. Frase curta, mostrada na tela. */
  porQueNao?: string | null;
};

export type LugarNaFila = {
  profileId: string;
  /** 1-based, na ordem do rodízio. É o número que a tela mostra. */
  ordem: number;
  ultimaLeadEm: string | null;
  elegivelAgora: boolean;
  porQueNao: string | null;
  /** `true` no único que recebe a próxima lead. */
  proximo: boolean;
  /** Preenchido em quem TERIA a vez e foi pulado. */
  puladoPorque: string | null;
};

export type FilaDeAtendimento = {
  lugares: LugarNaFila[];
  /** Quem recebe a próxima lead, ou `null` se ninguém pode agora. */
  proximoId: string | null;
  /** Frase para o histórico de distribuição. Nunca vazia. */
  porque: string;
};

const instante = (iso: string | null | undefined): number => {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const marca = Date.parse(iso);
  return Number.isFinite(marca) ? marca : Number.NEGATIVE_INFINITY;
};

/**
 * A ordem do ciclo, estável e total.
 *
 * `posicao` manda quando existe. Quem nunca foi ordenado à mão vai para o fim,
 * na ordem em que entrou — assim adicionar alguém não embaralha a fila de quem
 * já estava nela. O id fecha o desempate: sem ele, duas pessoas que entraram no
 * mesmo instante trocariam de lugar entre uma leitura e outra, e o corretor
 * veria a fila "se mexer" sozinha.
 */
function ordemDoCiclo(a: MembroDaFila, b: MembroDaFila): number {
  const pa = a.posicao ?? Number.POSITIVE_INFINITY;
  const pb = b.posicao ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  const ea = instante(a.entrouEm);
  const eb = instante(b.entrouEm);
  if (ea !== eb) return ea - eb;
  return a.profileId.localeCompare(b.profileId);
}

/**
 * Monta a fila e diz de quem é a vez.
 *
 * `membros` pode vir com gente fora da fila (`ativo: false`) — eles são
 * descartados aqui, não antes, para que quem chama possa mostrar a lista
 * inteira na tela e ainda assim receber a decisão certa.
 */
export function montarFila(
  membros: readonly MembroDaFila[],
  estados: readonly EstadoDoCorretor[],
): FilaDeAtendimento {
  const porId = new Map(estados.map((e) => [e.profileId, e]));
  const naFila = membros.filter((m) => m.ativo).slice().sort(ordemDoCiclo);

  if (naFila.length === 0) {
    return {
      lugares: [],
      proximoId: null,
      porque: "Nenhum corretor na fila de atendimento deste escopo.",
    };
  }

  const estadoDe = (id: string): EstadoDoCorretor =>
    porId.get(id) ?? { profileId: id, ultimaLeadEm: null, elegivelAgora: false, porQueNao: "sem estado conhecido" };

  // ── O PONTEIRO ────────────────────────────────────────────────────────────
  //
  // Quem, ENTRE OS QUE ESTÃO NA FILA, recebeu por último. Se o último a receber
  // saiu da fila desde então, o ponteiro cai em quem sobrou com a marca mais
  // recente — que é o mais próximo possível da verdade sem inventar ordem.
  let ancora = -1;
  let marcaDaAncora = Number.NEGATIVE_INFINITY;
  naFila.forEach((membro, indice) => {
    const marca = instante(estadoDe(membro.profileId).ultimaLeadEm);
    if (marca > marcaDaAncora) {
      marcaDaAncora = marca;
      ancora = indice;
    }
  });

  // Ninguém nunca recebeu neste escopo: a vez é do primeiro da ordem.
  const inicio = marcaDaAncora === Number.NEGATIVE_INFINITY ? 0 : (ancora + 1) % naFila.length;

  const pulados: Array<{ profileId: string; porque: string }> = [];
  let escolhido = -1;
  for (let passo = 0; passo < naFila.length; passo += 1) {
    const indice = (inicio + passo) % naFila.length;
    const estado = estadoDe(naFila[indice].profileId);
    if (estado.elegivelAgora) {
      escolhido = indice;
      break;
    }
    pulados.push({
      profileId: naFila[indice].profileId,
      porque: estado.porQueNao || "indisponível agora",
    });
  }

  const puladoPorId = new Map(pulados.map((p) => [p.profileId, p.porque]));

  const lugares: LugarNaFila[] = naFila.map((membro, indice) => {
    const estado = estadoDe(membro.profileId);
    return {
      profileId: membro.profileId,
      ordem: indice + 1,
      ultimaLeadEm: estado.ultimaLeadEm,
      elegivelAgora: estado.elegivelAgora,
      porQueNao: estado.elegivelAgora ? null : estado.porQueNao || "indisponível agora",
      proximo: indice === escolhido,
      puladoPorque: puladoPorId.get(membro.profileId) ?? null,
    };
  });

  if (escolhido === -1) {
    return {
      lugares,
      proximoId: null,
      porque:
        `Fila de atendimento com ${naFila.length} corretor(es), e NENHUM pode receber agora ` +
        `(${pulados.map((p) => p.porque).join("; ")}).`,
    };
  }

  const notaDoPulo = pulados.length
    ? `Pulou ${pulados.length} na frente (${pulados.map((p) => p.porque).join("; ")}). `
    : "";
  return {
    lugares,
    proximoId: naFila[escolhido].profileId,
    porque:
      `${notaDoPulo}Rodízio da fila de atendimento: era a vez do ${escolhido + 1}º de ${naFila.length}.`,
  };
}

/**
 * Renumera a fila em 1..N depois de uma entrada, uma saída ou um movimento.
 *
 * Sem renumerar, `posicao` vira um contador furado: sai o 2º de cinco e a fila
 * passa a ser 1, 3, 4, 5 — que continua ordenando certo, mas mostra ao gestor
 * uma lista com buraco, e o próximo "subir" tem que adivinhar o incremento.
 */
export function renumerar(membros: readonly MembroDaFila[]): Array<{ profileId: string; posicao: number }> {
  return membros
    .filter((m) => m.ativo)
    .slice()
    .sort(ordemDoCiclo)
    .map((m, indice) => ({ profileId: m.profileId, posicao: indice + 1 }));
}

/**
 * Move alguém uma casa para cima ou para baixo e devolve a fila inteira
 * renumerada.
 *
 * Devolve a ordem ATUAL, sem erro, quando o movimento não existe (o 1º subindo,
 * o último descendo, alguém que não está na fila). Recusar com erro faria a tela
 * mostrar mensagem vermelha para um clique que simplesmente não tem para onde
 * ir — o botão já vem desabilitado nesses casos.
 */
export function mover(
  membros: readonly MembroDaFila[],
  profileId: string,
  direcao: "subir" | "descer",
): Array<{ profileId: string; posicao: number }> {
  const ordenados = membros.filter((m) => m.ativo).slice().sort(ordemDoCiclo);
  const de = ordenados.findIndex((m) => m.profileId === profileId);
  if (de === -1) return ordenados.map((m, i) => ({ profileId: m.profileId, posicao: i + 1 }));

  const para = direcao === "subir" ? de - 1 : de + 1;
  if (para < 0 || para >= ordenados.length) {
    return ordenados.map((m, i) => ({ profileId: m.profileId, posicao: i + 1 }));
  }

  const [movido] = ordenados.splice(de, 1);
  ordenados.splice(para, 0, movido);
  return ordenados.map((m, i) => ({ profileId: m.profileId, posicao: i + 1 }));
}
