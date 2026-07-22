/**
 * O log é a única testemunha quando tudo o mais falha em silêncio.
 *
 * Esta suíte existe por causa de um defeito real: a palavra "message" estava na lista de
 * chaves sensíveis do logger, e a redação é por NOME DE CHAVE. Como logger.error monta o
 * erro como { name, message, stack }, TODO erro do sistema era gravado com
 * message:"[REDACTED]" — sobrava o rastro de pilha, sem a frase que explica o que houve.
 *
 * Num projeto onde os defeitos são catch mudo, gatilho que falha calado e RLS devolvendo
 * vazio, amordaçar o log é apagar a única prova. Os testes abaixo travam as duas metades
 * do contrato: o erro precisa ser LEGÍVEL, e o dado pessoal precisa continuar PROTEGIDO.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLogMetadata } from "../lib/observability/redact.ts";

const texto = (valor: unknown) => JSON.stringify(sanitizeLogMetadata(valor));

describe("logger — o erro é legível e o dado pessoal continua protegido", () => {
  test("a frase do erro sobrevive à redação", () => {
    // O caso exato que motivou o conserto: sem isto, todo diagnóstico do sistema
    // chega ao operador como [REDACTED].
    const saida = texto({
      error: { name: "PostgrestError", message: 'relation "public.leads" does not exist', stack: "at handler" },
    });
    assert.ok(saida.includes("does not exist"), `a mensagem do erro foi redigida: ${saida}`);
    assert.ok(!saida.includes("[REDACTED]"), `algo foi redigido indevidamente: ${saida}`);
  });

  test("segredo dentro da frase do erro continua sendo apagado", () => {
    // A proteção por VALOR tem de continuar valendo mesmo agora que a chave passa.
    for (const segredo of [
      "Bearer abc123def456ghi789",
      "sk-abcdefghijklmnop",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc",
    ]) {
      const saida = texto({ error: { name: "AuthError", message: `falhou com ${segredo}` } });
      assert.ok(saida.includes("[REDACTED]"), `segredo vazou no log: ${saida}`);
      assert.ok(!saida.includes(segredo), `o segredo apareceu literal: ${saida}`);
    }
  });

  test("e-mail e telefone dentro da frase continuam apagados", () => {
    const comEmail = texto({ error: { message: "falha ao enviar para maria@exemplo.com.br" } });
    assert.ok(comEmail.includes("[REDACTED]"), `e-mail vazou: ${comEmail}`);

    const comTelefone = texto({ error: { message: "numero invalido: 5511987654321" } });
    assert.ok(comTelefone.includes("[REDACTED]"), `telefone vazou: ${comTelefone}`);
  });

  test("conteúdo de mensagem do cliente continua protegido pelas chaves certas", () => {
    // O motivo pelo qual "message" tinha entrado na lista era legítimo. A proteção
    // migrou para as chaves que de fato carregam o texto do cliente.
    for (const chave of ["content", "body", "messageBody", "messageContent", "lead_content"]) {
      const saida = texto({ [chave]: "quero visitar o apartamento amanha" });
      assert.ok(saida.includes("[REDACTED]"), `conteúdo do cliente vazou na chave "${chave}": ${saida}`);
    }
  });

  test("credenciais continuam protegidas por nome de chave", () => {
    for (const chave of ["authorization", "password", "apiKey", "token", "secret", "cpf", "email", "phone"]) {
      const saida = texto({ [chave]: "valor-qualquer" });
      assert.ok(saida.includes("[REDACTED]"), `chave sensível "${chave}" deixou de ser redigida`);
    }
  });

  test("timestamp NUMÉRICO passa intacto — a redação por valor só alcança strings", () => {
    // Verificação de uma afirmação minha que estava errada: eu supus que carimbos de
    // tempo em milissegundos (13 dígitos) fossem apagados pela regra de telefone. Não
    // são: sanitizeLogMetadata só aplica a regra de valor a string. O teste registra o
    // comportamento real para que ninguém repita a suposição.
    const agora = 1753142400000;
    const saida = texto({ durationMs: 1234, occurredAtMs: agora });
    assert.ok(saida.includes("1234"), `duração numérica foi redigida: ${saida}`);
    assert.ok(saida.includes(String(agora)), `timestamp numérico foi redigido: ${saida}`);
  });

  test("a redação é recursiva — objeto aninhado não escapa", () => {
    const saida = texto({ contexto: { credenciais: { password: "hunter2" } } });
    assert.ok(saida.includes("[REDACTED]"), `senha aninhada vazou: ${saida}`);
    assert.ok(!saida.includes("hunter2"));
  });

  test("string longa é truncada em vez de estourar o log", () => {
    const gigante = "a".repeat(5_000);
    const saida = sanitizeLogMetadata(gigante);
    assert.equal(typeof saida, "string");
    assert.ok((saida as string).length <= 2_000, "string não foi truncada: um único log poderia engolir o disco");
  });
});
