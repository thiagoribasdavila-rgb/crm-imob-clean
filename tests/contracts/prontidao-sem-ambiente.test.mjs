/**
 * Contrato: A ROTA QUE DIZ O QUE FALTA NÃO PODE QUEBRAR POR FALTAR.
 *
 * MEDIDO em 2026-07-31, no smoke test do pacote extraído servido em produção
 * SEM `.env`:
 *
 *   GET /api/v1/ready → **HTTP 500 cru**
 *   log: `Error: Supabase Admin não configurado`
 *
 * É o pior lugar possível para essa falha. No primeiro deploy, antes de
 * preencher o `.env`, a rota de prontidão é exatamente onde o operador olha
 * para descobrir o que falta — e ela respondia com um 500 opaco, que não
 * distingue "não configurei ainda" de "o servidor está com defeito".
 *
 * Este contrato não roda a rota (ela é servidor e precisa do Next). Ele guarda a
 * GUARDA: que ela existe, vem ANTES de qualquer uso do cliente do banco, e não
 * vaza valor de variável.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rota = readFileSync("app/api/v1/ready/route.ts", "utf8");

test("a prontidão confere as credenciais mínimas antes de usar o banco", () => {
  const guarda = rota.indexOf("CREDENCIAIS_MINIMAS");
  const primeiroUso = rota.indexOf("lerEvidenciaDeProvedores(getSupabaseAdmin())");
  assert.ok(guarda > 0, "a guarda de credenciais sumiu");
  assert.ok(primeiroUso > 0);
  assert.ok(guarda < primeiroUso, "a guarda precisa vir ANTES do primeiro uso do cliente do banco");
});

test("sem credencial, responde 503 — serviço indisponível, não erro inesperado", () => {
  // 500 diz "algo quebrou". 503 diz "não estou pronto". São diagnósticos
  // opostos para quem está com o deploy na mão.
  assert.match(rota, /status:\s*503/);
  assert.doesNotMatch(rota.slice(rota.indexOf("CREDENCIAIS_MINIMAS"), rota.indexOf("lerEvidenciaDeProvedores")), /status:\s*500/);
});

test("a resposta LISTA o que falta — recusa sem alternativa é beco", () => {
  assert.match(rota, /variaveisAusentes/);
  assert.match(rota, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(rota, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("a resposta nunca ecoa o VALOR de uma variável de ambiente", () => {
  const bloco = rota.slice(rota.indexOf("CREDENCIAIS_MINIMAS"), rota.indexOf("lerEvidenciaDeProvedores"));
  // Só o NOME do que falta pode viajar. `process.env[nome]` só aparece no
  // filtro, para testar presença — nunca dentro do objeto da resposta.
  const dentroDaResposta = bloco.slice(bloco.indexOf("NextResponse.json"));
  assert.doesNotMatch(dentroDaResposta, /process\.env\[/);
  assert.doesNotMatch(dentroDaResposta, /SERVICE_ROLE_KEY\s*:/);
});

test("a resposta diz o que FAZER, não só o que falta", () => {
  assert.match(rota, /estadoExplicacao/);
  assert.match(rota, /\.env\.production\.example/, "a explicação precisa apontar onde está a lista completa");
});
