/**
 * SOMBRA DO ATENDIMENTO — o que a IA faria hoje, e o que o humano fez depois.
 *
 * ── O ESTADO MEDIDO NO BANCO DE PRODUÇÃO EM 02/08/2026 ──────────────────────
 *
 *   message_templates ......... 0 linhas de QUALQUER status
 *   ai_sales_journeys ......... 0
 *   nightly_broker_handoffs ... 0
 *   corretores ativos ......... 3, e nenhum jamais disparou uma chamada de LLM
 *   leads ABERTAS sem primeiro contato ... 53 (novo 30 · contato 22 · qualif. 1)
 *
 * A cadeia trava no começo: sem template aprovado a IA não envia, sem envio não
 * nasce jornada, sem jornada não há entrega matinal. O template depende do dono,
 * e enquanto ele não vier a IA não faz absolutamente nada — nem o que não
 * precisa de template.
 *
 * O degrau 1 de `docs/design/ATENDIMENTO_AUTONOMO_MODELO.md` não precisa de
 * template, nem de número, nem de aprovação: a IA PREPARA e REGISTRA, e nada
 * sai. Este módulo é a decisão desse degrau, e ele é PURO — quem executa é o
 * vigia `/api/v2/ai/sombra-do-atendimento/process`.
 *
 * ── O DEFEITO QUE ESTE MÓDULO NÃO REPETE, E QUE ESTÁ MEDIDO ─────────────────
 *
 * `ai_shadow_decisions` tem 20 linhas, todas do agente `sla-primeiro-contato`,
 * todas com `decisao_humana` NULA. A comparação de 4.8 —
 * `compararSombraComHumano` — responde, e vai responder para sempre, "nenhum
 * caso com decisão humana registrada: não há o que comparar".
 *
 * São DUAS causas independentes, e as duas foram medidas:
 *
 *  1. NINGUÉM ESCREVE O SEGUNDO LADO. Nenhum caminho do produto chama
 *     `registrarDecisaoHumana`. A sombra acumula opinião da IA sobre si mesma.
 *
 *  2. A COMPARAÇÃO É POR IGUALDADE DE STRING. `compararSombraComHumano`
 *     compara `recomendacao` com `decisao_humana` por texto normalizado. O
 *     agente existente grava PROSA em `recomendacao` ("Passar a lead Fulano
 *     para Beltrano: 12h sem primeiro contato."), e prosa nunca vai igualar um
 *     gesto observado. Mesmo que alguém preenchesse o segundo lado à mão, o
 *     resultado seria 100% de discordância por construção.
 *
 * Por isso, aqui, `recomendacao` é o VERBO e nada além do verbo. A prosa —
 * porquê, rascunho, prioridade — vai inteira em `preparado`, que é jsonb e não
 * entra na comparação. Um vocabulário, dois lados, mesma régua.
 *
 * ── O VOCABULÁRIO PRECISA SER OBSERVÁVEL NOS DOIS LADOS ─────────────────────
 *
 * A tentação é usar os cinco verbos ricos de `next-best-action`
 * (`ligar_agora`, `reengajar`, `nutrir`…). Não serve: o banco não sabe
 * distinguir "ligou para reengajar" de "ligou para nutrir" — os dois deixam o
 * mesmo rastro. Vocabulário que só um dos lados consegue produzir transforma a
 * comparação em teatro.
 *
 * Os gestos abaixo foram escolhidos por UMA regra: cada um tem rastro próprio e
 * inequívoco no banco vivo.
 *
 *   contatar ......... `leads.first_contacted_at`, `lead_events` (call/whatsapp,
 *                      54 linhas medidas) ou movimento para `contato`
 *   qualificar ....... movimento para `qualificacao` em `pipeline_stage_moves`
 *   agendar_visita ... movimento para `visita`
 *   descartar ........ movimento para `perdido`/`comprou_outro`   (só do humano)
 *   outro_movimento .. qualquer outra etapa                       (só do humano)
 *   nao_agiu ......... a ausência de todos, depois da janela      (só do humano)
 *
 * ── `nao_agiu` NÃO É "A IA E O HUMANO CONCORDARAM EM ESPERAR" ───────────────
 *
 * A IA, aqui, sempre propõe um ATO. Ela não tem no vocabulário a opção de não
 * fazer nada. Isso é deliberado: se ela pudesse propor "esperar", o silêncio do
 * humano viraria concordância, e a métrica subiria sozinha justamente na
 * operação em que 466 de 490 leads nunca receberam um primeiro contato. O
 * número ficaria bonito medindo inércia dos dois lados.
 *
 * Com o vocabulário assimétrico, `nao_agiu` não iguala nenhuma recomendação, e
 * a discordância aparece com o tamanho que tem.
 */

