/**
 * Contraste dos dois temas — o guarda que faltava.
 *
 * Este projeto tinha 224 verificadores que leem texto-fonte e nenhum que CALCULA. O
 * resultado apareceu na primeira medição séria: `#6b7890`, a cor de texto secundário mais
 * usada do produto — 367 ocorrências — dava 4,21:1 no fundo escuro e reprovava AA. E o
 * token equivalente, que quase ninguém usava, também reprovava numa das três superfícies
 * (4,49:1 no painel). Ninguém tinha percebido porque ninguém tinha contado.
 *
 * Esta suíte lê os tokens REAIS do CSS e calcula o contraste de cada par que a interface
 * de fato produz, nos DOIS temas. Não é uma tabela copiada — se alguém trocar um valor no
 * arquivo, o número aqui muda junto.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(import.meta.dirname, "..");
const tokensCss = readFileSync(join(raiz, "styles/atlas-tokens.css"), "utf8");
const globaisCss = readFileSync(join(raiz, "app/globals.css"), "utf8");

/** Lê os tokens de um bloco de seletor específico. */
function tokensDe(css: string, seletor: string): Map<string, string> {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bloco = new RegExp(`${escapado}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  const mapa = new Map<string, string>();
  if (!bloco) return mapa;
  for (const m of bloco[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) mapa.set(m[1], m[2].trim());
  return mapa;
}

const escuro = new Map([...tokensDe(tokensCss, ":root"), ...tokensDe(globaisCss, ":root")]);
const claro = new Map([...escuro, ...tokensDe(globaisCss, ':root[data-theme="light"]')]);

function resolver(mapa: Map<string, string>, nome: string, profundidade = 0): string | null {
  const bruto = mapa.get(nome);
  if (!bruto || profundidade > 8) return null;
  const ref = /^var\(\s*(--[a-z0-9-]+)/.exec(bruto);
  return ref ? resolver(mapa, ref[1], profundidade + 1) : bruto;
}

function paraRgb(cor: string): [number, number, number] | null {
  const hex6 = /^#([0-9a-f]{6})$/i.exec(cor.trim());
  if (hex6) return [0, 2, 4].map((i) => parseInt(hex6[1].slice(i, i + 2), 16)) as [number, number, number];
  const hex3 = /^#([0-9a-f]{3})$/i.exec(cor.trim());
  if (hex3) return [...hex3[1]].map((c) => parseInt(c + c, 16)) as [number, number, number];
  return null;
}

function luminancia([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contraste(mapa: Map<string, string>, textoTok: string, fundoTok: string): number | null {
  const a = paraRgb(resolver(mapa, textoTok) ?? "");
  const b = paraRgb(resolver(mapa, fundoTok) ?? "");
  if (!a || !b) return null;
  const [hi, lo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Os pares que a interface produz de verdade: cada nível de texto sobre cada superfície. */
const TEXTOS = ["--atlas-text-primary", "--atlas-text-secondary", "--atlas-text-tertiary"];
const FUNDOS = ["--atlas-canvas", "--atlas-surface", "--atlas-surface-subtle"];
const SEMANTICOS = ["--atlas-success", "--atlas-warning", "--atlas-danger", "--atlas-accent"];

for (const [nomeTema, mapa] of [["escuro", escuro], ["claro", claro]] as const) {
  describe(`contraste — tema ${nomeTema}`, () => {
    test("todo nível de texto passa AA sobre TODA superfície", () => {
      // Testar só a superfície principal esconde o defeito: foi exatamente assim que o
      // terciário passava despercebido — ele reprovava apenas no painel.
      const falhas: string[] = [];
      for (const t of TEXTOS) {
        for (const f of FUNDOS) {
          const r = contraste(mapa, t, f);
          assert.ok(r !== null, `não consegui resolver ${t} sobre ${f} no tema ${nomeTema}`);
          if (r < 4.5) falhas.push(`${t} sobre ${f}: ${r.toFixed(2)}:1`);
        }
      }
      assert.deepEqual(falhas, [], `pares abaixo de AA no tema ${nomeTema}:\n  ${falhas.join("\n  ")}`);
    });

    test("cores semânticas são legíveis sobre a superfície", () => {
      // Sucesso, alerta, risco e acento carregam SIGNIFICADO. Ilegíveis, o significado
      // se perde justamente onde ele mais importa.
      const falhas: string[] = [];
      for (const s of SEMANTICOS) {
        const r = contraste(mapa, s, "--atlas-surface");
        assert.ok(r !== null, `não consegui resolver ${s} no tema ${nomeTema}`);
        if (r < 4.5) falhas.push(`${s}: ${r.toFixed(2)}:1`);
      }
      assert.deepEqual(falhas, [], `semânticos abaixo de AA no tema ${nomeTema}:\n  ${falhas.join("\n  ")}`);
    });
  });
}

describe("os dois temas existem e são distintos", () => {
  test("o tema claro redefine a base, não apenas alguns detalhes", () => {
    const chaves = ["--atlas-canvas", "--atlas-surface", "--atlas-text-primary", "--atlas-accent"];
    for (const k of chaves) {
      const e = resolver(escuro, k);
      const c = resolver(claro, k);
      assert.ok(e && c, `token ${k} ausente em algum tema`);
      assert.notEqual(c, e, `${k} é igual nos dois temas — o claro não está redefinindo a base`);
    }
  });

  test("o claro é de fato mais claro que o escuro", () => {
    // Evita o erro clássico de declarar um tema claro que continua escuro por engano.
    const fundoEscuro = paraRgb(resolver(escuro, "--atlas-canvas") ?? "");
    const fundoClaro = paraRgb(resolver(claro, "--atlas-canvas") ?? "");
    assert.ok(fundoEscuro && fundoClaro);
    assert.ok(
      luminancia(fundoClaro) > luminancia(fundoEscuro),
      "o canvas do tema claro não é mais luminoso que o do escuro",
    );
  });
});
