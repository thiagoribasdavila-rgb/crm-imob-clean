/**
 * Contrato: O TESTE PONTA A PONTA NÃO APROVA MEDINDO UM AMBIENTE E VALIDANDO OUTRO.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * Medido em 2026-07-30 no `.env.local`:
 *   ATLAS_ENV            = production
 *   ATLAS_BASE_URL       = https://atlasaios.com.br   (produção)
 *   NEXT_PUBLIC_APP_URL  = https://atlasaios.com.br   (produção)
 *   banco                = pozbrcsfthnhmnebfoxv       (atlas-v3-homologacao)
 *
 * Três verdades sobre o mesmo fato, duas erradas. E `npm run test:real`
 * (= release:check + smoke:all + routes:real + preflight:production) lê
 * `ATLAS_BASE_URL` nos três últimos: ele fazia smoke na URL de PRODUÇÃO e validava
 * contra o banco de HOMOLOGAÇÃO — e APROVAVA.
 *
 * `preflight-production.mjs` já conferia que as duas URLs são iguais. Elas SÃO.
 * A checagem passava e a incoerência sobrevivia, porque ninguém comparava a URL
 * com o BANCO. Guarda que confere metade do fato produz confiança falsa.
 *
 * ── POR QUE O CONTRATO OLHA O ENCADEAMENTO, NÃO O VALOR ─────────────────────
 *
 * Os valores vivem no `.env.local`, que é ambiente do dono — muda de máquina, e
 * eu não o edito. O que precisa ser verdade PARA SEMPRE é estrutural: o portão de
 * coerência existe, ele é o PRIMEIRO passo do `test:real`, e a declaração de
 * ambientes é completa. Um contrato que fixasse o valor de `ATLAS_ENV` quebraria
 * na primeira máquina diferente e ensinaria a desligá-lo.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const scripts = JSON.parse(ler("package.json")).scripts;
const declaracao = JSON.parse(ler("config", "supabase-projetos.json"));

test("o portão de coerência existe e é chamável", () => {
  assert.ok(scripts["coerencia-ambiente:check"], "sem entrada no package.json, ninguém o chama");
  assert.ok(
    fs.existsSync(path.join(raiz, "scripts", "check-coerencia-de-ambiente.mjs")),
    "o script referenciado precisa existir",
  );
});

test("ele é o PRIMEIRO passo do test:real — e essa ordem é a propriedade", () => {
  /**
   * A ordem não é estética. Se ele rodar depois, os smokes já terão feito
   * requisição contra a URL errada e a saída já terá dito "ok" antes da recusa —
   * e é a saída que a pessoa lê.
   */
  const real = scripts["test:real"] || "";
  assert.ok(real, "test:real precisa existir: é o teste ponta a ponta que o escopo exige");
  const passos = real.split("&&").map((p) => p.trim());
  assert.match(passos[0], /coerencia-ambiente:check/,
    `o primeiro passo do test:real é "${passos[0]}" — a coerência tem de vir antes de qualquer smoke`);
});

test("os três consumidores da URL continuam lendo a MESMA variável", () => {
  /**
   * `smoke-v3`, `test-real-routes` e `preflight-production` leem `ATLAS_BASE_URL`
   * com fallback para localhost. Se um deles passar a ler outra variável, o portão
   * de coerência deixa de cobrir aquele caminho sem ninguém notar — e volta a
   * existir um smoke apontado para lugar que ninguém confere.
   */
  for (const arquivo of ["smoke-v3.mjs", "test-real-routes.mjs", "preflight-production.mjs"]) {
    const src = ler("scripts", arquivo);
    assert.match(src, /ATLAS_BASE_URL/,
      `${arquivo} deixou de ler ATLAS_BASE_URL: o portão de coerência não cobre mais este caminho`);
  }
});

test("a declaração de ambientes é completa e não se contradiz", () => {
  const ambientes = declaracao.ambientes ?? [];
  assert.ok(ambientes.length >= 2, "precisa declarar ao menos homologação e produção");

  for (const a of ambientes) {
    assert.ok(a.atlasEnv, "cada ambiente precisa do rótulo que aparece em ATLAS_ENV");
    assert.ok(Array.isArray(a.urlsPermitidas) && a.urlsPermitidas.length > 0,
      `"${a.atlasEnv}" sem URL permitida deixaria qualquer URL passar`);
    assert.ok(typeof a.papel === "string" && a.papel.length > 30,
      `"${a.atlasEnv}" não explica seu papel — quem lê não sabe se pode apontar para lá`);
    // `supabaseRef: null` é declaração legítima de "não conhecemos este banco", e
    // o portão trata isso como incoerência permanente. O que não pode é o campo
    // faltar: aí o portão leria `undefined` e a comparação passaria por acidente.
    assert.ok("supabaseRef" in a, `"${a.atlasEnv}" precisa declarar supabaseRef, mesmo que null`);
  }

  // Duas verdades sobre o mesmo banco seria a doença de novo.
  const refs = ambientes.map((a) => a.supabaseRef).filter(Boolean);
  assert.equal(new Set(refs).size, refs.length,
    "dois ambientes declaram o MESMO projeto Supabase — aí a coerência não distingue nada");
});

test("o ambiente canônico está entre os declarados", () => {
  // Sem isto, a declaração de ambientes poderia apontar só para projetos que não
  // usamos, e o portão aprovaria um banco que o resto do repositório proíbe.
  const refs = (declaracao.ambientes ?? []).map((a) => a.supabaseRef);
  assert.ok(refs.includes(declaracao.canonico.ref),
    `o canônico ${declaracao.canonico.ref} não aparece em nenhum ambiente declarado`);
});

test("nenhum ambiente permite apontar para projeto aposentado", () => {
  /**
   * O aposentado tem 17.151 leads reais e está preservado como dado, não como
   * destino. Se um ambiente o declarasse, o portão de coerência aprovaria apontar
   * a aplicação para ele — e o deploy iria para a base errada, que é exatamente o
   * erro que o dono pediu para nunca mais acontecer.
   */
  const aposentados = new Set((declaracao.aposentados ?? []).map((p) => p.ref));
  for (const a of declaracao.ambientes ?? []) {
    assert.ok(!aposentados.has(a.supabaseRef),
      `o ambiente "${a.atlasEnv}" aponta para o projeto aposentado ${a.supabaseRef}`);
  }
});
