/**
 * CONTRATO DO ORÇAMENTO DE IA (4.7 / §8).
 *
 * ── Por que estes testes CHAMAM em vez de raspar o fonte ───────────────────
 *
 * Um teste que procura a palavra "teto" no arquivo passa com o limitador
 * desligado — o identificador sobrevive na linha do `import`, e a asserção fica
 * verde enquanto o comportamento está morto. Já mordeu esta sessão.
 *
 * Aqui todo teste CHAMA `decidirSobreOTeto` e olha o veredicto. Se a decisão
 * virar `permitido: true` incondicional, estes testes ficam vermelhos.
 *
 * ── Os dois lados, sempre ─────────────────────────────────────────────────
 *
 * Cada teto é provado ENTREGANDO abaixo do limite e RECUSANDO acima. Provar só a
 * recusa deixaria passar um limitador que recusa tudo — que é igualmente
 * inútil e muito mais fácil de escrever por acidente.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  decidirSobreOTeto,
  orcamentoEmVigor,
  tetoUtilizavel,
  consumoNaoMedido,
  ehTarefaEssencial,
  TETO_ABSOLUTO,
  TETOS_PADRAO,
} from "../../lib/ai/orcamento-de-ia.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");

/** Consumo com os campos que o teste não exercita em zero. */
function consumo(parcial) {
  return { ...consumoNaoMedido(), ...parcial };
}

const NAO_ESSENCIAL = { feature: "campaign-analyst", agente: "campaign-analyst", usuarioId: "u1" };
const ESSENCIAL = { feature: "copilot", agente: "copilot", usuarioId: "u1" };

// ─────────────────────────────────────────────────────────────────────────────
// O DEFAULT É LIMITADO — a exigência central do dono
// ─────────────────────────────────────────────────────────────────────────────

test("nada torna o teto ilimitado: os valores que significariam 'sem limite' caem no padrão", () => {
  // A regra do dono é explícita: "nunca permitir cobrança ilimitada por
  // configuração padrão". Cada valor abaixo é uma forma real de escrever
  // "sem teto" num JSON.
  const formasDeDizerSemTeto = [
    null, undefined, "", "ilimitado", "unlimited", "sem_teto",
    Infinity, -Infinity, NaN, -1, -999, "abc", {}, [],
  ];
  for (const forma of formasDeDizerSemTeto) {
    const { valor } = tetoUtilizavel(forma, 150, 2000);
    assert.equal(valor, 150,
      `tetoUtilizavel(${JSON.stringify(forma)}) devolveu ${valor} — deveria cair no padrão 150. Teto ilimitado não é configurável.`);
    assert.ok(Number.isFinite(valor), `teto virou não-finito com ${JSON.stringify(forma)}`);
  }
});

test("configuração NÃO afrouxa o teto absoluto — o valor é aparado e a recusa é dita", () => {
  const { valor, aparado, motivo } = tetoUtilizavel(999_999_999, 150, 2000);
  assert.equal(valor, 2000, "valor acima do absoluto tinha de ser aparado no absoluto");
  assert.equal(aparado, true, "aparo silencioso é a mesma mentira de teto ausente");
  assert.match(String(motivo), /absoluto/i, "o motivo precisa dizer que foi o teto absoluto");
});

test("o teto absoluto é finito e existe no código, não só no JSON", () => {
  // Se o JSON for apagado, renomeado ou virar inválido, o limite continua. Um
  // freio que depende de um arquivo estar legível some no pior momento.
  for (const [chave, valor] of Object.entries(TETO_ABSOLUTO)) {
    assert.ok(Number.isFinite(valor) && valor > 0, `TETO_ABSOLUTO.${chave} precisa ser finito e positivo, veio ${valor}`);
  }
  const orcamento = orcamentoEmVigor({});
  for (const [chave, valor] of Object.entries(orcamento.tetos)) {
    assert.ok(Number.isFinite(valor) && valor >= 0, `tetos.${chave} não é finito: ${valor}`);
  }
});