/* Imports RELATIVOS e com extensão: os módulos puros deste repositório rodam
   sob `node --test`, que não conhece o alias `@/`. */
import { avaliarBaseline, type FatosDaLead } from "./baseline-de-conversao.ts";
import { auditMessageDraft, fallbackMessageDraft } from "./real-estate-message.ts";

/** O agente. Um nome só para o vigia, para a rota e para `ai_shadow_decisions.agent`. */
export const AGENTE = "sombra-do-atendimento";

/**
 * A ação, no vocabulário de `niveis-de-autonomia`. Está em
 * `ACOES_RETIDAS_PADRAO`, exige nível 4 + aprovação registrada, e o agente é
 * nível 2. Duas recusas independentes, e é isso que faz o "nada sai" não
 * depender de eu lembrar de não chamar o envio.
 */
export const ACAO = "enviar_mensagem";

/** O que a IA pode propor. Não existe "esperar" — ver o cabeçalho. */
export const GESTOS_DA_IA = ["contatar", "qualificar", "agendar_visita"] as const;
export type GestoDaIA = (typeof GESTOS_DA_IA)[number];

/**
 * O que dá para OBSERVAR do humano. Superconjunto: ele também descarta e some.
 *
 * A ORDEM é o desempate de rastros no mesmo instante, e por isso é fixa: duas
 * leituras do mesmo banco não podem discordar. Vai do começo do funil para o
 * fim, e `nao_agiu` no fim porque ele nunca compete — é sintetizado, não lido.
 */
export const GESTOS_DO_HUMANO = [
  "contatar",
  "qualificar",
  "agendar_visita",
  "descartar",
  "outro_movimento",
  "nao_agiu",
] as const;
export type GestoDoHumano = (typeof GESTOS_DO_HUMANO)[number];

/**
 * A JANELA DE OBSERVAÇÃO — 96 horas, e o número é medido, não escolhido.
 *
 * `docs/design/ATENDIMENTO_AUTONOMO_MODELO.md` mediu a MEDIANA entre a lead
 * entrar e alguém tocar nela: **92,8 horas**, sobre 444 leads.
 *
 * Fechar a janela antes disso registraria `nao_agiu` para MAIS DA METADE dos
 * humanos que iam agir — a IA ganharia a comparação por decurso de prazo. 96h é
 * o primeiro múltiplo de 24 acima da mediana medida: a janela cobre o
 * comportamento típico e ainda fecha em quatro dias, o que mantém a evidência
 * acumulando em vez de ficar pendente para sempre.
 *
 * O QUE ESTA JANELA NÃO PEGA, dito por escrito: humano que age DEPOIS de a
 * janela fechar não reabre o registro. O gesto dele existe no banco e não entra
 * nesta medição. É recorte declarado, e o instante do ato fica gravado em
 * `decidido_em` justamente para quem quiser recontar por outra régua.
 */
export const JANELA_DE_OBSERVACAO_HORAS = 96;

/**
 * Quantas intenções ficam esperando observação, por organização.
 *
 * Mesmo teto e mesmo motivo de `redistribuicao-em-sombra`: são 53 leads abertas
 * sem primeiro contato, e sem teto a primeira execução gravaria 53 linhas que
 * ninguém pediu. O teto é da FILA PENDENTE, não da execução — a fila só repõe
 * quando um registro é observado e sai de pendente.
 *
 * O que fica de fora é CONTADO e devolvido: corte silencioso lê-se como
 * "cobrimos tudo".
 */
