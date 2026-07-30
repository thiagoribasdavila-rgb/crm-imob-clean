/**
 * LISTA VAZIA NÃO É RESPOSTA.
 *
 * ── O DEFEITO, MEDIDO ───────────────────────────────────────────────────────
 *
 * `first()` pula `null`, `undefined` e `""` — mas `[]` passa no teste de
 * "presente" e vence a disputa contra a coluna seguinte.
 *
 * Medido em 2026-07-30, organização real, 482 leads:
 *
 *   preferred_regions ......... 0 NULL · 482 array VAZIO
 *   preferred_neighborhoods ... 7 com bairro declarado de verdade
 *
 * Como `preferred_regions` vinha primeiro na lista de fallback e nunca era null,
 * ela ganhava sempre. As 7 pessoas que declararam bairro apareciam na ficha como
 * se não tivessem declarado nada — e o corretor era mandado perguntar de novo, na
 * mesma tela em que o painel de compatibilidade (que lê a coluna certa) dizia o
 * contrário.
 *
 * ── O QUE ESTE CONTRATO TAMBÉM PROTEGE ──────────────────────────────────────
 *
 * `bedrooms` NÃO tinha o defeito: a coluna é NULL nas 482, então o `first` cai
 * corretamente para `preferred_bedrooms`. Um conserto "por simetria" teria mexido
 * no que já funcionava — por isso há teste dos dois lados.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { mapLegacyLead } from "../../lib/compat/legacy-v2.ts";

/** A forma REAL das 482 linhas: a coluna preferida existe e está vazia. */
const COMO_O_BANCO_ENTREGA = {
  id: "lead-1",
  name: "Cliente",
  preferred_regions: [],
  preferred_neighborhoods: ["Perdizes", "Pompeia"],
  bedrooms: null,
  preferred_bedrooms: 2,
};

test("bairro declarado atravessa a coluna vazia que vem antes", () => {
  const lead = mapLegacyLead(COMO_O_BANCO_ENTREGA);
  assert.deepEqual(
    lead.preferred_regions,
    ["Perdizes", "Pompeia"],
    "array vazio na primeira coluna não pode vencer bairro declarado na segunda",
  );
});

test("a PRIORIDADE é preservada: coluna preferida COM conteúdo ganha", () => {
  // Sem isto, o conserto viraria "a última coluna sempre vence", que é o defeito
  // simétrico e igualmente errado.
  const lead = mapLegacyLead({
    ...COMO_O_BANCO_ENTREGA,
    preferred_regions: ["Vila Mariana"],
  });
  assert.deepEqual(lead.preferred_regions, ["Vila Mariana"]);
});

test("todas vazias continua vazio — não inventa bairro", () => {
  const lead = mapLegacyLead({
    ...COMO_O_BANCO_ENTREGA,
    preferred_regions: [],
    preferred_neighborhoods: [],
  });
  assert.deepEqual(lead.preferred_regions, []);
});

test("coluna ausente não quebra, e a seguinte responde", () => {
  const lead = mapLegacyLead({ id: "x", preferred_neighborhoods: ["Perdizes"] });
  assert.deepEqual(lead.preferred_regions, ["Perdizes"]);
});

test("bedrooms continua caindo para preferred_bedrooms — o que JÁ funcionava", () => {
  /**
   * A coluna `bedrooms` é NULL nas 482, e `first` pula null corretamente. Este
   * teste existe para que o conserto do bairro não seja estendido "por simetria"
   * a um caso que não tinha defeito.
   */
  const lead = mapLegacyLead(COMO_O_BANCO_ENTREGA);
  assert.equal(Number(lead.bedrooms), 2);
});

test("bedrooms explícito vence o preferido", () => {
  const lead = mapLegacyLead({ ...COMO_O_BANCO_ENTREGA, bedrooms: 3 });
  assert.equal(Number(lead.bedrooms), 3);
});

test("zero dormitórios é resposta, não ausência", () => {
  /**
   * `first` pula `""` mas não `0`. Studio pode ser 0 dormitórios, e tratar isso
   * como "não respondeu" mandaria perguntar de novo a quem já respondeu — a mesma
   * doença, no campo vizinho.
   */
  const lead = mapLegacyLead({ ...COMO_O_BANCO_ENTREGA, bedrooms: 0, preferred_bedrooms: 2 });
  assert.equal(Number(lead.bedrooms), 0, "zero informado não pode cair para o preferido");
});
