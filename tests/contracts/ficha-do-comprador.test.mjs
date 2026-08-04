/**
 * Contrato da FICHA DO COMPRADOR.
 *
 * Medido em 03/08/2026 sobre 613 leads: forma de pagamento, prazo, renda e
 * "precisa financiar" com 100% de vazios. Não era desleixo — a ficha não tinha
 * input para nenhum dos quatro, e o construtor do payload não os mapeava, então
 * mesmo com input o PATCH os descartaria.
 *
 * Os casos abaixo protegem as duas coisas que fariam a correção nascer torta:
 * apagar resposta que o cliente deu, e cobrar do corretor uma lista sem ordem.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPOS_DA_FICHA, FINALIDADES, FORMAS_DE_PAGAMENTO, PRAZOS_DE_COMPRA,
  lacunasDaFicha, normalizarFinalidade,
} from "../../lib/crm/ficha-do-comprador.ts";

// ── AS SEIS GRAFIAS VIRAM DUAS ──────────────────────────────────────────────

test("as seis grafias medidas na base viram dois conceitos", () => {
  // morar (58), Moradia (42), moradia (7), investir (37), Investimento (35),
  // investimento (4) — nenhum filtro consegue agrupar isso.
  for (const grafia of ["morar", "Moradia", "moradia", "MORADIA", "Morar"]) {
    assert.equal(normalizarFinalidade(grafia), "moradia", grafia);
  }
  for (const grafia of ["investir", "Investimento", "investimento", "INVESTIR"]) {
    assert.equal(normalizarFinalidade(grafia), "investimento", grafia);
  }
});

test("resposta que ninguém previu é PRESERVADA, não apagada", () => {
  // Trocar por null para "limpar a base" destruiria o que o cliente respondeu —
  // o mesmo erro que este produto já cometeu com o motivo do descarte.
  assert.equal(normalizarFinalidade("segunda casa na praia"), "segunda casa na praia");
});

test("vazio continua vazio — normalizar não inventa finalidade", () => {
  assert.equal(normalizarFinalidade(null), null);
  assert.equal(normalizarFinalidade(""), null);
  assert.equal(normalizarFinalidade(undefined), null);
});

// ── O QUE FALTA, NA ORDEM DA CONSEQUÊNCIA ───────────────────────────────────

test("ficha vazia lista tudo, do que mais trava para o que menos trava", () => {
  const { lacunas, percentual, daParaPropor } = lacunasDaFicha({});
  assert.equal(lacunas.length, CAMPOS_DA_FICHA.length);
  assert.equal(percentual, 0);
  assert.equal(daParaPropor, false);
  const pesos = lacunas.map((l) => l.peso);
  assert.deepEqual(pesos, [...pesos].sort((a, b) => b - a), "a ordem é por consequência, não pela ordem do formulário");
});

test("cada lacuna diz o que NÃO dá para fazer sem ela", () => {
  const { lacunas } = lacunasDaFicha({});
  for (const l of lacunas) {
    assert.ok(l.semEleNaoDa.length > 30, `${l.coluna}: "preencha tudo" não move ninguém`);
    // O portão pedia a lista fechada "não dá|trava|some|vira" e reprovou "Sem
    // telefone NÃO HÁ WhatsApp", que é consequência concreta escrita de outro
    // jeito. Reapontado para a substância: toda frase precisa dizer algo que
    // DEIXA de acontecer — negação ou perda —, não usar um verbo específico.
    assert.match(l.semEleNaoDa, /\bnão\b|perde|trava|some|vira|chutar|tentativa/i,
      `${l.coluna}: a frase precisa dizer o que DEIXA de acontecer`);
  }
});

test("ficha completa não cobra nada e libera a proposta", () => {
  const cheia = Object.fromEntries(CAMPOS_DA_FICHA.map((c) => [c.coluna, c.tipo === "numero" || c.tipo === "moeda" ? 1 : "x"]));
  const estado = lacunasDaFicha(cheia);
  assert.equal(estado.lacunas.length, 0);
  assert.equal(estado.percentual, 100);
  assert.equal(estado.daParaPropor, true);
});

test("só falta campo leve: dá para propor mesmo com lacuna", () => {
  const cheia = Object.fromEntries(CAMPOS_DA_FICHA.map((c) => [c.coluna, c.tipo === "numero" || c.tipo === "moeda" ? 1 : "x"]));
  delete cheia.email; // peso 1
  const estado = lacunasDaFicha(cheia);
  assert.equal(estado.lacunas.length, 1);
  assert.equal(estado.daParaPropor, true, "e-mail não trava proposta — orçamento trava");
});

test("falta um campo de peso 3: NÃO dá para propor", () => {
  const cheia = Object.fromEntries(CAMPOS_DA_FICHA.map((c) => [c.coluna, c.tipo === "numero" || c.tipo === "moeda" ? 1 : "x"]));
  delete cheia.budget_max;
  assert.equal(lacunasDaFicha(cheia).daParaPropor, false);
});

// ── ZERO E VAZIO NÃO SÃO PREENCHIMENTO ──────────────────────────────────────

test("orçamento zero conta como VAZIO, não como preenchido", () => {
  // "R$ 0" não é resposta: é campo tocado sem valor. Contá-lo como preenchido
  // faria a barra dizer que a ficha está pronta com o dado que mais trava
  // ausente.
  const { lacunas } = lacunasDaFicha({ budget_max: 0 });
  assert.ok(lacunas.some((l) => l.coluna === "budget_max"));
});

test("string com espaços conta como vazio", () => {
  const { lacunas } = lacunasDaFicha({ name: "   " });
  assert.ok(lacunas.some((l) => l.coluna === "name"));
});

test("array vazio conta como vazio", () => {
  const { lacunas } = lacunasDaFicha({ preferred_bedrooms: [] });
  assert.ok(lacunas.some((l) => l.coluna === "preferred_bedrooms"));
});

// ── O CATÁLOGO ──────────────────────────────────────────────────────────────

test("os quatro campos que estavam 100% vazios existem na ficha", () => {
  const colunas = new Set(CAMPOS_DA_FICHA.map((c) => c.coluna));
  for (const c of ["payment_method", "purchase_timeline", "monthly_income", "financing_required"]) {
    assert.ok(colunas.has(c), `${c} precisa ter onde ser preenchido`);
  }
});

test("todo campo de opção traz as opções, e fechadas", () => {
  for (const campo of CAMPOS_DA_FICHA.filter((c) => c.tipo === "opcao")) {
    assert.ok(campo.opcoes && campo.opcoes.length >= 2, `${campo.coluna}: campo de opção sem opções`);
    for (const o of campo.opcoes) {
      assert.match(o.valor, /^[a-z_]+$/, `${campo.coluna}/${o.valor}: o valor gravado precisa ser estável`);
      assert.ok(o.rotulo.length > 0);
    }
  }
});

test("os três blocos seguem a ordem da conversa", () => {
  // Contato, depois o que a pessoa quer, e só então quanto ela pode. Misturar
  // "renda" entre "nome" e "telefone" faz o corretor pular a pergunta difícil.
  const ordem = CAMPOS_DA_FICHA.map((c) => c.bloco);
  const primeiraDe = (b) => ordem.indexOf(b);
  assert.ok(primeiraDe("contato") < primeiraDe("perfil"));
  assert.ok(primeiraDe("perfil") < primeiraDe("capacidade"));
});

test("nenhum rótulo depende de placeholder para existir", () => {
  // Placeholder some ao digitar: campo preenchido vira valor sem nome.
  for (const c of CAMPOS_DA_FICHA) {
    assert.ok(c.rotulo && c.rotulo.length > 1, `${c.coluna}: sem rótulo persistente`);
  }
});

test("as opções não repetem valor dentro do mesmo campo", () => {
  for (const lista of [FINALIDADES, FORMAS_DE_PAGAMENTO, PRAZOS_DE_COMPRA]) {
    const valores = lista.map((o) => o.valor);
    assert.equal(new Set(valores).size, valores.length);
  }
});