export const TETO_DE_INTENCOES_PENDENTES = 20;

/**
 * O TETO DA IA, e ele não é opinião minha.
 *
 * `docs/design/ATENDIMENTO_AUTONOMO_MODELO.md` §5.2: "Teto em `qualification`.
 * Proposta, condição comercial e preço são humanos." Uma lead que já está em
 * `visita`, `proposta` ou `contrato` está ACIMA do teto — a sombra recusa
 * preparar qualquer coisa para ela, e a recusa é devolvida com o motivo em vez
 * de a lead sumir da conta.
 */
export const ETAPAS_ACIMA_DO_TETO = ["visita", "proposta", "contrato"] as const;

/** Etapas em que a lead já teve desfecho. Preparar atendimento aqui é ruído. */
export const ETAPAS_FECHADAS = ["ganho", "perdido", "comprou_outro"] as const;

export type LeadNaFila = {
  id: string;
  nome: string | null;
  empreendimento: string | null;
  /** Etapa canônica (`canonicalPipelineStage`), nunca o texto cru do banco. */
  etapa: string | null;
  origem: string | null;
  criadaEm: string | null;
  primeiroContatoEm: string | null;
  temDono: boolean;
};

export type IntencaoDaSombra = {
  leadId: string;
  /** O verbo, e só o verbo. É ele que vai para `recomendacao`. */
  gesto: GestoDaIA;
  /** 1 = a IA tocaria esta primeiro. */
  prioridade: number;
  /** Probabilidade do baseline aritmético (fração 0..1). NÃO é confiança. */
  probabilidadeBaseline: number;
  canal: "whatsapp";
  /** O rascunho que o corretor veria hoje no produto. Ver `mensagemDaSombra`. */
  mensagem: string;
  /** Falso quando `auditMessageDraft` acha promessa proibida no texto. */
  rascunhoSeguro: boolean;
  avisosDoRascunho: string[];
  porque: string;
};

export type RecusaDaSombra = { leadId: string; porque: string };

export type PlanoDaSombra = {
  intencoes: IntencaoDaSombra[];
  /** Leads que a sombra se RECUSOU a preparar, com o motivo de cada uma. */
  recusadas: RecusaDaSombra[];
  /** Elegíveis que não couberam no teto. Nunca silenciadas. */
  foraDoTeto: number;
  /** Por que a lista saiu vazia. Nunca nulo quando `intencoes` é vazia. */
  porqueVazio: string | null;
};

const normaliza = (valor: string | null | undefined) => String(valor ?? "").trim().toLowerCase();

/**
 * O GESTO QUE A IA PROPORIA para esta lead, ou a recusa com motivo.
 *
 * Determinístico e por ESTADO, na ordem:
 *   1. lead fechada .................... recusa (não há atendimento a preparar)
 *   2. etapa acima do teto da IA ....... recusa (§5.2 do modelo)
 *   3. sem primeiro contato ............ contatar
 *   4. etapa `qualificacao` ............ agendar_visita
 *   5. demais (novo/contato tocados) ... qualificar
 *
 * A ordem 3 antes de 4/5 é o ponto: uma lead que ninguém tocou não se qualifica
 * nem se agenda — o primeiro toque é o único gesto honesto, e é ele que a
 * operação não está dando 466 vezes.
 */
