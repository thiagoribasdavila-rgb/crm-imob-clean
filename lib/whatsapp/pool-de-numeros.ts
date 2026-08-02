/**
 * POOL DE NÚMEROS DO WHATSAPP — a operação não cai porque um número caiu.
 *
 * ── POR QUE ELE EXISTE ──────────────────────────────────────────────────────
 *
 * Decisão do dono em 02/08/2026: recuperar a base sem trava de consentimento,
 * ciente do risco, e trabalhar com DEZ números em rodízio para a operação não
 * parar se um degradar.
 *
 * O risco que os dez números resolvem é concreto e tem nome: a Meta rebaixa a
 * qualidade de um número por reclamação e bloqueio, e o rebaixamento derruba o
 * limite diário antes de derrubar o número. Com UM número, esse rebaixamento
 * para o atendimento inteiro — inclusive o das leads boas e o da IA noturna.
 * Com dez, ele tira um do rodízio.
 *
 * ── A REGRA QUE TORNA O RODÍZIO CONFIÁVEL ───────────────────────────────────
 *
 * Quando não há número saudável com folga, este módulo DIZ ISSO. Ele não escolhe
 * o menos ruim e segue.
 *
 * A tentação é óbvia — "usa o primeiro e resolve depois". Ela é o caminho para o
 * segundo número queimar em seguida, e o terceiro, porque a causa (volume alto
 * demais, ou lista com muita reclamação) continua lá. Um pool que sempre devolve
 * um número transforma dez ativos em dez queimados.
 *
 * `escolherNumero` devolve ou um número, ou o MOTIVO de não ter devolvido. Quem
 * chama publica o motivo e para. É a mesma forma do livro de execuções: nunca
 * falhar calado.
 *
 * ── OS LIMITES SÃO OS DA META, NÃO INVENTADOS ───────────────────────────────
 *
 * A Meta escalona o limite de conversas iniciadas em 24h por número:
 * 250, 1.000, 10.000 e sem limite. O número sobe de degrau conforme mantém
 * qualidade. `limiteDiario` recebe o degrau vigente daquele número — ele não é
 * chutado aqui, é lido de quem administra a conta.
 *
 * Módulo PURO: sem rede, sem banco, sem relógio implícito. O "agora" entra por
 * parâmetro, para o contrato conseguir testar a virada do dia sem esperar um.
 */

/** A qualidade que a Meta atribui ao número. Verde é o único que opera cheio. */
export type QualidadeDoNumero = "verde" | "amarelo" | "vermelho" | "desconhecida";

export type NumeroDoPool = {
  id: string;
  /** O `phone_number_id` da conta. NUNCA o segredo, nunca o token. */
  phoneNumberId: string;
  /** Rótulo humano para a tela. O telefone em si não precisa aparecer no log. */
  rotulo: string;
  qualidade: QualidadeDoNumero;
  /** Degrau da Meta: 250 | 1000 | 10000 | Infinity. Lido, não chutado. */
  limiteDiario: number;
  /** Conversas iniciadas por este número nas últimas 24h. */
  usadasEm24h: number;
  /** Fora do rodízio por decisão humana. Diferente de "degradado". */
  pausadoPorPessoa: boolean;
  /** Instante do último envio, em ms. `null` = nunca usou. */
  ultimoUsoEm: number | null;
};

export type EscolhaDeNumero =
  | { escolhido: true; numero: NumeroDoPool; folgaRestante: number; porque: string }
  | { escolhido: false; motivo: string; detalhe: string; numerosAvaliados: number };

/**
 * A margem que NÃO se usa.
 *
 * Trabalhar até 100% do degrau é chegar ao limite exatamente quando o volume
 * sobe — e o que sobe o volume é justamente o dia em que a campanha vai bem.
 * 85% deixa folga para a resposta do cliente, que também consome janela.
 */
export const FRACAO_UTILIZAVEL = 0.85;

/** Amarelo opera, mas com metade da folga: ele está a um passo do vermelho. */
export const FATOR_DO_AMARELO = 0.5;

function folgaDe(n: NumeroDoPool): number {
  if (n.qualidade === "vermelho") return 0;
  const base = Math.floor(n.limiteDiario * FRACAO_UTILIZAVEL);
  const teto = n.qualidade === "amarelo" ? Math.floor(base * FATOR_DO_AMARELO) : base;
  return Math.max(0, teto - n.usadasEm24h);
}

/**
 * Escolhe o número para o próximo envio.
 *
 * A ordem é: qualidade primeiro, folga depois, e o menos recentemente usado como
 * desempate. Ordenar por folga primeiro concentraria a carga no número de maior
 * degrau — que é justamente o mais valioso e o que menos se quer arriscar.
 *
 * O desempate por "menos recentemente usado" é o que espalha de verdade. Sem
 * ele, dois números com a mesma folga fariam o primeiro da lista levar tudo.
 */
