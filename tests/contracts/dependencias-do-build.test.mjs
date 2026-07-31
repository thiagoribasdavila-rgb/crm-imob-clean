/**
 * Contrato: TODA DEPENDÊNCIA QUE O BUILD CARREGA PRECISA ESTAR EM
 * `dependencies`, NUNCA SÓ EM `devDependencies`.
 *
 * ── O INCIDENTE — 2026-07-31 ────────────────────────────────────────────────
 *
 * O pacote `bb82ced5` falhou na Hostinger:
 *
 *   Error: Cannot find module '@tailwindcss/postcss'
 *
 * A hospedagem gerenciada instala com `NODE_ENV=production`, e nesse modo o npm
 * **omite as devDependencies**. `postcss.config.mjs` carrega
 * `@tailwindcss/postcss` durante o build — e ele não estava lá.
 *
 * Reproduzido em diretório limpo, com os comandos exatos da Hostinger:
 *
 *   NODE_ENV=production npm ci --omit=dev  → exit 0
 *   NODE_ENV=production npm run build      → exit 1, 3× "Cannot find module"
 *
 * ── POR QUE NENHUM TESTE PEGAVA ─────────────────────────────────────────────
 *
 * `npm ci` comum instala TUDO. Na máquina de quem desenvolve, o pacote está
 * sempre presente — não importa em qual seção do `package.json` ele foi
 * declarado. A seção só passa a existir de verdade no servidor.
 *
 * Este contrato lê o que o build realmente carrega e exige que esteja no lado
 * certo. É estático de propósito: rodar `npm ci --omit=dev` a cada suíte
 * custaria minutos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const prod = pkg.dependencies || {};
const dev = pkg.devDependencies || {};

/** Está disponível numa instalação `--omit=dev`? */
const disponivelEmProducao = (nome) => Object.prototype.hasOwnProperty.call(prod, nome);

test("todo plugin do postcss.config está em dependencies", () => {
  // É o caminho exato do incidente: o PostCSS resolve o plugin pelo nome, em
  // tempo de build, dentro de node_modules.
  const config = readFileSync("postcss.config.mjs", "utf8");
  const plugins = [...config.matchAll(/["']([@\w/.-]+)["']\s*:/g)].map((m) => m[1]);
  assert.ok(plugins.length > 0, "nenhum plugin encontrado — o parser deste contrato quebrou");
  for (const plugin of plugins) {
    assert.ok(disponivelEmProducao(plugin), `"${plugin}" é carregado no build e NÃO está em dependencies — some com --omit=dev`);
  }
});

test("tailwind está em dependencies — o CSS é gerado no build", () => {
  // `globals.css` faz `@import "tailwindcss"`. Sem o pacote, o build quebra ou
  // sai sem estilo — e sair sem estilo é pior, porque o build passa.
  assert.ok(disponivelEmProducao("tailwindcss"));
  assert.ok(disponivelEmProducao("@tailwindcss/postcss"));
});

test("typescript e os @types estão em dependencies — `next build` faz typecheck", () => {
  // `next.config.ts` não desliga o typecheck do build. Sem `typescript` e sem os
  // tipos, o build remoto falha ou degrada em silêncio.
  for (const n of ["typescript", "@types/node", "@types/react", "@types/react-dom"]) {
    assert.ok(disponivelEmProducao(n), `"${n}" é usado pelo build e sumiria com --omit=dev`);
  }
});

test("o que é SÓ de desenvolvimento continua em devDependencies", () => {
  // O erro oposto — mover tudo para `dependencies` — infla a instalação de
  // produção e traz superfície que o servidor não precisa. Estas ferramentas
  // rodam em lint, teste e desenvolvimento, nunca em `npm run build`.
  for (const n of ["eslint", "eslint-config-next", "prisma"]) {
    if (!prod[n] && !dev[n]) continue;
    assert.ok(!disponivelEmProducao(n), `"${n}" não é usado pelo build e não deve pesar na instalação de produção`);
  }
});

test("nenhum pacote está declarado nos DOIS lados", () => {
  // Duplicata faz o npm escolher, e a escolha não é a mesma em toda versão.
  const dup = Object.keys(prod).filter((n) => Object.prototype.hasOwnProperty.call(dev, n));
  assert.deepEqual(dup, [], `declarados em dependencies E devDependencies: ${dup.join(", ")}`);
});

test("o runtime declarado é o que as dependências de produção exigem", () => {
  // @supabase/supabase-js exige >=22.0.0 e o pacote "ai" exige >=22; os scripts
  // de contrato exigem 22.6. O piso precisa satisfazer todos ao mesmo tempo.
  assert.equal(pkg.engines.node, ">=22.6");
  assert.equal(readFileSync(".nvmrc", "utf8").trim(), "22");
});
