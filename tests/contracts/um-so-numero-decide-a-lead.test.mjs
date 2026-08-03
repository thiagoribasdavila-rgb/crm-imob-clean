/**
 * CONTRATO: um só número escolhe, ordena e pinta a lead.
 *
 * ── O DEFEITO, MEDIDO EM 03/08/2026 ─────────────────────────────────────────
 *
 * `public.leads` tem DUAS colunas de score — `score` (legada) e `score_ia` — e
 * elas divergem em 29 das 490 linhas da produção.
 *
 * A rota de leads FILTRA por `score_ia` e ORDENA por `score_ia`. Mas
 * `mapLegacyLead` devolvia `first(row, "score", "score_ia")`, e como o select
 * traz as duas colunas, `row.score` sempre vencia. Quem ESCOLHE a lead e quem a
 * DESENHA olhavam colunas diferentes.
 *
 * O efeito atravessava a fronteira de faixa em NOVE leads:
 *
 *     8 leads  filtro diz MORNA (score_ia 35–55)  ·  tela pinta FRIA (score 0–28)
 *     1 lead   filtro diz FRIA  (score_ia 30)     ·  tela pinta MORNA (score 48)
 *
 * O corretor filtra "Morno", recebe as 8 e elas chegam com cara de fria — então
 * ele pula justamente o que pediu para ver. E a lista era ordenada por um
 * número e exibida com outro.
 *
 * Este contrato não afirma QUAL coluna vence. Ele afirma que é a MESMA nos três
 * lugares — que é a propriedade que impede o defeito voltar por qualquer lado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapLegacyLead, liveLeadSortColumn } from "../../lib/compat/legacy-v2.ts";

const rotaDeLeads = readFileSync(
  new URL("../../app/api/v1/crm/leads/route.ts", import.meta.url),
  "utf8",
);

/** A coluna que a CONSULTA usa para recortar por score. */
function colunaQueFiltra() {
  const m = rotaDeLeads.match(/query\s*=\s*query\.gte\(\s*"([a-z_]+)"\s*,\s*minScore\s*\)/);
  assert.ok(m, "a rota deixou de filtrar por min_score — a forma mudou e este contrato precisa acompanhar");
  return m[1];
}

test("a coluna que FILTRA é a mesma que ORDENA", () => {
  assert.equal(
    liveLeadSortColumn("score"),
    colunaQueFiltra(),
    "ordenar por um número e recortar por outro devolve a lista certa na ordem errada",
  );
});

test("a coluna que FILTRA é a mesma que a resposta DEVOLVE como score", () => {
  // Linha com as duas colunas e valores que caem em faixas DIFERENTES: é o único
  // caso capaz de distinguir qual delas venceu.
  const filtrada = colunaQueFiltra();
  const outra = filtrada === "score_ia" ? "score" : "score_ia";
  const linha = { id: "x", status: "novo", [filtrada]: 55, [outra]: 12 };

  assert.equal(
    mapLegacyLead(linha).score,
    55,
    `mapLegacyLead devolveu o valor de \`${outra}\` enquanto a consulta recorta por \`${filtrada}\`. ` +
      "São 29 leads divergentes na produção, 9 delas atravessando a fronteira de faixa: " +
      "o corretor filtra Morno e recebe linhas pintadas de Frio.",
  );
});

test("a coluna de reserva ainda atende linha legada que não tem a principal", () => {
  // A razão de `mapLegacyLead` existir é justamente a linha antiga. Preferir a
  // coluna nova não pode significar devolver 0 para quem só tem a velha.
  const filtrada = colunaQueFiltra();
  const outra = filtrada === "score_ia" ? "score" : "score_ia";
  assert.equal(mapLegacyLead({ id: "y", status: "novo", [outra]: 42 }).score, 42);
});

test("ausência das duas não vira número inventado", () => {
  // Zero aqui é o valor honesto: a tela desenha "sem score", não "score 0 de 100".
  assert.equal(mapLegacyLead({ id: "z", status: "novo" }).score, 0);
});
