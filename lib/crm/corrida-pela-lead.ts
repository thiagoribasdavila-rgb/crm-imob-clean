/**
 * DUAS PESSOAS AGINDO NA MESMA LEAD — quem ganha, e o que a perdedora lê.
 *
 * ── O QUE FOI MEDIDO NO BANCO VIVO (pozbrcsfthnhmnebfoxv, 2026-08-02) ───────
 *
 * `lead_assignment_reservations` tem 10 linhas e TODAS estão `accepted`. Zero
 * `pending`, zero `expired`. Quer dizer: o mecanismo de reserva existe, mas
 * nunca houve uma reserva esperando aceite — porque as 10 nasceram já aceitas
 * pelo balcão do acervo (`reservar_leads_do_acervo` grava `status='accepted'`
 * de propósito). `accept_lead_assignment` nunca foi exercitada sob disputa.
 *
 * `ai_shadow_decisions` tem 20 linhas retidas e não decididas, apontando para
 * 20 leads DISTINTAS. Três pessoas (2 gerentes + 1 diretor, medido em
 * `profiles`) enxergam esse painel no Centro de Comando. Duas delas no mesmo
 * card é a corrida real, disponível hoje, sem nenhum dado novo.
 *
 * ── AS PROTEÇÕES, LIDAS DO CATÁLOGO E NÃO DO COMENTÁRIO ─────────────────────
 *
 * Cada caminho abaixo foi conferido em `pg_proc.prosrc` / `pg_indexes` da
 * produção. O que o comentário do repositório afirma não entrou aqui; o que o
 * corpo da função no banco faz, entrou. `scripts/check-corrida-pela-lead.mjs`
 * refaz essa conferência contra o banco a cada execução, para que a tabela
 * abaixo não vire folclore.
 *
 * ── A DIFERENÇA ENTRE "PERDEU" E "NÃO SOUBE QUE PERDEU" ─────────────────────
 *
 * Um caminho protegido devolve conflito. Devolver conflito não é o suficiente:
 * "A lead mudou de responsável" manda a pessoa recarregar a tela e adivinhar. O
 * que ela precisa saber, num CRM imobiliário, é que OUTRA PESSOA pegou aquela
 * lead e QUEM — porque a ação seguinte dela não é recarregar, é falar com quem
 * pegou antes que os dois liguem para o mesmo cliente.
 */

/** As formas de proteção que contam como proteção. Lista fechada de propósito. */
export const PROTECOES = {
  /** `select … for update` na linha da lead, dentro da transação da RPC. */
  travaDeLinha: "for-update",
  /** `for update skip locked`: quem chegou depois pula a linha em vez de esperar. */
  travaComPulo: "for-update-skip-locked",
  /** `pg_advisory_xact_lock`: serializa a operação inteira por chave. */
  travaDeSessao: "advisory-lock",
  /** O chamador manda o dono que ele VIU, e a função recusa se divergir. */
  donoEsperado: "dono-esperado",
  /** `update … where <condição> ` + conferência de quantas linhas casaram. */
  escritaCondicional: "escrita-condicional",
  /** Índice único parcial no banco: o segundo insert simplesmente não entra. */
  indiceUnico: "indice-unico",
  /** Nada. O segundo escritor sobrescreve o primeiro e ninguém fica sabendo. */
  nenhuma: "nenhuma",
} as const;

export type Protecao = (typeof PROTECOES)[keyof typeof PROTECOES];

export type CaminhoQueDisputa = {
  /** Como uma pessoa chamaria esse ato. */
  nome: string;
  /** Onde o ato começa (arquivo do produto) e onde ele termina (função no banco). */
  entrada: string;
  motor: string | null;
  /** O que ele escreve na lead — é isto que dois cliques disputam. */
  escreve: string;
  protecoes: Protecao[];
  /**
   * O trecho que PROVA a proteção dentro de `pg_proc.prosrc` na produção.
   * Vazio quando a proteção é do lado do Node (aí quem prova é o ensaio).
   */
  provaNoCatalogo: string[];
  /** Código que o banco levanta quando a corrida é perdida. */
  codigoDeConflito: string | null;
};

