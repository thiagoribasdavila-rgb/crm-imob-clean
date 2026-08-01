/**
 * CONTRATO DO MODO SOMBRA (4.8).
 *
 * ── O que precisa ser verdade ─────────────────────────────────────────────
 *
 * "A IA analisa, classifica, recomenda, PREPARA e REGISTRA o que faria — sem
 * enviar mensagem, redistribuir lead, iniciar campanha, alterar condição ou
 * apagar registro."
 *
 * Duas metades:
 *   · a sombra RETÉM as cinco ações que o dono nomeou;
 *   · a sombra PREPARA de verdade — retenção que devolve payload vazio não
 *     serve a ninguém: o humano não teria o que conferir e executar.
 *
 * E a comparação recomendação × decisão humana × resultado, que é o que permite
 * um dia SAIR da sombra com evidência em vez de otimismo.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  prepararEmSombra,
  compararSombraComHumano,
  reterPorPadrao,
  sombraLigada,
  ligadoDadoValor,
  acoesRetidas,
  ACOES_RETIDAS_PADRAO,
} from "../../lib/ai/modo-sombra.ts";

const APROVACAO_BOA = {
  approvedBy: "diretor@imobiliaria.com.br",
  approvedAt: "2026-07-30T12:00:00.000Z",
  reason: "Aprovado na reunião comercial.",
};

// ─────────────────────────────────────────────────────────────────────────────
// A SOMBRA RETÉM
// ─────────────────────────────────────────────────────────────────────────────

test("as cinco ações que o dono nomeou em 4.8 são RETIDAS", () => {
  for (const acao of ["enviar_mensagem", "redistribuir_lead", "iniciar_campanha", "alterar_condicao_comercial", "apagar_registro"]) {
    assert.ok(reterPorPadrao(acao), `"${acao}" precisa ser retida pela sombra`);
  }
  assert.deepEqual([...ACOES_RETIDAS_PADRAO].sort(), acoesRetidas().sort(),
    "a declaração do JSON e o padrão embutido divergiram — duas verdades sobre o que a sombra retém");
});

test("a sombra retém MESMO com nível suficiente e aprovação válida", () => {
  // É o ponto inteiro do Shadow Mode: o agente PODERIA agir e ainda assim não
  // age. Se a aprovação furasse a sombra, "shadow mode" seria só um nome para o
  // fluxo normal de aprovação, e o dono não teria pedido as duas coisas.
  const resultado = prepararEmSombra({
    agente: "meta-campaign-executor",
    acao: "iniciar_campanha",
    preparado: { objetivo: "LEADS", verba_diaria_centavos: 5000 },
    recomendacao: "Subir campanha de lançamento no bairro X.",
    aprovacao: APROVACAO_BOA,
  });
  assert.equal(resultado.retido, true, "a sombra foi furada por uma aprovação válida");
  assert.equal(resultado.executado, false, "nada pode ser executado em sombra");
  assert.equal(resultado.autonomia.permitido, true,
    "o agente TEM autonomia — é justamente por isso que este teste prova algo: a sombra retém quem poderia agir");
  assert.match(resultado.motivo, /sombra/i);
});

test("retido nunca vem com executado — a combinação impossível", () => {
  // Um registro de sombra que dissesse "retido e executado" seria uma mentira
  // no banco. O CHECK da migration protege o banco; isto protege o código.
  for (const acao of [...ACOES_RETIDAS_PADRAO, "observar", "recomendar", "apagar_dado"]) {
    const resultado = prepararEmSombra({
      agente: "copilot", acao, preparado: { x: 1 }, recomendacao: "teste",
    });
    assert.ok(!(resultado.retido && resultado.executado),
      `"${acao}" devolveu retido E executado ao mesmo tempo`);
    assert.equal(resultado.executado, false,
      "este módulo nunca executa: manter a execução fora dele é o que impede 'modo sombra' de virar o lugar onde a ação acontece");
  }
});

test("a sombra PREPARA de verdade: o payload e a recomendação sobrevivem à retenção", () => {
  // Retenção que devolve payload vazio não serve: o humano precisa conferir e
  // executar o que a IA montou. Sem isto, a sombra seria só um "não".
  const preparado = { lead_id: "abc-123", texto: "Olá, temos uma unidade que casa com o que você pediu.", canal: "whatsapp" };
  const resultado = prepararEmSombra({
    agente: "message-draft",
    acao: "enviar_mensagem",
    preparado,
    recomendacao: "Retomar contato: lead pediu 2 dormitórios e há unidade nova no estoque.",
    confianca: 0.72,
    entidade: { tipo: "lead", id: "abc-123" },
  });
  assert.equal(resultado.retido, true);
  assert.deepEqual(resultado.registro.preparado, preparado, "o payload preparado precisa chegar inteiro ao registro");
  assert.match(resultado.registro.recomendacao, /2 dormitórios/, "a recomendação precisa sobreviver");
  assert.equal(resultado.registro.confianca, 0.72);
  assert.deepEqual(resultado.registro.entidade, { tipo: "lead", id: "abc-123" });
});

test("confiança não declarada é `null`, nunca um número plausível", () => {
  for (const confianca of [undefined, null, NaN, Infinity, "0.9"]) {
    const resultado = prepararEmSombra({
      agente: "copilot", acao: "recomendar", preparado: {}, recomendacao: "x", confianca,
    });
    assert.equal(resultado.registro.confianca, null,
      `confiança ${JSON.stringify(confianca)} virou número — inventar métrica é o que o dono proibiu`);
  }
  const boa = prepararEmSombra({ agente: "copilot", acao: "recomendar", preparado: {}, recomendacao: "x", confianca: 0.5 });
  assert.equal(boa.registro.confianca, 0.5, "confiança realmente declarada tem de passar");
});

test("a sombra está LIGADA por padrão", () => {
  // Nascer desligada seria implantar agente autônomo sem Shadow Mode, que é
  // exatamente o que o dono proibiu.
  assert.equal(sombraLigada(), true, "o padrão do produto tem de ser sombra ligada");
});

test("SÓ `false` explícito desliga a sombra — arquivo ausente a mantém", () => {
  // Este teste nasceu de um ponto cego real: a mutação que trocava
  // `valor !== false` por `valor === true` SOBREVIVEU, porque com o arquivo real
  // dizendo `ligado: true` as duas formas concordam. A diferença só apareceria no
  // dia em que o arquivo sumisse — o dia em que ninguém está olhando.
  const formasDeNaoDizerNada = [undefined, null, "", 0, "false", "no", NaN, {}, [], "true", 1, true];
  for (const valor of formasDeNaoDizerNada) {
    assert.equal(ligadoDadoValor(valor), true,
      `ligado=${JSON.stringify(valor)} desligou a sombra — só \`false\` booleano pode desligar`);
  }
  // E o outro lado: o desligamento explícito tem de funcionar, senão a sombra
  // seria impossível de desligar e ninguém sairia dela nunca.
  assert.equal(ligadoDadoValor(false), false, "`ligado: false` explícito tem de desligar");
});

test("ação fora da lista retida não é retida pela sombra — mas ainda passa pela autonomia", () => {
  // O outro lado. Uma sombra que retém tudo tornaria a IA inútil, e a
  // retenção deixaria de significar algo.
  assert.equal(reterPorPadrao("observar"), false, "observar não é ação externa e não precisa ser retida");
  assert.equal(reterPorPadrao("recomendar"), false);

  // E o que a sombra libera, a autonomia ainda julga: copilot é nível 1 e não
  // pode preparar rascunho (nível 2).
  const resultado = prepararEmSombra({ agente: "copilot", acao: "preparar_rascunho", preparado: {}, recomendacao: "x" });
  assert.equal(resultado.retido, true, "fora da sombra, a falta de nível ainda retém");
  assert.equal(resultado.autonomia.permitido, false);

  // E o que a autonomia permite, passa: copilot nível 1 pode recomendar.
  const liberado = prepararEmSombra({ agente: "copilot", acao: "recomendar", preparado: {}, recomendacao: "x" });
  assert.equal(liberado.retido, false, "copilot é nível 1 e recomendar exige 1 — não havia por que retê-la");
  assert.equal(liberado.autonomia.permitido, true);
});

test("ação PROIBIDA autonomamente é retida mesmo estando fora da lista da sombra", () => {
  // "apagar_registro" está na lista da sombra; "apagar_dado" é a classe do
  // nível 5. As duas travas são independentes de propósito: escapar de uma não
  // pode significar escapar da outra.
  const resultado = prepararEmSombra({
    agente: "meta-campaign-executor", acao: "apagar_dado", preparado: {}, recomendacao: "limpar base antiga",
    aprovacao: APROVACAO_BOA,
  });
  assert.equal(resultado.retido, true, "ação do nível 5 passou pela sombra");
  assert.equal(resultado.autonomia.proibidaAutonomamente, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// A COMPARAÇÃO recomendação × decisão × resultado
// ─────────────────────────────────────────────────────────────────────────────

test("sem caso comparável a taxa é `null`, não zero", () => {
  // "0% de acerto" e "não houve o que medir" são afirmações diferentes. Trocar
  // uma pela outra é inventar métrica — e é o erro que faz alguém desligar um
  // agente bom, ou ligar um ruim.
  const comparacao = compararSombraComHumano([
    { recomendacaoDaIA: "ligar", decisaoHumana: null, resultado: null },
    { recomendacaoDaIA: "esperar", decisaoHumana: null, resultado: null },
  ]);
  assert.equal(comparacao.taxaDeConcordancia, null, "taxa sem amostra tem de ser null");
  assert.equal(comparacao.comparaveis, 0);
  assert.equal(comparacao.total, 2);
  assert.match(comparacao.ressalvas.join(" "), /não medida|não há o que comparar/i,
    "a ressalva precisa dizer em voz alta que não houve o que medir");
});

test("amostra pequena vem com a ressalva colada no número", () => {
  // Com 3 casos, um acerto vira "33%" e alguém decide tirar um agente da sombra
  // por causa disso. O número e a ressalva andam juntos.
  const comparacao = compararSombraComHumano([
    { recomendacaoDaIA: "ligar", decisaoHumana: "ligar", resultado: "ligar" },
    { recomendacaoDaIA: "ligar", decisaoHumana: "esperar", resultado: "esperar" },
    { recomendacaoDaIA: "esperar", decisaoHumana: "esperar", resultado: "ligar" },
  ]);
  assert.equal(comparacao.comparaveis, 3);
  assert.ok(comparacao.taxaDeConcordancia > 0, "houve concordância e ela tem de aparecer");
  assert.ok(comparacao.ressalvas.some((r) => /insuficiente/i.test(r)),
    "3 casos não sustentam decisão e a comparação tem de dizer isso");
});

test("a comparação separa IA certa de humano certo — os quatro quadrantes", () => {
  // É o que o dono pediu em 4.8: não basta concordância, precisa saber QUEM
  // acertou quando discordaram. Sem isso não há como aprender nada da sombra.
  const comparacao = compararSombraComHumano([
    { recomendacaoDaIA: "ligar", decisaoHumana: "esperar", resultado: "ligar" },     // IA certa
    { recomendacaoDaIA: "esperar", decisaoHumana: "ligar", resultado: "ligar" },     // humano certo
    { recomendacaoDaIA: "ligar", decisaoHumana: "ligar", resultado: "ligar" },       // ambos certos
    { recomendacaoDaIA: "esperar", decisaoHumana: "descartar", resultado: "ligar" }, // ambos errados
  ], 1);
  assert.equal(comparacao.iaCertaHumanoErrado, 1);
  assert.equal(comparacao.humanoCertoIaErrada, 1);
  assert.equal(comparacao.ambosCertos, 1);
  assert.equal(comparacao.ambosErrados, 1);
  assert.equal(comparacao.comResultado, 4);
  assert.equal(comparacao.concordou, 1, "só um caso teve IA e humano dizendo a mesma coisa");
  assert.equal(comparacao.discordou, 3);
});

test("caso sem desfecho conta para concordância e NÃO para acerto", () => {
  // Concordância dá para medir sem saber o resultado; acerto não. Misturar os
  // dois inflaria o acerto com casos cujo desfecho ninguém conhece.
  const comparacao = compararSombraComHumano([
    { recomendacaoDaIA: "ligar", decisaoHumana: "ligar", resultado: null },
    { recomendacaoDaIA: "ligar", decisaoHumana: "ligar", resultado: "ligar" },
  ], 1);
  assert.equal(comparacao.comparaveis, 2, "os dois têm decisão humana e são comparáveis");
  assert.equal(comparacao.comResultado, 1, "só um tem desfecho conhecido");
  assert.equal(comparacao.ambosCertos, 1, "o acerto só pode contar o caso com desfecho");
  assert.ok(comparacao.ressalvas.some((r) => /sem desfecho/i.test(r)),
    "a ressalva precisa avisar que há caso sem desfecho");
});
