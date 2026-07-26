/**
 * Contrato do TETO DE REQUISIÇÃO UNIFICADO.
 *
 * O projeto tinha duas implementações de janela deslizante com mapas separados.
 * Este teste existe para que não voltem a ser duas: ele afere tanto o
 * comportamento (contar, bloquear, reabrir) quanto a ESTRUTURA (só um lugar
 * conta; o outro é adaptador).
 *
 * Rodar: node --test tests/contracts/rate-limit-unificado.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonteLimite = fs.readFileSync(path.join(raiz, "lib", "security", "rate-limit.ts"), "utf8");
const fonteAdaptador = fs.readFileSync(path.join(raiz, "lib", "api", "security.ts"), "utf8");

const { checkRateLimit, clientKey } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonteLimite))}`
);

const chaveUnica = (nome) => `${nome}:${process.pid}:${Math.round(performance.now() * 1000)}`;

test("conta cada requisição e bloqueia ao passar do teto", () => {
  const chave = chaveUnica("teto");
  const opcoes = { limit: 3, windowMs: 60_000 };

  assert.deepEqual(
    [1, 2, 3].map(() => checkRateLimit(chave, opcoes).remaining),
    [2, 1, 0],
    "o restante precisa decrescer a cada chamada",
  );
  assert.equal(checkRateLimit(chave, opcoes).allowed, false, "a quarta estoura");
});

test("insistir durante o bloqueio NÃO reabre a janela antes da hora", () => {
  // Se o contador parasse de subir depois de estourado, quem martela a rota
  // veria a janela reabrir cedo — exatamente o comportamento que o teto existe
  // para impedir.
  const chave = chaveUnica("insistencia");
  const opcoes = { limit: 1, windowMs: 60_000 };

  checkRateLimit(chave, opcoes);
  const primeiroBloqueio = checkRateLimit(chave, opcoes);
  const segundoBloqueio = checkRateLimit(chave, opcoes);

  assert.equal(primeiroBloqueio.allowed, false);
  assert.equal(segundoBloqueio.allowed, false);
  assert.equal(
    segundoBloqueio.resetAt,
    primeiroBloqueio.resetAt,
    "o prazo de liberação não pode ser empurrado nem antecipado por quem insiste",
  );
});

test("janela vencida zera a contagem", () => {
  const chave = chaveUnica("janela");
  assert.equal(checkRateLimit(chave, { limit: 1, windowMs: 1 }).allowed, true);
  assert.equal(checkRateLimit(chave, { limit: 1, windowMs: 1 }).allowed, false);

  const inicio = Date.now();
  while (Date.now() - inicio < 5) { /* espera a janela de 1ms vencer */ }

  assert.equal(
    checkRateLimit(chave, { limit: 1, windowMs: 1 }).allowed,
    true,
    "passada a janela, o cliente volta a ser atendido",
  );
});

test("chaves diferentes não se contaminam", () => {
  const a = chaveUnica("origem-a");
  const b = chaveUnica("origem-b");
  checkRateLimit(a, { limit: 1 });
  assert.equal(checkRateLimit(a, { limit: 1 }).allowed, false);
  assert.equal(checkRateLimit(b, { limit: 1 }).allowed, true, "um escritório não pode bloquear o outro");
});

test("clientKey separa por namespace e lê o IP do proxy", () => {
  const req = new Request("https://exemplo.com", {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  });
  assert.equal(clientKey(req, "ia"), "ia:203.0.113.9", "usa o primeiro IP da cadeia, não o do proxy interno");
  assert.notEqual(clientKey(req, "ia"), clientKey(req, "login"), "estourar a IA não pode bloquear o login");
  assert.equal(clientKey(new Request("https://exemplo.com"), "ia"), "ia:unknown", "sem cabeçalho não se inventa IP");
});

// ── Estrutura: o que impede a duplicação de voltar ──────────────────────────

test("existe UMA implementação de contagem no projeto", () => {
  assert.ok(
    !/new Map<string, (Rate)?Bucket>|__atlasRateBuckets/.test(fonteAdaptador),
    "lib/api/security.ts voltou a manter mapa próprio de teto — a contagem tem que viver só em lib/security/rate-limit.ts",
  );
  assert.match(
    fonteAdaptador,
    /import \{ checkRateLimit \} from "@\/lib\/security\/rate-limit"/,
    "o adaptador precisa delegar a contagem",
  );
  assert.ok(
    !/bucket\.count \+= 1/.test(fonteAdaptador),
    "contagem em dois lugares é como este defeito nasceu",
  );
});

test("o armazenamento é fixado em globalThis", () => {
  // Sem isto, cada bundle do Next ganha um mapa zerado e o teto vale
  // `limite x bundles`. Foi o defeito real que a unificação corrigiu.
  assert.match(
    fonteLimite,
    /globalThis as typeof globalThis[\s\S]{0,200}__atlasRateBuckets/,
    "o mapa precisa sobreviver à duplicação de módulo do Next",
  );
});

test("o adaptador devolve Retry-After de pelo menos 1 segundo", () => {
  // `Math.ceil` de um resto negativo dá 0 ou negativo, e "Retry-After: 0" é um
  // convite a repetir imediatamente.
  assert.match(
    fonteAdaptador,
    /Math\.max\(1, Math\.ceil\(\(veredito\.resetAt - Date\.now\(\)\) \/ 1000\)\)/,
    "Retry-After nunca pode ser 0",
  );
});
