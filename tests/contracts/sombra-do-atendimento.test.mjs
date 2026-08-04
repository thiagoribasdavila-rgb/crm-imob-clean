/**
 * Contrato da SOMBRA DO ATENDIMENTO — o degrau 1, e os dois lados da comparação.
 *
 * ── O QUE ESTE CONTRATO PRECISA PROVAR, E POR QUÊ ───────────────────────────
 *
 * Medido no banco de produção em 02/08/2026: `ai_shadow_decisions` tem 20
 * linhas, TODAS com `decisao_humana` nula. A comparação de 4.8 responde
 * "nenhum caso comparável" — e responderia para sempre, porque nenhum caminho
 * do produto escreve o segundo lado.
 *
 * Então os casos abaixo se concentram em três propriedades que, quebradas,
 * produzem um número BONITO e FALSO em vez de um erro:
 *
 *   1. a IA nunca propõe "não fazer nada" — se propusesse, o silêncio do humano
 *      viraria concordância, e a métrica subiria medindo inércia dos dois lados;
 *   2. `nao_agiu` só é concluído DEPOIS da janela — antes disso a IA ganharia a
 *      comparação por decurso de prazo;
 *   3. movimento de etapa desconhecido NUNCA vira silêncio — senão o corretor
 *      que levou a lead direto para proposta seria registrado como quem não fez
 *      nada.
 *
 * As guardas (teto da IA, lead fechada, teto da fila) entram pelo mesmo motivo
 * do contrato vizinho: guarda que nunca foi vista recusando é guarda não
 * verificada.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ACAO,
  AGENTE,
  ETAPAS_ACIMA_DO_TETO,
  GESTOS_DA_IA,
  GESTOS_DO_HUMANO,
  JANELA_DE_OBSERVACAO_HORAS,
  TETO_DE_INTENCOES_PENDENTES,
  gestoDaIA,
  gestoDoEventoDeLead,
  gestoDoMovimentoDeEtapa,
  mensagemDaSombra,
  observarGestoDoHumano,
  planejarSombraDoDia,
} from "../../lib/ai/sombra-do-atendimento.ts";
import { ACOES_RETIDAS_PADRAO, prepararEmSombra } from "../../lib/ai/modo-sombra.ts";
import { nivelExigidoPor } from "../../lib/ai/niveis-de-autonomia.ts";

const AGORA = "2026-08-02T12:00:00.000Z";

const lead = (id, extra = {}) => ({
  id,
  nome: `Lead ${id}`,
  empreendimento: "Residencial Atlas",
  etapa: "novo",
  origem: "meta",
  criadaEm: "2026-07-20T12:00:00.000Z",
  primeiroContatoEm: null,
  temDono: true,
  ...extra,
});

const horasAntes = (h) => new Date(Date.parse(AGORA) - h * 3_600_000).toISOString();

// ── AS TRAVAS DE "NADA SAI" ─────────────────────────────────────────────────

test("a ação preparada é RETIDA pelo modo sombra, e não por eu lembrar de não enviar", () => {
  assert.ok(
    ACOES_RETIDAS_PADRAO.includes(ACAO),
    `"${ACAO}" saiu da lista de ações retidas — a sombra deixaria de reter o que este vigia prepara`,
  );
  const resultado = prepararEmSombra({ agente: AGENTE, acao: ACAO, preparado: {}, recomendacao: "contatar" });
  assert.equal(resultado.retido, true);
  assert.equal(resultado.executado, false);
});

test("e a MESMA ação é recusada pela autonomia, que é uma trava independente", () => {
  // Nível 4 exigido contra um agente nível 2: a recusa não depende do arquivo de
  // modo sombra estar legível. Duas guardas com causas diferentes.
  assert.equal(nivelExigidoPor(ACAO), 4);
});

// ── O VOCABULÁRIO ───────────────────────────────────────────────────────────

test("a IA NUNCA tem 'não fazer nada' no vocabulário", () => {
  for (const gesto of GESTOS_DA_IA) {
    assert.notEqual(gesto, "nao_agiu");
    assert.notEqual(gesto, "esperar");
  }
  // A assimetria é o ponto: `nao_agiu` existe só do lado humano, então silêncio
  // nunca iguala uma recomendação e nunca vira concordância.
  assert.ok(GESTOS_DO_HUMANO.includes("nao_agiu"));
  assert.ok(!GESTOS_DA_IA.includes("nao_agiu"));
});

test("todo gesto que a IA propõe é observável no humano — senão a comparação é teatro", () => {
  for (const gesto of GESTOS_DA_IA) {
    assert.ok(
      GESTOS_DO_HUMANO.includes(gesto),
      `a IA propõe "${gesto}" e o banco não sabe reconhecer esse gesto no humano: a comparação nunca poderia concordar`,
    );
  }
});

// ── O QUE A IA PROPORIA ─────────────────────────────────────────────────────

test("lead sem primeiro contato: o gesto é contatar", () => {
  const decisao = gestoDaIA(lead("l1"));
  assert.equal(decisao.gesto, "contatar");
});

test("lead já contatada e parada: o gesto é qualificar", () => {
  const decisao = gestoDaIA(lead("l1", { etapa: "contato", primeiroContatoEm: "2026-07-30T12:00:00.000Z" }));
  assert.equal(decisao.gesto, "qualificar");
});

test("lead qualificada: o gesto é agendar visita — o último abaixo do teto", () => {
  const decisao = gestoDaIA(lead("l1", { etapa: "qualificacao", primeiroContatoEm: "2026-07-30T12:00:00.000Z" }));
  assert.equal(decisao.gesto, "agendar_visita");
});

test("acima do teto declarado da IA ela RECUSA, e diz por quê", () => {
  for (const etapa of ETAPAS_ACIMA_DO_TETO) {
    const decisao = gestoDaIA(lead("l1", { etapa, primeiroContatoEm: "2026-07-30T12:00:00.000Z" }));
    assert.ok("recusa" in decisao, `a sombra preparou algo para uma lead em "${etapa}", acima do teto de qualificação`);
    assert.match(decisao.recusa, /teto/i);
  }
});

test("lead com desfecho não vira atendimento do dia", () => {
  for (const etapa of ["ganho", "perdido", "comprou_outro"]) {
    const decisao = gestoDaIA(lead("l1", { etapa }));
    assert.ok("recusa" in decisao, `preparou atendimento para lead em "${etapa}"`);
  }
});

// ── A FILA DO DIA ───────────────────────────────────────────────────────────

test("a fila é determinística: mesma entrada, mesma ordem", () => {
  const leads = [lead("c"), lead("a"), lead("b")];
  const um = planejarSombraDoDia(leads, { agora: AGORA });
  const dois = planejarSombraDoDia([...leads].reverse(), { agora: AGORA });
  assert.deepEqual(
    um.intencoes.map((i) => i.leadId),
    dois.intencoes.map((i) => i.leadId),
    "duas execuções sem nada ter mudado prepararam leads em ordem diferente — isso destrói a comparação",
  );
});

test("o que não coube no teto é CONTADO, nunca silenciado", () => {
  const leads = Array.from({ length: 25 }, (_, i) => lead(`l${String(i).padStart(2, "0")}`));
  const plano = planejarSombraDoDia(leads, { agora: AGORA, teto: 5 });
  assert.equal(plano.intencoes.length, 5);
  assert.equal(plano.foraDoTeto, 20);
});

test("teto zero não inventa fila, e explica o vazio", () => {
  const plano = planejarSombraDoDia([lead("l1")], { agora: AGORA, teto: 0 });
  assert.equal(plano.intencoes.length, 0);
  assert.ok(plano.porqueVazio, "lista vazia sem motivo é o zero desenhado como saúde");
});

test("fila vazia diz que estava vazia, e não que todo mundo foi recusado", () => {
  const plano = planejarSombraDoDia([], { agora: AGORA });
  assert.match(plano.porqueVazio, /Nenhuma lead na fila/i);
});

test("prioridade é 1..N sem buraco — é a ordem em que a IA tocaria", () => {
  const plano = planejarSombraDoDia([lead("a"), lead("b"), lead("c")], { agora: AGORA });
  assert.deepEqual(plano.intencoes.map((i) => i.prioridade), [1, 2, 3]);
});

test("o rascunho preparado passa pela auditoria de promessa proibida", () => {
  const rascunho = mensagemDaSombra(lead("l1"), "contatar");
  assert.equal(rascunho.seguro, true, `o rascunho padrão do produto tem promessa proibida: ${rascunho.avisos.join(", ")}`);
  assert.ok(rascunho.texto.length > 0);
});

test("o teto da fila pendente é declarado, não espalhado pelo código", () => {
  assert.equal(typeof TETO_DE_INTENCOES_PENDENTES, "number");
  assert.ok(TETO_DE_INTENCOES_PENDENTES > 0);
});

// ── O SEGUNDO LADO: O QUE O HUMANO FEZ ──────────────────────────────────────

test("rastro ANTERIOR à sombra não conta como resposta", () => {
  const observacao = observarGestoDoHumano({
    sombraEm: horasAntes(10),
    agora: AGORA,
    sinais: [{ gesto: "contatar", em: horasAntes(48), porQuem: null, fonte: "leads.first_contacted_at" }],
  });
  assert.equal(observacao.concluido, false, "contou como resposta um contato que aconteceu ANTES de a IA propor");
});

test("vence o gesto MAIS ANTIGO — a pergunta é o que ele fez a seguir", () => {
  const observacao = observarGestoDoHumano({
    sombraEm: horasAntes(50),
    agora: AGORA,
    sinais: [
      { gesto: "descartar", em: horasAntes(2), porQuem: "ator-1", fonte: "pipeline_stage_moves" },
      { gesto: "contatar", em: horasAntes(40), porQuem: null, fonte: "leads.first_contacted_at" },
    ],
  });
  assert.equal(observacao.concluido, true);
  assert.equal(observacao.gesto, "contatar");
});

test("sem rastro e com a janela ABERTA o registro fica pendente — nunca 'não agiu'", () => {
  const observacao = observarGestoDoHumano({ sombraEm: horasAntes(JANELA_DE_OBSERVACAO_HORAS - 1), agora: AGORA, sinais: [] });
  assert.equal(observacao.concluido, false);
  assert.match(observacao.porque, /janela/i);
});

test("sem rastro e com a janela FECHADA, aí sim é 'não agiu'", () => {
  const observacao = observarGestoDoHumano({ sombraEm: horasAntes(JANELA_DE_OBSERVACAO_HORAS + 1), agora: AGORA, sinais: [] });
  assert.equal(observacao.concluido, true);
  assert.equal(observacao.gesto, "nao_agiu");
});

test("a janela é MAIOR que a mediana medida de 92,8h — senão a IA vence por decurso de prazo", () => {
  assert.ok(
    JANELA_DE_OBSERVACAO_HORAS > 92.8,
    `a janela é de ${JANELA_DE_OBSERVACAO_HORAS}h e a mediana medida entre a lead entrar e alguém tocar nela é 92,8h: ` +
      "mais da metade dos humanos que iam agir seria registrada como 'não agiu'",
  );
});

test("o instante gravado é o do ATO, não o do processamento", () => {
  const emQueAgiu = horasAntes(3);
  const observacao = observarGestoDoHumano({
    sombraEm: horasAntes(20),
    agora: AGORA,
    sinais: [{ gesto: "qualificar", em: emQueAgiu, porQuem: "ator-9", fonte: "pipeline_stage_moves" }],
  });
  assert.equal(observacao.em, emQueAgiu, "sem o instante do ato não dá para medir o tempo entre a IA propor e o humano agir");
  assert.equal(observacao.porQuem, "ator-9");
});

test("quem não é nomeado pelo rastro fica NULO — não vira o dono da lead", () => {
  const observacao = observarGestoDoHumano({
    sombraEm: horasAntes(20),
    agora: AGORA,
    sinais: [{ gesto: "contatar", em: horasAntes(3), porQuem: null, fonte: "leads.first_contacted_at" }],
  });
  assert.equal(observacao.porQuem, null);
});

// ── A TRADUÇÃO DO RASTRO ────────────────────────────────────────────────────

test("cada etapa canônica vira um gesto, e etapa desconhecida NUNCA vira silêncio", () => {
  assert.equal(gestoDoMovimentoDeEtapa("contato"), "contatar");
  assert.equal(gestoDoMovimentoDeEtapa("qualificacao"), "qualificar");
  assert.equal(gestoDoMovimentoDeEtapa("visita"), "agendar_visita");
  assert.equal(gestoDoMovimentoDeEtapa("perdido"), "descartar");
  assert.equal(gestoDoMovimentoDeEtapa("comprou_outro"), "descartar");
  // 11 de 478 movimentos medidos caem aqui (proposta 4, contrato 3, ganho 2,
  // novo 2). Virando nulo, o corretor que levou a lead direto para proposta
  // seria observado como quem não fez nada.
  for (const etapa of ["proposta", "contrato", "ganho", "novo", "etapa-que-ninguem-viu"]) {
    assert.equal(gestoDoMovimentoDeEtapa(etapa), "outro_movimento", `"${etapa}" virou silêncio e o trabalho humano sumiu`);
  }
  assert.equal(gestoDoMovimentoDeEtapa(null), null);
});

test("só call e whatsapp contam como contato — distribuição não é atendimento", () => {
  assert.equal(gestoDoEventoDeLead("call"), "contatar");
  assert.equal(gestoDoEventoDeLead("whatsapp"), "contatar");
  for (const tipo of ["lead_updated", "lead_assigned", "lead_created", "note", "distribution"]) {
    assert.equal(gestoDoEventoDeLead(tipo), null, `"${tipo}" foi contado como atendimento humano`);
  }
});

// ── A COMPARAÇÃO SÓ FUNCIONA SE OS DOIS LADOS FALAREM A MESMA LÍNGUA ────────

test("o que vai para `recomendacao` é o VERBO — prosa nunca igualaria a decisão observada", () => {
  const plano = planejarSombraDoDia([lead("l1")], { agora: AGORA });
  const intencao = plano.intencoes[0];
  assert.ok(
    GESTOS_DA_IA.includes(intencao.gesto),
    "a recomendação gravada precisa ser um verbo do vocabulário: `compararSombraComHumano` confronta por igualdade de string, " +
      "e é por isso que as 20 linhas existentes (que gravam prosa) nunca poderiam concordar com decisão nenhuma",
  );
  // A prosa existe, e vive fora do campo comparado.
  assert.ok(intencao.porque.length > 20);
});
