/**
 * Contrato: HTML NUNCA PODE VIVER MAIS QUE O BUILD QUE O GEROU.
 *
 * ── O INCIDENTE — 2026-07-31 ────────────────────────────────────────────────
 *
 * Usuários relataram estados diferentes em navegadores diferentes: página sem
 * estilo, error boundary, página completa, login que não entra.
 *
 * Medido em produção, no HTML de `/login`:
 *
 *     cache-control: s-maxage=31536000        ← UM ANO no CDN
 *     x-hcdn-cache-status: HIT
 *     age: 11231                              ← 3 horas parado no edge
 *
 * E dos 13 chunks que esse HTML pedia, **2 respondiam HTTP 404**:
 * `0x4wtkf4mbv_u.js` e `2xldtgaytqxd6.js`.
 *
 * Sem esses dois, o React não hidrata. O usuário vê o payload serializado do
 * Next como texto: **0 inputs, 0 forms, 0 botões**.
 *
 * Não era o navegador. Cada um batia numa borda diferente do CDN
 * (`asc-edge7`, `asc-edge10`…), e cada borda tinha HTML de idade diferente.
 *
 * ── A REGRA ────────────────────────────────────────────────────────────────
 *
 * O HTML carrega os NOMES dos chunks do build que o gerou. Esses nomes morrem
 * no deploy seguinte. Cachear HTML por mais tempo que a vida de um build é
 * garantir que, um dia, ele peça um arquivo que não existe.
 *
 * `/_next/static/*` é o oposto — nome com hash de conteúdo, imutável.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync("next.config.ts", "utf8");
const semComentarios = config.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("o HTML é servido com no-store — nenhuma cópia sobrevive ao build", () => {
  assert.match(semComentarios, /source:\s*["']\/\(\.\*\)["'][\s\S]{0,400}no-store/);
});

test("os endpoints de API são no-store — resposta de estado cacheada afirma saúde passada", () => {
  assert.match(semComentarios, /source:\s*["']\/api\/:path\*["'][\s\S]{0,300}no-store/);
});

test("`/_next/static` MANTÉM cache longo — é imutável por construção", () => {
  // Remover o cache dos estáticos seria a correção preguiçosa: mata o incidente
  // e mata a performance junto. O nome contém o hash do conteúdo; não existe
  // cópia velha para servir.
  assert.match(semComentarios, /_next\/static[\s\S]{0,220}max-age=31536000[\s\S]{0,60}immutable/);
});

test("a exceção dos estáticos vem DEPOIS da regra geral — a última vence", () => {
  // A primeira versão deste contrato afirmava o contrário, e estava errada.
  // O Next aplica TODAS as regras que casam; para a mesma chave, a ÚLTIMA
  // prevalece. Medido servindo o build: com a ordem invertida, o chunk saía
  // com `no-store` e o site perdia todo o cache.
  const estatico = semComentarios.indexOf("_next/static/:path*");
  const geral = semComentarios.indexOf('source: "/(.*)"');
  assert.ok(estatico > 0 && geral > 0);
  assert.ok(estatico > geral, "a regra de `/_next/static` precisa vir DEPOIS de `/(.*)` para sobrescrevê-la");
});

test("o BUILD_ID é o commit — dá para saber de qual versão veio cada chunk", () => {
  assert.match(semComentarios, /generateBuildId/);
  assert.match(semComentarios, /ATLAS_BUILD_COMMIT/);
});

test("sem ATLAS_BUILD_COMMIT o Next volta ao padrão, não inventa um id", () => {
  // Devolver uma string qualquer produziria um BUILD_ID que não corresponde a
  // commit nenhum — exatamente a ambiguidade que este contrato existe para
  // acabar. `null` faz o Next usar o comportamento dele.
  assert.match(semComentarios, /generateBuildId[\s\S]{0,140}\|\|\s*null/);
});

test("a regra que carrega os cabeçalhos de segurança é a que casa com TUDO", () => {
  // A correção de cache não pode ter derrubado CSP, HSTS e afins pelo caminho.
  // Eles vivem na regra `/(.*)`, que casa com toda rota — as regras específicas
  // só sobrescrevem `Cache-Control`, e o Next mescla o resto.
  // Verificado servindo o build: /api/version recebe CSP e HSTS.
  const geral = semComentarios.slice(semComentarios.indexOf('source: "/(.*)"'));
  assert.match(geral.slice(0, 300), /\.\.\.securityHeaders/,
    "a regra que casa com tudo precisa carregar os cabeçalhos de segurança");
});