/**
 * O INVENTÁRIO. Somar um caminho novo aqui é barato; esquecer de somar é o que
 * custa caro, e é por isso que o portão compara esta lista com o catálogo.
 */
export const CAMINHOS_QUE_DISPUTAM_A_LEAD: CaminhoQueDisputa[] = [
  {
    nome: "Distribuição governada da liderança",
    entrada: "app/api/v1/crm/distribution/route.ts (action=distribute)",
    motor: "distribute_project_leads_v3",
    escreve: "leads.assigned_to",
    protecoes: [PROTECOES.travaDeSessao, PROTECOES.travaComPulo, PROTECOES.escritaCondicional],
    provaNoCatalogo: ["pg_advisory_xact_lock", "for update of l skip locked", "assigned_to is null", "distribution_owner_conflict"],
    codigoDeConflito: "distribution_owner_conflict",
  },
  {
    nome: "Reserva com prazo de aceite",
    entrada: "app/api/v1/crm/distribution/route.ts (action=distribute)",
    motor: "distribute_project_leads_v4",
    escreve: "lead_assignment_reservations (uma pendente por lead)",
    protecoes: [PROTECOES.indiceUnico],
    provaNoCatalogo: ["lead_assignment_reservations", "status='superseded'"],
    codigoDeConflito: null,
  },
  {
    nome: "Aceite da fila pelo corretor",
    entrada: "app/api/v1/leads/[id]/route.ts (action=accept_assignment)",
    motor: "accept_lead_assignment",
    escreve: "lead_assignment_reservations.status",
    protecoes: [PROTECOES.travaDeLinha, PROTECOES.escritaCondicional],
    provaNoCatalogo: ["for update", "reservation_owner_changed", "reservation_expired"],
    codigoDeConflito: "reservation_owner_changed",
  },
  {
    nome: "Corretor se servindo no acervo de resgate",
    entrada: "app/api/v1/crm/acervo/route.ts",
    motor: "reservar_leads_do_acervo",
    escreve: "leads.assigned_to + leads.assigned_user_id",
    protecoes: [PROTECOES.travaDeSessao, PROTECOES.travaComPulo, PROTECOES.escritaCondicional],
    provaNoCatalogo: ["pg_advisory_xact_lock", "for update skip locked", "l.assigned_to is null"],
    codigoDeConflito: null,
  },
  {
    nome: "Transferência de uma lead pela liderança",
    entrada: "app/api/v1/leads/[id]/transfer/route.ts",
    motor: "transfer_single_lead",
    escreve: "leads.assigned_to",
    protecoes: [PROTECOES.travaDeLinha, PROTECOES.donoEsperado],
    provaNoCatalogo: ["for update", "p_expected_owner_id", "transfer_owner_conflict"],
    codigoDeConflito: "transfer_owner_conflict",
  },
  {
    nome: "Movimento de etapa (uma a uma e em lote)",
    entrada: "app/api/v1/crm/leads/bulk-stage/route.ts",
    motor: "move_pipeline_lead",
    escreve: "leads.status + pipeline_stage_moves",
    protecoes: [PROTECOES.travaDeLinha, PROTECOES.donoEsperado],
    provaNoCatalogo: ["for update", "p_expected_from_stage", "pipeline_stage_conflict"],
    codigoDeConflito: "pipeline_stage_conflict",
  },
  {
    nome: "Aprovação de decisão da IA no Centro de Comando",
    entrada: "app/api/v1/crm/decisoes-pendentes/route.ts",
    motor: null,
    escreve: "leads.assigned_to + ai_shadow_decisions.decisao_humana",
    // Este é o único da lista cujo motor é o Node, e o único que precisou ser
    // consertado: a proteção abaixo é a que este arquivo passou a fazer.
    protecoes: [PROTECOES.escritaCondicional, PROTECOES.donoEsperado],
    provaNoCatalogo: [],
    codigoDeConflito: "DECISAO_JA_RESOLVIDA",
  },
];