test("o padrão embutido e o JSON declaram os MESMOS números", () => {
  // Duas verdades sobre o mesmo teto é a classe de defeito que este repositório
  // já pagou caro (RPC e fallback divergindo na chave; mapa de leads que copiou
  // a lista e divergiu). Aqui a divergência seria silenciosa: o código valeria
  // um número e o dono leria outro no arquivo.
  const declarado = JSON.parse(fs.readFileSync(path.join(raiz, "config", "orcamento-e-autonomia-da-ia.json"), "utf8"));
  for (const chave of Object.keys(TETOS_PADRAO)) {
    assert.equal(declarado.tetos[chave], TETOS_PADRAO[chave],
      `tetos.${chave}: JSON diz ${declarado.tetos[chave]}, código embutido diz ${TETOS_PADRAO[chave]}`);
  }
  for (const chave of Object.keys(TETO_ABSOLUTO)) {
    assert.equal(declarado.tetoAbsoluto[chave], TETO_ABSOLUTO[chave],
      `tetoAbsoluto.${chave}: JSON diz ${declarado.tetoAbsoluto[chave]}, código diz ${TETO_ABSOLUTO[chave]}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OS DOIS LADOS DE CADA TETO
// ─────────────────────────────────────────────────────────────────────────────

test("abaixo do teto, ENTREGA — e sem degrau nenhum", () => {
  const veredicto = decidirSobreOTeto(NAO_ESSENCIAL, consumo({ chamadasDoDia: 1, tokensDoDia: 10 }));
  assert.equal(veredicto.permitido, true, "consumo de 1 chamada não pode ser recusado");
  assert.equal(veredicto.acao, "seguir");
  assert.deepEqual(veredicto.degraus, [], "não há degrau a acionar com o teto vazio");
  assert.deepEqual(veredicto.tetosEstourados, []);
});

test("acima do teto DIÁRIO, RECUSA a tarefa não essencial", () => {
  const orcamento = orcamentoEmVigor({});
  const veredicto = decidirSobreOTeto(NAO_ESSENCIAL, consumo({ chamadasDoDia: orcamento.tetos.chamadasPorDia + 1 }));
  assert.equal(veredicto.permitido, false, "teto diário estourado tinha de recusar tarefa não essencial");
  assert.equal(veredicto.acao, "recusar");
  assert.ok(veredicto.tetosEstourados.some((t) => t.escopo === "diario"), "o veredicto precisa dizer QUAL teto apertou");
});

test("acima do teto POR USUÁRIO, recusa esse usuário — e o outro segue", () => {
  const orcamento = orcamentoEmVigor({});
  const estourado = decidirSobreOTeto(
    { ...NAO_ESSENCIAL, usuarioId: "gastador" },
    consumo({ chamadasDoDia: 1, chamadasDoUsuario: orcamento.tetos.chamadasPorUsuarioPorDia + 1 }),
  );
  assert.equal(estourado.permitido, false, "usuário que estourou o próprio teto tinha de ser recusado");
  assert.ok(estourado.tetosEstourados.some((t) => t.escopo === "usuario"));

  // O OUTRO LADO: teto por usuário que derruba todo mundo não é teto por usuário.
  const colega = decidirSobreOTeto(
    { ...NAO_ESSENCIAL, usuarioId: "colega" },
    consumo({ chamadasDoDia: 1, chamadasDoUsuario: 0 }),
  );
  assert.equal(colega.permitido, true, "o colega não gastou nada e não pode ser punido pelo gastador");
});

test("acima do teto POR AGENTE, recusa esse agente — e o outro segue", () => {
  const orcamento = orcamentoEmVigor({});
  const estourado = decidirSobreOTeto(NAO_ESSENCIAL, consumo({ chamadasDoAgente: orcamento.tetos.chamadasPorAgentePorDia + 1 }));
  assert.equal(estourado.permitido, false, "agente que estourou o próprio teto tinha de ser recusado");
  assert.ok(estourado.tetosEstourados.some((t) => t.escopo === "agente"));

  const outroAgente = decidirSobreOTeto(NAO_ESSENCIAL, consumo({ chamadasDoAgente: 0 }));
  assert.equal(outroAgente.permitido, true, "agente que não gastou não pode herdar a recusa de outro");
});

test("CHAMADA SEM USUÁRIO tem teto próprio — 35% do tráfego não passa livre", () => {
  // Medido em 2026-07-30: 15 das 43 chamadas de ai_usage_events não têm user_id
  // (worker agendado e rota sem sessão). Um teto por usuário que só valesse
  // quando há usuário deixaria um terço da operação sem teto algum.
  const orcamento = orcamentoEmVigor({});
  const semUsuario = decidirSobreOTeto(
    { feature: "campaign-analyst", agente: "campaign-analyst", usuarioId: null },
    consumo({ chamadasDoUsuario: orcamento.semAtribuicao.chamadasPorDia + 1 }),
  );
  assert.equal(semUsuario.permitido, false, "o balde sem atribuição tinha de ter teto");
  assert.ok(semUsuario.tetosEstourados.some((t) => t.escopo === "sem_atribuicao"),
    "a recusa precisa ser atribuída ao balde sem atribuição, não a um usuário inexistente");

  // O outro lado: abaixo do teto do balde, entrega.
  const dentro = decidirSobreOTeto(
    { feature: "campaign-analyst", agente: "campaign-analyst", usuarioId: null },
    consumo({ chamadasDoUsuario: 1 }),
  );
  assert.equal(dentro.permitido, true, "worker dentro do teto do balde não pode ser recusado");
});

// ─────────────────────────────────────────────────────────────────────────────
// A RESPOSTA GRADUADA DO §8
// ─────────────────────────────────────────────────────────────────────────────

test("os degraus do §8 sobem por faixa: cache, depois econômico, depois pausa", () => {
  const teto = orcamentoEmVigor({}).tetos.chamadasPorDia;
  const em = (fracao) => decidirSobreOTeto(ESSENCIAL, consumo({ chamadasDoDia: Math.ceil(teto * fracao) }));

  const meio = em(0.5);
  assert.deepEqual(meio.degraus, [], "a 50% do teto nada precisa ser degradado");

  const setenta = em(0.72);
  assert.ok(setenta.degraus.includes("usar_cache"), "a ≥70% o §8 manda reaproveitar resultado");
  assert.ok(!setenta.degraus.includes("trocar_para_modelo_economico"), "a 72% ainda não é hora de trocar de modelo");

  const oitentaCinco = em(0.9);
  assert.ok(oitentaCinco.degraus.includes("trocar_para_modelo_economico"), "a ≥85% o §8 manda trocar para modelo econômico");
  assert.ok(oitentaCinco.degraus.includes("reduzir_processamento"), "a ≥85% o §8 manda reduzir processamento");
  assert.equal(oitentaCinco.permitido, true, "degradar não é recusar");

  const cheio = em(1.1);
  assert.ok(cheio.degraus.includes("pausar_rotina_nao_critica"), "estourado, o §8 manda pausar rotina não crítica");
});

test("com o teto estourado, tarefa ESSENCIAL segue degradada e NÃO ESSENCIAL é recusada", () => {
  // É o coração do §8 ("impedir tarefa não essencial"). Recusar a essencial
  // faria o teto piorar a decisão comercial que ele existe para proteger: o
  // corretor perderia a ferramenta no meio do atendimento.
  const acima = { chamadasDoDia: orcamentoEmVigor({}).tetos.chamadasPorDia + 5 };

  const essencial = decidirSobreOTeto(ESSENCIAL, consumo(acima));
  assert.equal(essencial.essencial, true, "copilot precisa ser reconhecida como essencial");
  assert.equal(essencial.permitido, true, "tarefa essencial não é recusada por teto: é degradada");
  assert.ok(essencial.degraus.length > 0, "seguir sem degradar nenhum degrau tornaria o teto enfeite");

  const naoEssencial = decidirSobreOTeto(NAO_ESSENCIAL, consumo(acima));
  assert.equal(naoEssencial.essencial, false);
  assert.equal(naoEssencial.permitido, false, "é na tarefa não essencial que a economia acontece");
});

test("feature composta é reconhecida pelo prefixo do agente", () => {
  // As features gravadas de verdade em ai_usage_events são compostas:
  // "creative-studio.briefing", "creative-studio.copies". Casar só exato faria
  // toda feature real cair fora da lista de essenciais.
  assert.equal(ehTarefaEssencial("copilot"), true);
  assert.equal(ehTarefaEssencial("copilot.resumo"), true);
  assert.equal(ehTarefaEssencial("campaign-analyst"), false);
  // E não pode casar por substring solta: "copilot-experimental" não é copilot.
  assert.equal(ehTarefaEssencial("copilot-experimental"), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// O TETO ABSOLUTO RECUSA TUDO
// ─────────────────────────────────────────────────────────────────────────────

test("no teto ABSOLUTO nem tarefa essencial roda", () => {
  // Neste ponto o sintoma é laço infinito ou chave vazando, não pico de uso.
  // Seguir gastando seria pior para o dono que ficar sem IA por algumas horas.
  const veredicto = decidirSobreOTeto(ESSENCIAL, consumo({ chamadasDoDia: TETO_ABSOLUTO.chamadasPorDia }));
  assert.equal(veredicto.permitido, false, "o teto absoluto tem de recusar até o essencial");
  assert.equal(veredicto.acao, "recusar");
  assert.match(veredicto.motivos.join(" "), /ABSOLUTO/, "o motivo precisa nomear o teto absoluto");
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTO NÃO MEDIDO NÃO É CUSTO ZERO
// ─────────────────────────────────────────────────────────────────────────────

test("sem tarifa cadastrada o teto de dólar NÃO opina, e diz que não opinou", () => {
  // Medido em 2026-07-30: 6 das 21 chamadas cobráveis (28,6%) têm
  // estimated_cost_usd nulo. Somar nulo como zero faria o teto de dinheiro
  // passar por cima de 28,6% do consumo cobrável afirmando "gastou zero".
  const veredicto = decidirSobreOTeto(ESSENCIAL, consumo({ chamadasDoDia: 2, usdDoDia: null, cobraveisSemCustoMedido: 6 }));
  assert.equal(veredicto.custoNaoMedido, true, "o veredicto precisa admitir que o custo não foi medido");
  assert.ok(!veredicto.tetosEstourados.some((t) => t.unidade === "usd"),
    "sem tarifa, o teto de dólar não pode ser declarado estourado nem cumprido");
  const texto = veredicto.motivos.join(" ");
  assert.match(texto, /não avaliado|não medido/i, "o motivo precisa dizer que o custo não foi avaliado");
  assert.match(texto, /confirmar/i, "preço ausente é 'a confirmar' — nunca um valor plausível");
});

test("com tarifa cadastrada, o teto de dólar recusa de verdade", () => {
  // O outro lado: o teto de dólar não pode ser decorativo quando HÁ preço.
  const orcamento = orcamentoEmVigor({});
  const veredicto = decidirSobreOTeto(NAO_ESSENCIAL, consumo({ chamadasDoDia: 1, usdDoDia: orcamento.tetos.tetoUsdDiario + 1 }));
  assert.equal(veredicto.permitido, false, "estourar o teto em dólar tinha de recusar");
  assert.equal(veredicto.custoNaoMedido, false);
  assert.ok(veredicto.tetosEstourados.some((t) => t.unidade === "usd"));
});

// ─────────────────────────────────────────────────────────────────────────────
// O DESLIGAMENTO É EXPLÍCITO, E SÓ ELE DESLIGA
// ─────────────────────────────────────────────────────────────────────────────

test("o freio só desliga com a variável explícita — e o registro continua", () => {
  const desligado = orcamentoEmVigor({ ATLAS_IA_ORCAMENTO_DESLIGADO: "1" });
  assert.equal(desligado.desligado, true);
  const veredicto = decidirSobreOTeto(NAO_ESSENCIAL, consumo({ chamadasDoDia: 999_999 }), desligado);
  assert.equal(veredicto.permitido, true, "desligado, o teto não recusa");
  assert.match(veredicto.motivos.join(" "), /DESLIGADO/, "o veredicto tem de dizer em voz alta que o freio está desativado");

  // O OUTRO LADO, que é o que importa: qualquer outro valor NÃO desliga.
  for (const valor of ["0", "", "true", "sim", "2", undefined]) {
    const orcamento = orcamentoEmVigor({ ATLAS_IA_ORCAMENTO_DESLIGADO: valor });
    assert.equal(orcamento.desligado, false,
      `ATLAS_IA_ORCAMENTO_DESLIGADO=${JSON.stringify(valor)} não pode desligar o teto`);
  }
});

test("teto zero significa PAUSADO, e pausa mesmo", () => {
  // É como se desliga um agente sem deploy. Zero é mais restritivo que o padrão,
  // então respeitá-lo não abre risco — mas tem de funcionar.
  const orcamento = orcamentoEmVigor({});
  const pausado = { ...orcamento, tetos: { ...orcamento.tetos, chamadasPorAgentePorDia: 0 } };
  const veredicto = decidirSobreOTeto(NAO_ESSENCIAL, consumo({ chamadasDoAgente: 0 }), pausado);
  assert.equal(veredicto.permitido, false, "teto zero tinha de pausar o agente");
  assert.match(veredicto.motivos.join(" "), /pausado/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// A FIAÇÃO: o limitador está no caminho da chamada?
// ─────────────────────────────────────────────────────────────────────────────

test("o roteador PERGUNTA ao teto antes de escolher provedor", () => {
  // Limitador que existe e ninguém chama é ficção. Este é o único teste do
  // arquivo que lê o fonte, porque `provider-router.ts` é `server-only` e não
  // dá para importar aqui. Ele casa a CHAMADA e a ORDEM, não a palavra: ignora
  // comentários, e exige que a pergunta venha antes do laço de provedores.
  const fonte = fs.readFileSync(path.join(raiz, "lib", "ai", "provider-router.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  const posicaoDoTeto = fonte.indexOf("await pedirPermissaoDeIA(");
  assert.ok(posicaoDoTeto > 0, "generateAIText precisa CHAMAR pedirPermissaoDeIA");

  const posicaoDoLaco = fonte.indexOf("for (const provider of plan.providerOrder)");
  assert.ok(posicaoDoLaco > 0, "o laço de provedores mudou de forma — reescreva esta asserção");
  assert.ok(posicaoDoTeto < posicaoDoLaco,
    "a pergunta ao teto tem de vir ANTES do laço de provedores: recusa mais barata é a que não toca a rede");

  // E a recusa tem de interromper: sem o return, o veredicto seria consultado e
  // ignorado — o modo de falha mais fácil de introduzir aqui.
  assert.match(fonte, /if \(!teto\.permitido\) \{[\s\S]{0,600}?return result;/,
    "a recusa por teto precisa devolver o fallback determinístico e PARAR");
});
