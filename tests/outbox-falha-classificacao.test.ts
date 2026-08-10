/**
 * Classificação de falha do outbox — credencial ausente é retryable, não dead_letter.
 *
 * "META_CONVERSIONS_ACCESS_TOKEN não configurado" é erro LOCAL (sem código Graph):
 * caía em "data", queimava 5 tentativas e ia a dead_letter, e definir a variável
 * depois não reprocessava nada. Medido: 12 conversões mortas assim. Config ausente
 * é da família do token expirado (token_unhealthy) — some sozinha quando setada.
 *
 *     node --test "tests/*.test.ts"
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyOutboxFailure } from "../lib/meta/outbox-failure.ts";

describe("classifyOutboxFailure — credencial ausente é retryable", () => {
  test("O GAP: token de conversões não configurado é token_unhealthy, não data", () => {
    assert.equal(classifyOutboxFailure({ message: "META_CONVERSIONS_ACCESS_TOKEN não configurado." }), "token_unhealthy");
    assert.equal(classifyOutboxFailure({ message: "META_LEAD_ACCESS_TOKEN não configurado." }), "token_unhealthy");
  });
  test("token EXPIRADO (código Graph 190) continua token_unhealthy", () => {
    assert.equal(classifyOutboxFailure({ message: "Meta Graph HTTP 400 [code 190] token expirado" }), "token_unhealthy");
  });
  test("erro de DADO continua data (dead_letter após tentativas)", () => {
    assert.equal(classifyOutboxFailure({ message: "Object with ID 123 does not exist [code 100]" }), "data");
    assert.equal(classifyOutboxFailure({ message: "evento tem 14 dias, fora da janela" }), "data");
  });
  test("rate limit continua rate_limited", () => {
    assert.equal(classifyOutboxFailure({ message: "limite [code 4]" }), "rate_limited");
  });
});