export function gestoDaIA(lead: LeadNaFila): { gesto: GestoDaIA; porque: string } | { recusa: string } {
  const etapa = normaliza(lead.etapa) || "novo";
  if ((ETAPAS_FECHADAS as readonly string[]).includes(etapa)) {
    return { recusa: `Lead em "${etapa}": já teve desfecho, não há atendimento do dia a preparar.` };
  }
  if ((ETAPAS_ACIMA_DO_TETO as readonly string[]).includes(etapa)) {
    return {
      recusa:
        `Lead em "${etapa}", acima do teto declarado da IA (qualificação). Proposta, condição comercial e ` +
        "preço são humanos — a sombra não prepara nem em rascunho o que ela não poderia executar em nível nenhum.",
    };
  }
  if (!lead.primeiroContatoEm) {
    return {
      gesto: "contatar",
      porque:
        "Ninguém falou com esta pessoa ainda. É o gesto com rastro mais claro no banco e o único que a " +
        "operação deixa de dar em massa: 466 de 490 leads sem primeiro contato.",
    };
  }
  if (etapa === "qualificacao") {
    return { gesto: "agendar_visita", porque: "Lead já qualificada: o próximo compromisso é a visita, e é o último gesto abaixo do teto da IA." };
  }
  return { gesto: "qualificar", porque: `Lead já contatada e parada em "${etapa}": falta levantar orçamento, região e prazo para ela sair do lugar.` };
}

/**
 * O RASCUNHO — e por que ele é o MESMO do produto, de propósito.
 *
 * `fallbackMessageDraft` usa nome, canal e empreendimento, e ignora objetivo e
 * tom. Ou seja: os três gestos produzem hoje o mesmo texto. Isso é limitação
 * REAL do produto e fica declarada aqui em vez de contornada.
 *
 * Escrever um texto novo, melhor, só para a sombra seria comparar o corretor com
 * uma IA que não existe no produto — a sombra passaria a medir o meu texto, não
 * o que o sistema entrega. O rascunho gravado é exatamente o que o corretor
 * veria hoje ao pedir uma mensagem, e é isso que torna a comparação honesta.
 */
export function mensagemDaSombra(lead: LeadNaFila, gesto: GestoDaIA): { texto: string; seguro: boolean; avisos: string[] } {
  const texto = fallbackMessageDraft({
    name: lead.nome ?? "",
    channel: "whatsapp",
    objective: gesto,
    tone: "cordial",
    project: lead.empreendimento,
  });
  const auditoria = auditMessageDraft(texto);
  return { texto, seguro: auditoria.safe, avisos: auditoria.warnings };
}

/**
 * A FILA DO DIA — ordenada, com teto e com o que ficou de fora.
 *
 * A ordem é a probabilidade do baseline aritmético, decrescente, com desempate
 * pelo id. Desempate fixo importa: duas execuções seguidas não podem preparar
 * leads diferentes sem que nada tenha mudado — isso destruiria a comparação.
 *
 * `probabilidadeBaseline` NÃO vai para `confianca` no registro. São coisas
 * diferentes: uma é a chance de a lead comprar, a outra seria a confiança da IA
 * na própria recomendação — que ninguém mediu. `modo-sombra.ts` já decide que
 * confiança não medida é `null`, e é `null` que vai.
 */
