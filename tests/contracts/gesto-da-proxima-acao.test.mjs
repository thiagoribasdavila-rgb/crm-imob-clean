/**
 * Contrato do GESTO DA PRÓXIMA AÇÃO — a instrução e o botão que a executa.
 *
 * Distinto de `proxima-acao.test.mjs`, que cobre o AGENDAMENTO (`next_action_at`,
 * "ligo pra ele terça"). Este cobre o passo AGORA, no bloco mais proeminente da
 * ficha do cliente.
 *
 * O caso que mais importa não é nenhum dos caminhos felizes: é a recusa a
 * oferecer gesto comercial quando as oportunidades não puderam ser lidas. É a
 * asserção que impede o produto de decidir sobre o que não sabe.
 *
 * Rodar: node --test tests/contracts/gesto-da-proxima-acao.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { decidirProximaAcao, caminhoDoGesto } from "../../lib/crm/gesto-da-proxima-acao.ts";

const fatos = (atividades, oportunidadesLegiveis = true, oportunidades = 0) => ({
  atividades,
  oportunidadesLegiveis,
  oportunidades,
});

// ── SEMPRE HÁ UM GESTO, E É SEMPRE UM SÓ ────────────────────────────────────

test("toda situação devolve exatamente um gesto, com rótulo que começa por verbo", () => {
  for (const f of [fatos(0), fatos(3, false), fatos(3, true, 0), fatos(3, true, 2)]) {
    const a = decidirProximaAcao(f);
    assert.ok(a.gesto, `sem gesto para ${JSON.stringify(f)}`);
    assert.ok(a.gesto.rotulo.length >= 5, "rótulo curto demais");
    const primeira = a.gesto.rotulo.split(" ")[0].toLowerCase();
    assert.ok(
      !["o", "a", "os", "as", "de", "do", "da", "em", "um", "uma"].includes(primeira),
      `"${a.gesto.rotulo}" não começa por verbo`,
    );
    assert.ok(a.instrucao.length > 30, "instrução curta demais para explicar o porquê");
  }
});

// ── A ORDEM DOS RAMOS É A REGRA ─────────────────────────────────────────────

test("sem atividade, o primeiro contato vence QUALQUER outra análise", () => {
  // Mesmo com 5 oportunidades e tudo legível: se ninguém falou com a pessoa,
  // nenhuma inteligência vale mais que o primeiro alô que ela não recebeu.
  const a = decidirProximaAcao(fatos(0, true, 5));
  assert.equal(a.gesto.tipo, "ligar");
  assert.equal(a.urgente, true);
});

test("sem atividade é o ÚNICO caso urgente", () => {
  for (const f of [fatos(3, false), fatos(3, true, 0), fatos(3, true, 2)]) {
    assert.equal(decidirProximaAcao(f).urgente, false, `urgência indevida em ${JSON.stringify(f)}`);
  }
});

// ── A RECUSA QUE SUSTENTA A HONESTIDADE DO BLOCO ────────────────────────────

test("oportunidades ILEGÍVEIS não ganham gesto comercial", () => {
  // A asserção mais importante do arquivo. Oferecer "ver imóveis" aqui seria
  // decidir sobre o que não se sabe — pode haver oportunidade aberta que
  // ninguém conseguiu ler.
  const a = decidirProximaAcao(fatos(3, false, 0));
  assert.equal(a.gesto.tipo, "recarregar");
  assert.equal(a.gesto.destino, null, "recarregar não navega para lugar nenhum");
  for (const proibido of ["imoveis", "proposta", "mensagem"]) {
    assert.notEqual(a.gesto.tipo, proibido);
  }
});

test("ilegível diz explicitamente que a ausência NÃO foi provada", () => {
  assert.match(decidirProximaAcao(fatos(3, false)).instrucao, /NÃO quer dizer que não existam/i);
});

test("ilegível com oportunidades>0 continua ilegível — o número não é confiável", () => {
  assert.equal(decidirProximaAcao(fatos(3, false, 9)).gesto.tipo, "recarregar");
});

// ── OS DOIS CAMINHOS COMERCIAIS ─────────────────────────────────────────────

test("com conversa e sem oportunidade, o gesto é mostrar imóvel", () => {
  const a = decidirProximaAcao(fatos(3, true, 0));
  assert.equal(a.gesto.tipo, "imoveis");
  assert.equal(a.gesto.destino, "matching");
});

test("com oportunidade aberta, o gesto é avançar — e o número aparece na frase", () => {
  const a = decidirProximaAcao(fatos(3, true, 2));
  assert.equal(a.gesto.tipo, "proposta");
  assert.match(a.instrucao, /2 oportunidade/);
});

// ── A ROTA NUNCA É MONTADA À MÃO ────────────────────────────────────────────

test("o caminho do gesto sai do módulo, não da tela", () => {
  const a = decidirProximaAcao(fatos(3, true, 0));
  assert.equal(caminhoDoGesto("abc-123", a), "/leads/abc-123/matching");
});

test("gesto que não navega devolve NULO, não string vazia", () => {
  // String vazia viraria href="" e recarregaria a página — falha silenciosa.
  for (const f of [fatos(0), fatos(3, false)]) {
    assert.equal(caminhoDoGesto("abc-123", decidirProximaAcao(f)), null);
  }
});

test("atividades negativas contam como zero — nunca caem no ramo comercial", () => {
  // Defesa contra contagem que chega errada: -1 não pode virar "já houve conversa".
  assert.equal(decidirProximaAcao(fatos(-1, true, 5)).gesto.tipo, "ligar");
});

test("todos os tipos de gesto declarados são alcançáveis por alguma situação", () => {
  // Tipo que nenhuma entrada produz é código morto se fingindo de regra.
  const alcancados = new Set(
    [fatos(0), fatos(3, false), fatos(3, true, 0), fatos(3, true, 2)].map((f) => decidirProximaAcao(f).gesto.tipo),
  );
  for (const esperado of ["ligar", "recarregar", "imoveis", "proposta"]) {
    assert.ok(alcancados.has(esperado), `nenhuma situação produz o gesto "${esperado}"`);
  }
});
