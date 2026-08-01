/**
 * PATCH PARCIAL NÃO APAGA A IDENTIDADE DA LEAD.
 *
 * ── O DEFEITO, MEDIDO ───────────────────────────────────────────────────────
 *
 * `liveLeadUpdatePayload` já usava `sent()` para orçamento, dormitórios e
 * bairros — campo ausente preservava o valor do banco. Nome, e-mail, telefone e
 * origem NÃO usavam: um PATCH que não os trouxesse gravava `null` nos quatro.
 *
 * Consequência: atualizar só o bairro de uma lead apagava o NOME e o TELEFONE
 * dela. Medido executando contra uma lead real: `email: "…" → null`.
 *
 * Por que isso vira urgente agora: a operação precisa de captura campo a campo —
 * 473 leads estão com SLA de primeiro contato vencido sem contato registrado, e o
 * corretor tem um toque por cliente. Toda tela que salvasse uma resposta por vez
 * destruiria os quatro campos pelos quais ele alcança a pessoa.
 *
 * ── OS DOIS LADOS ───────────────────────────────────────────────────────────
 *
 * Ausente PRESERVA. Enviado vazio LIMPA. Uma regra que só preservasse tornaria
 * impossível corrigir um e-mail digitado errado; uma que só limpasse é o defeito.
 * Os dois lados são testados, porque guarda de um lado só passa em teste de
 * vazamento e destrói o produto.
 */

import test from "node:test";
import assert from "node:assert/strict";

// O módulo PURO, não `live-writes.ts` — aquele importa `server-only` e nenhum
// contrato consegue carregá-lo. Foi essa impossibilidade que deixou o defeito
// viver sem cobertura desde sempre.
import { liveLeadUpdatePayload } from "../../lib/compat/payload-de-lead.ts";

/** Uma lead como o banco a tem: identidade completa. */
const NO_BANCO = {
  name: "Monique Teles",
  email: "monique@exemplo.com.br",
  phone: "11987654321",
  source: "meta_ads",
  budget_min: 300000,
  budget_max: 500000,
  preferred_bedrooms: 2,
  preferred_neighborhoods: ["Perdizes"],
  temperature: "quente",
  notes: "",
};

const IDENTIDADE = ["name", "email", "phone", "source"];

test("salvar SÓ o bairro preserva nome, e-mail, telefone e origem", () => {
  /**
   * É literalmente o corpo que a captura de resposta decisiva envia: o corretor
   * perguntou o bairro na ligação e gravou a resposta. Nada mais mudou.
   */
  const saida = liveLeadUpdatePayload({ preferred_regions: ["Pinheiros"] }, "novo", NO_BANCO);

  assert.equal(saida.name, "Monique Teles");
  assert.equal(saida.email, "monique@exemplo.com.br");
  assert.equal(saida.phone, "11987654321");
  assert.equal(saida.source, "meta_ads");
  assert.deepEqual(saida.preferred_neighborhoods, ["Pinheiros"], "e o bairro novo entrou");
});

test("salvar SÓ o orçamento também preserva a identidade", () => {
  const saida = liveLeadUpdatePayload({ budget_min: 250000, budget_max: 400000 }, "novo", NO_BANCO);
  for (const campo of IDENTIDADE) {
    assert.equal(saida[campo], NO_BANCO[campo], `${campo} não pode ser apagado por um PATCH de orçamento`);
  }
});

test("salvar SÓ dormitórios também preserva a identidade", () => {
  const saida = liveLeadUpdatePayload({ bedrooms: 1 }, "novo", NO_BANCO);
  for (const campo of IDENTIDADE) {
    assert.equal(saida[campo], NO_BANCO[campo], `${campo} não pode ser apagado por um PATCH de dormitórios`);
  }
});

test("corpo VAZIO não apaga nada — o caso extremo", () => {
  // Um cliente desconfigurado, um retry, uma integração nova: nenhum deles pode
  // custar a identidade de uma lead.
  const saida = liveLeadUpdatePayload({}, "novo", NO_BANCO);
  for (const campo of IDENTIDADE) {
    assert.equal(saida[campo], NO_BANCO[campo]);
  }
  assert.equal(saida.budget_min, 300000);
  assert.deepEqual(saida.preferred_neighborhoods, ["Perdizes"]);
});

test("O OUTRO LADO: enviado VAZIO limpa de propósito", () => {
  /**
   * Sem isto, corrigir um e-mail digitado errado seria impossível — e uma regra
   * que só preserva passa em todos os testes acima enquanto quebra o produto.
   */
  const saida = liveLeadUpdatePayload({ email: "", phone: "", source: "" }, "novo", NO_BANCO);
  assert.equal(saida.email, null, "e-mail enviado vazio é ordem de limpar");
  assert.equal(saida.phone, null);
  assert.equal(saida.source, null);
  assert.equal(saida.name, "Monique Teles", "e quem não foi enviado continua preservado");
});

test("enviado com valor NOVO troca", () => {
  const saida = liveLeadUpdatePayload(
    { name: "Monique Teles da Silva", email: "NOVO@Exemplo.com.BR", phone: "(11) 91234-5678" },
    "novo",
    NO_BANCO,
  );
  assert.equal(saida.name, "Monique Teles da Silva");
  assert.equal(saida.email, "novo@exemplo.com.br", "e-mail normalizado para minúsculas");
  assert.equal(saida.phone, "11912345678", "telefone fica só com dígitos");
});

test("lead sem identidade no banco continua sem — ausência não vira string vazia", () => {
  // O outro extremo: se o banco não tem e-mail, o PATCH parcial não pode inventar
  // um valor nem devolver "" no lugar de null.
  const saida = liveLeadUpdatePayload({ bedrooms: 2 }, "novo", { name: "Sem contato" });
  assert.equal(saida.email, null);
  assert.equal(saida.phone, null);
  assert.equal(saida.source, null);
  assert.equal(saida.name, "Sem contato");
});