export function planejarSombraDoDia(
  leads: LeadNaFila[],
  opcoes: { agora: string; teto?: number } = { agora: new Date().toISOString() },
): PlanoDaSombra {
  const teto = opcoes.teto ?? TETO_DE_INTENCOES_PENDENTES;
  const agora = Date.parse(opcoes.agora);

  const recusadas: RecusaDaSombra[] = [];
  const candidatas: Array<{ lead: LeadNaFila; gesto: GestoDaIA; porque: string; probabilidade: number }> = [];

  for (const lead of leads) {
    const decisao = gestoDaIA(lead);
    if ("recusa" in decisao) {
      recusadas.push({ leadId: lead.id, porque: decisao.recusa });
      continue;
    }
    const criada = lead.criadaEm ? Date.parse(lead.criadaEm) : agora;
    const fatos: FatosDaLead = {
      idadeDias: Math.max(0, Math.floor((agora - criada) / 86_400_000)),
      tevePrimeiroContato: Boolean(lead.primeiroContatoEm),
      etapaAlcancada: lead.etapa,
      origem: lead.origem,
      temDono: lead.temDono,
    };
    candidatas.push({ lead, gesto: decisao.gesto, porque: decisao.porque, probabilidade: avaliarBaseline(fatos).probabilidade });
  }

  candidatas.sort((a, b) => b.probabilidade - a.probabilidade || a.lead.id.localeCompare(b.lead.id));

  const intencoes: IntencaoDaSombra[] = candidatas.slice(0, Math.max(0, teto)).map((item, indice) => {
    const rascunho = mensagemDaSombra(item.lead, item.gesto);
    return {
      leadId: item.lead.id,
      gesto: item.gesto,
      prioridade: indice + 1,
      probabilidadeBaseline: item.probabilidade,
      canal: "whatsapp",
      mensagem: rascunho.texto,
      rascunhoSeguro: rascunho.seguro,
      avisosDoRascunho: rascunho.avisos,
      porque: item.porque,
    };
  });

  const porqueVazio = intencoes.length
    ? null
    : leads.length === 0
      ? "Nenhuma lead na fila do dia — a consulta não devolveu candidata alguma."
      : recusadas.length === leads.length
        ? `As ${leads.length} lead(s) da fila foram recusadas: nenhuma está abaixo do teto da IA e em aberto.`
        : "Teto zerado: nenhuma vaga na fila pendente, e empilhar mais transformaria evidência em ruído.";

  return { intencoes, recusadas, foraDoTeto: Math.max(0, candidatas.length - intencoes.length), porqueVazio };
}

/** Um rastro humano já traduzido para o vocabulário, com fonte e instante. */
export type SinalDoHumano = {
  gesto: GestoDoHumano;
  /** ISO. Instante do ato, como o banco o registrou. */
  em: string;
  /** Quem agiu, quando o rastro diz. `null` NUNCA vira "o dono da lead". */
  porQuem: string | null;
  /** A tabela de onde veio. Vai no registro para a leitura ser auditável. */
  fonte: string;
};

/**
 * O MOVIMENTO DE ETAPA, traduzido para o vocabulário.
 *
 * `pipeline_stage_moves` é a fonte canônica de movimentação (478 linhas medidas
 * em 02/08/2026; `lead_events` e `pipeline_history` estão mortas para este fim).
 *
 * ── A REGRA QUE DECIDE O CASO DUVIDOSO ──────────────────────────────────────
 *
 * Etapa que não tem gesto correspondente vira `outro_movimento`, NUNCA nulo.
 * Medido na distribuição real: `proposta` 4, `contrato` 3, `ganho` 2, `novo` 2 —
 * 11 de 478 movimentos (2,3%) caem aí.
 *
 * Se elas virassem "sem sinal", uma lead que o corretor levou direto para
 * proposta seria observada como `nao_agiu` quando a janela fechasse. A
 * comparação registraria "o humano não fez nada" sobre alguém que fez o
 * trabalho inteiro. Errar para o lado de "ele agiu" é o único erro barato aqui:
 * ele diminui a concordância da IA, não aumenta.
 *
 * Só `to_stage` nulo devolve nulo — aí não há movimento nenhum a descrever.
 */
export function gestoDoMovimentoDeEtapa(toStage: string | null | undefined): GestoDoHumano | null {
  const etapa = normaliza(toStage);
  if (!etapa) return null;
  if (etapa === "contato") return "contatar";
  if (etapa === "qualificacao") return "qualificar";
  if (etapa === "visita") return "agendar_visita";
  if (etapa === "perdido" || etapa === "comprou_outro") return "descartar";
  return "outro_movimento";
}

/**
 * O EVENTO DE LEAD, traduzido — e aqui o padrão é o INVERSO do de cima.
 *
 * `lib/crm/cadencia-do-atendimento.ts` já mediu e escreveu: o registro de
 * contato do CRM mora em `lead_events` (38 `call` + 16 `whatsapp` em
 * 02/08/2026), e concluir ausência de contato a partir da tabela errada foi um
 * defeito real desta base. Por isso esta fonte entra.
 *
 * Aqui o não-mapeado devolve NULO, e o motivo é oposto ao do movimento de
 * etapa: `lead_updated` (38), `lead_assigned` (10), `lead_created` (2) e `note`
 * (2) NÃO são atendimento. `lead_assigned` é distribuição — a máquina entregando
 * a lead a alguém — e contá-la como gesto humano faria a fila do dia parecer
 * trabalhada por ter sido distribuída.
 */
