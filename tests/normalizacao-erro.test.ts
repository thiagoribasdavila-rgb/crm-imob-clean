/**
 * O caso "[object Object]" — um defeito visto NO LOG DE PRODUÇÃO, não em teoria.
 *
 * O painel de atlasaios.com.br mostrava, em toda falha da ingestão de eventos:
 *     "event":"v3.event_ingest_failed","error":{"value":"[object Object]"}
 *
 * A rota chamava logger.error corretamente. O defeito estava na normalização: ela
 * tratava só `error instanceof Error` e caía em String(error) para o resto. Como o
 * PostgREST rejeita com objeto simples { message, details, hint, code }, a informação
 * inteira era destruída no instante em que seria útil.
 *
 * O primeiro teste abaixo é a reprodução exata do que estava na tela do dono.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeError } from "../lib/observability/normalize-error.ts";
import { sanitizeLogMetadata } from "../lib/observability/redact.ts";

describe("normalização de erro — o log precisa dizer o que quebrou", () => {
  test("erro do PostgREST não vira mais [object Object]", () => {
    // Formato real de rejeição do supabase-js.
    const erroSupabase = {
      message: 'relation "public.atlas_events" does not exist',
      details: null,
      hint: null,
      code: "42P01",
    };

    const saida = JSON.stringify(normalizeError(erroSupabase));

    assert.ok(!saida.includes("[object Object]"), `voltou a destruir o erro: ${saida}`);
    assert.ok(saida.includes("does not exist"), `a mensagem sumiu: ${saida}`);
    assert.ok(saida.includes("42P01"), `o código do Postgres sumiu: ${saida}`);
  });

  test("o caminho completo — normalizar e depois redigir — preserva o diagnóstico", () => {
    // Vale testar a composição, não só a peça: é assim que o logger usa.
    const saida = JSON.stringify(
      sanitizeLogMetadata({ error: normalizeError({ message: "permission denied for table leads", code: "42501" }) }),
    );
    assert.ok(saida.includes("permission denied"), `o diagnóstico não chegou ao log: ${saida}`);
    assert.ok(saida.includes("42501"));
  });

  test("Error de verdade continua trazendo nome, mensagem e pilha", () => {
    const saida = normalizeError(new TypeError("x is not a function"));
    assert.equal(saida.name, "TypeError");
    assert.equal(saida.message, "x is not a function");
    assert.equal(typeof saida.stack, "string");
  });

  test("erro embrulhado revela a causa — é onde costuma estar o problema real", () => {
    const original = new Error("ECONNREFUSED 127.0.0.1:5432");
    const embrulhado = new Error("falha ao gravar evento", { cause: original });
    const saida = JSON.stringify(normalizeError(embrulhado));
    assert.ok(saida.includes("ECONNREFUSED"), `a causa original se perdeu: ${saida}`);
  });

  test("cadeia de causas não vira recursão infinita", () => {
    let e = new Error("raiz");
    for (let i = 0; i < 10; i += 1) e = new Error(`nivel ${i}`, { cause: e });
    // Se não houvesse limite de profundidade, isto travaria em vez de falhar.
    const saida = normalizeError(e);
    assert.equal(typeof saida, "object");
  });

  test("objeto circular não derruba o processo", () => {
    // Um log jamais pode ser a causa da queda que ele deveria explicar.
    const circular: Record<string, unknown> = { message: "erro com ciclo" };
    circular.self = circular;
    const saida = JSON.stringify(normalizeError(circular));
    assert.ok(saida.includes("erro com ciclo"));
  });

  test("primitivo lançado ainda é registrado", () => {
    assert.equal(normalizeError("string solta").value, "string solta");
    assert.equal(normalizeError(42).value, "42");
    assert.equal(normalizeError(null).value, "unknown");
    assert.equal(normalizeError(undefined).value, "unknown");
  });

  test("segredo dentro do erro continua sendo apagado depois da redação", () => {
    // A normalização preserva mais campos; a proteção não pode ter afrouxado junto.
    const saida = JSON.stringify(
      sanitizeLogMetadata({ error: normalizeError({ message: "falhou", token: "sk-abcdefghijklmnop" }) }),
    );
    assert.ok(saida.includes("[REDACTED]"), `segredo vazou: ${saida}`);
    assert.ok(!saida.includes("sk-abcdefghijklmnop"));
    assert.ok(saida.includes("falhou"), "a mensagem foi junto com o segredo");
  });
});