export function escolherNumero(pool: NumeroDoPool[], agoraMs: number): EscolhaDeNumero {
  if (!pool.length) {
    return {
      escolhido: false,
      motivo: "pool_vazio",
      detalhe: "Nenhum número cadastrado no rodízio. Não é 'sem folga': é sem número.",
      numerosAvaliados: 0,
    };
  }

  const ativos = pool.filter((n) => !n.pausadoPorPessoa);
  if (!ativos.length) {
    return {
      escolhido: false,
      motivo: "todos_pausados_por_pessoa",
      detalhe: `Os ${pool.length} números do rodízio estão pausados por decisão humana — não por degradação.`,
      numerosAvaliados: pool.length,
    };
  }

  const saudaveis = ativos.filter((n) => n.qualidade !== "vermelho");
  if (!saudaveis.length) {
    return {
      escolhido: false,
      motivo: "todos_em_vermelho",
      detalhe:
        `Os ${ativos.length} números ativos estão com qualidade VERMELHA na Meta. ` +
        "Enviar agora acelera o banimento em vez de evitá-lo — a causa é a lista ou o volume, e trocar de número não a resolve.",
      numerosAvaliados: pool.length,
    };
  }

  const comFolga = saudaveis
    .map((n) => ({ n, folga: folgaDe(n) }))
    .filter((x) => x.folga > 0);

  if (!comFolga.length) {
    const verdes = saudaveis.filter((n) => n.qualidade === "verde").length;
    return {
      escolhido: false,
      motivo: "sem_folga_hoje",
      detalhe:
        `Os ${saudaveis.length} números saudáveis (${verdes} verde(s)) já usaram a cota de 24h. ` +
        `A cota utilizável é ${Math.round(FRACAO_UTILIZAVEL * 100)}% do degrau da Meta, e a margem existe para a resposta do cliente.`,
      numerosAvaliados: pool.length,
    };
  }

  const pesoDaQualidade = (q: QualidadeDoNumero) => (q === "verde" ? 0 : q === "amarelo" ? 1 : 2);
  comFolga.sort(
    (a, b) =>
      pesoDaQualidade(a.n.qualidade) - pesoDaQualidade(b.n.qualidade) ||
      (a.n.ultimoUsoEm ?? 0) - (b.n.ultimoUsoEm ?? 0) ||
      b.folga - a.folga ||
      a.n.id.localeCompare(b.n.id),
  );

  const alvo = comFolga[0]!;
  const desdeOUltimoUso =
    alvo.n.ultimoUsoEm === null ? "nunca usado" : `${Math.round((agoraMs - alvo.n.ultimoUsoEm) / 60000)} min desde o último envio`;

  return {
    escolhido: true,
    numero: alvo.n,
    folgaRestante: alvo.folga,
    porque: `qualidade ${alvo.n.qualidade}, ${alvo.folga} conversa(s) de folga, ${desdeOUltimoUso}`,
  };
}

/**
 * A saúde do rodízio inteiro, para a tela e para o portão.
 *
 * `podeOperarHoje` é a pergunta que o diretor faz. Ela é `false` quando não há
 * NENHUM número disponível — e nesse caso `porque` diz qual das quatro causas é,
 * porque "pool vazio", "todos pausados", "todos vermelhos" e "cota esgotada"
 * pedem quatro ações diferentes.
 */
export function saudeDoPool(pool: NumeroDoPool[], agoraMs: number) {
  const escolha = escolherNumero(pool, agoraMs);
  const folgaTotal = pool.filter((n) => !n.pausadoPorPessoa).reduce((s, n) => s + folgaDe(n), 0);
  return {
    total: pool.length,
    verdes: pool.filter((n) => n.qualidade === "verde").length,
    amarelos: pool.filter((n) => n.qualidade === "amarelo").length,
    vermelhos: pool.filter((n) => n.qualidade === "vermelho").length,
    pausados: pool.filter((n) => n.pausadoPorPessoa).length,
    /** Quantas conversas o rodízio inteiro ainda comporta nas próximas 24h. */
    folgaTotal,
    podeOperarHoje: escolha.escolhido,
    porque: escolha.escolhido ? escolha.porque : escolha.detalhe,
    motivo: escolha.escolhido ? null : escolha.motivo,
  };
}

/**
 * Quantos dias o rodízio leva para varrer uma fila, na cadência de hoje.
 *
 * Existe para a tela responder "em quanto tempo eu falo com as 252?" sem
 * ninguém abrir planilha. Devolve `null` quando a folga é zero — dividir por
 * zero viraria "∞ dias", que é uma resposta pior que "não dá para dizer".
 */
export function diasParaVarrerAFila(pool: NumeroDoPool[], tamanhoDaFila: number, agoraMs: number): number | null {
  const { folgaTotal } = saudeDoPool(pool, agoraMs);
  if (folgaTotal <= 0) return null;
  return Math.ceil(tamanhoDaFila / folgaTotal);
}