/** Um caminho está desprotegido quando a única "proteção" que declara é nenhuma. */
export function estaDesprotegido(caminho: CaminhoQueDisputa): boolean {
  return caminho.protecoes.length === 0 || caminho.protecoes.every((p) => p === PROTECOES.nenhuma);
}

// ───────────────────────────────────────────────────────────────────────────
// A FRASE DA PERDEDORA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Nome de gente, nunca identificador.
 *
 * Um UUID no lugar do nome transforma "a Ana pegou" em "alguém pegou" — e a
 * pessoa que lê continua sem saber com quem falar. Quando o cadastro não tem
 * nome, dizer isso é mais útil do que despejar o UUID: o rótulo é acionável
 * ("o cadastro está incompleto"), o UUID não é.
 */
export function rotuloDeQuemGanhou(nome: string | null | undefined): string {
  const limpo = typeof nome === "string" ? nome.trim() : "";
  if (!limpo) return "outra pessoa da equipe (cadastro sem nome)";
  if (/^[0-9a-f-]{16,}$/i.test(limpo)) return "outra pessoa da equipe (cadastro sem nome)";
  return limpo;
}

export type CorridaPerdida = {
  /** O que a pessoa tentou fazer, na voz dela. */
  tentou: string;
  /** Quem chegou primeiro. */
  quemGanhou: string | null;
  /** O que a pessoa que ganhou fez. */
  oQueFezQuemGanhou: string;
  /** Quando, em ISO. Vira "há X min" só na tela. */
  quando?: string | null;
};

/**
 * A frase que a perdedora lê. Ela tem três obrigações, nesta ordem:
 *
 * 1. dizer que **outra pessoa** chegou primeiro — não "erro", não "conflito";
 * 2. dizer **quem**, com nome;
 * 3. dizer **o que fazer agora**, que num CRM imobiliário nunca é "recarregue":
 *    é falar com quem pegou, antes que os dois liguem para o mesmo cliente.
 *
 * Quando o nome não pôde ser lido, a frase NÃO inventa e NÃO some: ela diz que
 * outra pessoa chegou primeiro e que o nome não pôde ser conferido. Falha de
 * leitura não vira "ninguém pegou".
 */
export function fraseDaCorridaPerdida(entrada: CorridaPerdida): string {
  const quem = entrada.quemGanhou ? rotuloDeQuemGanhou(entrada.quemGanhou) : null;
  const abertura = quem
    ? `${quem} chegou primeiro nesta lead: ${entrada.oQueFezQuemGanhou}.`
    : `Outra pessoa chegou primeiro nesta lead: ${entrada.oQueFezQuemGanhou}. Não foi possível conferir o nome agora.`;
  return `${abertura} ${entrada.tentou} não foi aplicada — nada foi feito em dobro. Fale com quem pegou antes de ligar para o cliente.`;
}

/**
 * Traduz o código cru que o banco levanta na frase de cima.
 *
 * Os códigos vêm dos corpos lidos na produção; a lista é fechada porque um
 * código desconhecido não pode virar "outra pessoa pegou" sem prova — isso
 * seria fabricar um culpado. Desconhecido devolve `null` e quem chama mantém a
 * mensagem técnica.
 */