export function gestoDoEventoDeLead(tipo: string | null | undefined): GestoDoHumano | null {
  const nome = normaliza(tipo);
  if (nome === "call" || nome === "whatsapp") return "contatar";
  return null;
}

export type ObservacaoDoHumano =
  | { concluido: true; gesto: GestoDoHumano; em: string; porQuem: string | null; fonte: string; porque: string }
  | { concluido: false; porque: string };

/**
 * O QUE O HUMANO FEZ DEPOIS — o segundo lado, sem o qual não há comparação.
 *
 * Regras, e cada uma tem consequência:
 *
 *  · só conta o que aconteceu DEPOIS do instante da sombra. Rastro anterior é
 *    estado, não resposta;
 *  · vence o gesto MAIS ANTIGO. A pergunta é "o que ele fez a seguir", não "o
 *    que ele fez de mais impressionante". Pegar o mais avançado inflaria o
 *    humano — e inflar o lado contra o qual a IA é medida é tão desonesto
 *    quanto inflar a IA;
 *  · empate no mesmo instante é resolvido pela ordem de `GESTOS_DO_HUMANO`, que
 *    é fixa. Duas leituras do mesmo banco não podem discordar;
 *  · sem rastro E com a janela ainda aberta, o registro fica PENDENTE. Concluir
 *    `nao_agiu` cedo seria dar a vitória à IA por decurso de prazo;
 *  · sem rastro E com a janela fechada, `nao_agiu`. Silêncio depois de 96h é
 *    resposta — é a resposta que esta operação dá 466 vezes.
 */
export function observarGestoDoHumano(input: {
  sombraEm: string;
  agora: string;
  sinais: SinalDoHumano[];
  janelaHoras?: number;
}): ObservacaoDoHumano {
  const janela = input.janelaHoras ?? JANELA_DE_OBSERVACAO_HORAS;
  const inicio = Date.parse(input.sombraEm);
  const agora = Date.parse(input.agora);

  const ordem = (gesto: GestoDoHumano) => GESTOS_DO_HUMANO.indexOf(gesto);
  const posteriores = (input.sinais ?? [])
    .filter((sinal) => Number.isFinite(Date.parse(sinal.em)) && Date.parse(sinal.em) > inicio)
    .sort((a, b) => Date.parse(a.em) - Date.parse(b.em) || ordem(a.gesto) - ordem(b.gesto) || a.fonte.localeCompare(b.fonte));

  const primeiro = posteriores[0];
  if (primeiro) {
    const horas = Math.round(((Date.parse(primeiro.em) - inicio) / 3_600_000) * 10) / 10;
    return {
      concluido: true,
      gesto: primeiro.gesto,
      em: primeiro.em,
      porQuem: primeiro.porQuem,
      fonte: primeiro.fonte,
      porque: `Primeiro rastro humano ${horas}h depois da sombra, em ${primeiro.fonte}.`,
    };
  }

  const horasCorridas = (agora - inicio) / 3_600_000;
  if (horasCorridas < janela) {
    const faltam = Math.max(0, Math.round((janela - horasCorridas) * 10) / 10);
    return {
      concluido: false,
      porque:
        `Sem rastro humano até agora, e a janela de ${janela}h ainda não fechou (faltam ${faltam}h). ` +
        "Pendente NÃO é 'não agiu': a mediana medida entre a lead entrar e alguém tocar nela é 92,8h.",
    };
  }

  return {
    concluido: true,
    gesto: "nao_agiu",
    em: input.agora,
    porQuem: null,
    fonte: "janela-fechada",
    porque:
      `Janela de ${janela}h fechada sem nenhum rastro humano — nem contato, nem movimento de etapa, nem descarte. ` +
      "É o desfecho mais comum desta operação, e ele só vira evidência porque ficou escrito.",
  };
}