export function traduzirConflitoDoBanco(codigo: string, contexto: Omit<CorridaPerdida, "oQueFezQuemGanhou">): string | null {
  const c = codigo.toLowerCase();
  if (c.includes("transfer_owner_conflict")) {
    return fraseDaCorridaPerdida({ ...contexto, oQueFezQuemGanhou: "a lead já está com outro responsável" });
  }
  if (c.includes("distribution_owner_conflict")) {
    return fraseDaCorridaPerdida({ ...contexto, oQueFezQuemGanhou: "a lead foi distribuída no mesmo instante" });
  }
  if (c.includes("reservation_owner_changed")) {
    return fraseDaCorridaPerdida({ ...contexto, oQueFezQuemGanhou: "a lead trocou de responsável antes do seu aceite" });
  }
  if (c.includes("pipeline_stage_conflict")) {
    return fraseDaCorridaPerdida({ ...contexto, oQueFezQuemGanhou: "a etapa desta lead já tinha sido movida" });
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// O ÁRBITRO DA APROVAÇÃO DE DECISÃO — o caminho onde as DUAS venciam
// ───────────────────────────────────────────────────────────────────────────

/**
 * A porta estreita que o árbitro usa. Estreita de propósito: o ensaio de
 * concorrência precisa poder implementá-la inteira sem simular um cliente
 * Supabase, e o adaptador de produção precisa poder cumpri-la sem nenhuma
 * regra de negócio dentro dele.
 *
 * Todo método devolve `casou` — quantas linhas a escrita alcançou. É a lição
 * que este repositório já pagou: no PostgREST, um `update` que não casa com
 * linha nenhuma devolve 200 SEM erro. "Não deu erro" nunca foi "gravou", e é
 * exatamente esse 200 mudo que deixava as duas pessoas vencerem.
 */
export type PortaDaDecisao = {
  /**
   * Reivindica a decisão: grava o julgamento SÓ SE ninguém tiver gravado antes.
   * `casou: 0` significa que outra pessoa reivindicou no intervalo.
   */
  reivindicar(input: { registroId: string; decisao: string; decididoPor: string }): Promise<{ ok: true; casou: number } | { ok: false; detalhe: string }>;
  /** Desfaz a reivindicação quando a execução falha. Só devolve ao estado nulo. */
  devolverReivindicacao(input: { registroId: string; decididoPor: string }): Promise<{ ok: boolean }>;
  /**
   * Passa a lead adiante SÓ SE ela ainda estiver com o dono que a decisão viu.
   * `casou: 0` significa que a lead trocou de mãos por outro caminho.
   */
  moverLead(input: { leadId: string; deQuem: string | null; paraQuem: string }): Promise<{ ok: true; casou: number } | { ok: false; detalhe: string }>;
  /** Quem reivindicou a decisão, para a frase da perdedora. Leitura pura. */
  quemDecidiu(registroId: string): Promise<{ nome: string | null; decisao: string | null }>;
  /** Com quem a lead está agora, para a frase da perdedora. Leitura pura. */
  quemEstaComALead(leadId: string): Promise<{ nome: string | null }>;
};

export type VereditoDaDecisao =
  | { desfecho: "aplicada"; leadId: string }
  | { desfecho: "recusa-registrada" }
  | { desfecho: "corrida-perdida"; codigo: string; mensagem: string }
  | { desfecho: "falha"; codigo: string; mensagem: string };

/**
 * O ÁRBITRO. Ordem das três escritas, e por que ela mudou.
 *
 * ── Como era, e por que as DUAS venciam ────────────────────────────────────
 *
 * A rota lia a linha, conferia `decisao_humana`, movia a lead sem condição
 * nenhuma sobre o dono, e só então gravava o julgamento — também sem condição.
 * Duas pessoas no mesmo card, no mesmo segundo: as duas leem `null`, as duas
 * passam pela guarda, as duas movem a lead, as duas gravam. As duas recebem
 * "Feito". O pior caso não é o empate: é uma aprovar e a outra recusar — a que
 * recusou lê *"A lead continua com o dono atual"* enquanto a lead já mudou de
 * mãos. A tela mente sem ninguém ter escrito uma linha errada.
 *
 * ── Como é agora ───────────────────────────────────────────────────────────
 *
 * 1. REIVINDICA primeiro, com escrita condicional (`decisao_humana is null`).
 *    Só uma das duas casa uma linha. A outra sai aqui, com nome.
 * 2. SÓ ENTÃO executa, também condicional: a lead só se move se ainda estiver
 *    com o dono que a decisão viu (`deQuem`). Medido em 2026-08-02: as 20
 *    decisões da fila têm `deQuem` preenchido e as 20 casam com o dono atual —
 *    a guarda não fecha nenhuma porta que hoje esteja aberta.
 * 3. Se a execução não casar, DEVOLVE a reivindicação. Isto é o que preserva a
 *    regra que a rota já tinha escrita — nunca deixar registrado que um humano
 *    aprovou uma redistribuição que não aconteceu.
 *
 * A inversão da ordem é a única forma de a reivindicação ser um cadeado. Feita
 * por último, ela é só um registro; feita primeiro, ela é quem escolhe.
 */
export async function julgarDecisao(
  porta: PortaDaDecisao,
  pedido: { registroId: string; decisao: "aprovada" | "recusada"; decididoPor: string; leadId: string | null; deQuem: string | null; paraQuem: string | null },
): Promise<VereditoDaDecisao> {
  if (pedido.decisao === "aprovada" && (!pedido.leadId || !pedido.paraQuem)) {
    return { desfecho: "falha", codigo: "DECISAO_SEM_DESTINO", mensagem: "A decisão não diz para quem passar a lead — não dá para aplicá-la." };
  }

  const reivindicacao = await porta.reivindicar({ registroId: pedido.registroId, decisao: pedido.decisao, decididoPor: pedido.decididoPor });
  if (!reivindicacao.ok) {
    return { desfecho: "falha", codigo: "DECISAO_REIVINDICACAO_FALHOU", mensagem: "Não foi possível reservar esta decisão para você. Nada foi feito." };
  }

  if (reivindicacao.casou === 0) {
    // A corrida foi perdida no cadeado. Quem ganhou é lido AGORA, não presumido.
    const vencedora = await porta.quemDecidiu(pedido.registroId);
    const oQueFez = vencedora.decisao === "recusada"
      ? "manteve a lead com o dono atual"
      : vencedora.decisao === "aprovada"
        ? "aprovou a passagem da lead"
        : "já respondeu a esta decisão";
    return {
      desfecho: "corrida-perdida",
      codigo: "DECISAO_JA_RESOLVIDA",
      mensagem: fraseDaCorridaPerdida({
        tentou: pedido.decisao === "aprovada" ? "Sua aprovação" : "Sua recusa",
        quemGanhou: vencedora.nome,
        oQueFezQuemGanhou: oQueFez,
      }),
    };
  }

  if (pedido.decisao === "recusada") return { desfecho: "recusa-registrada" };

  const movimento = await porta.moverLead({ leadId: pedido.leadId!, deQuem: pedido.deQuem, paraQuem: pedido.paraQuem! });
  if (!movimento.ok) {
    await porta.devolverReivindicacao({ registroId: pedido.registroId, decididoPor: pedido.decididoPor });
    return { desfecho: "falha", codigo: "REDISTRIBUICAO_FALHOU", mensagem: "Não foi possível passar a lead. Nada foi registrado — a decisão continua na fila." };
  }

  if (movimento.casou === 0) {
    // O 200 mudo do PostgREST. A lead saiu das mãos que a decisão viu.
    await porta.devolverReivindicacao({ registroId: pedido.registroId, decididoPor: pedido.decididoPor });
    const dono = await porta.quemEstaComALead(pedido.leadId!);
    return {
      desfecho: "corrida-perdida",
      codigo: "REDISTRIBUICAO_NAO_CASOU",
      mensagem: fraseDaCorridaPerdida({
        tentou: "Sua aprovação",
        quemGanhou: dono.nome,
        oQueFezQuemGanhou: "a lead saiu das mãos que esta decisão tinha visto",
      }),
    };
  }

  return { desfecho: "aplicada", leadId: pedido.leadId! };
}
