/**
 * PROVA DE QUE MEDIR PROPRIEDADE DE CSS REPROVA — e de que buscar texto não.
 *
 * `scripts/lib/css-propriedade.mjs` existe desde 01/08/2026 e nunca teve
 * contrato: era a ferramenta contra asserções que não sabem falhar, sem prova
 * de que ela própria sabe. Em 02/08/2026 mais nove asserções passaram a
 * depender dela (fases 026, 027, 028, 032, 033, 034, 092, o sprint corretivo
 * 050-059 e a evolução 500), e uma ferramenta de medição sem refutação seria a
 * mesma armadilha um nível acima.
 *
 * Cada teste tem os dois lados: a busca por texto APROVA a folha quebrada, e a
 * medição de propriedade REPROVA a mesma folha. É essa diferença que justifica
 * cada reapontamento.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  familiaDeclara,
  mediaAlcanca,
  regrasQueCitam,
  temAlvoDeToque,
  valorDoToken,
} from "../../scripts/lib/css-propriedade.mjs";

/* Uma folha onde tudo o que os portões procuravam EXISTE — só que nos lugares
   errados. É a forma exata do defeito medido em `app/globals.css`:
   `min-height: 44px` em 45 lugares, `transform: none` em 33, `display: none`
   em incontáveis. */
const FOLHA_ENGANOSA = `
  .rodape-decorativo { display: none; text-overflow: ellipsis; min-height: 44px; transform: none; }
  @media (max-width: 374px) { .banner-promocional { font-size: 12px; } }
  .atlas-mobile-dock-action small { font-size: 11px; }
  .atlas-quick-create strong { font-weight: 600; }
  .atlas-page-action { padding: 4px; }
`;

test("a busca por texto APROVA a folha quebrada — é o defeito, reproduzido", () => {
  assert.ok(FOLHA_ENGANOSA.includes("min-height: 44px"));
  assert.ok(FOLHA_ENGANOSA.includes("display: none"));
  assert.ok(FOLHA_ENGANOSA.includes("text-overflow: ellipsis"));
  assert.ok(FOLHA_ENGANOSA.includes("@media (max-width: 374px)"));
  assert.ok(FOLHA_ENGANOSA.includes(".atlas-mobile-dock-action small"));
});

test("a medição de propriedade REPROVA a mesma folha", () => {
  assert.equal(temAlvoDeToque(FOLHA_ENGANOSA, ".atlas-page-action", 44), false);
  assert.equal(familiaDeclara(FOLHA_ENGANOSA, ".atlas-quick-create strong", "display", "none"), false);
  assert.equal(mediaAlcanca(FOLHA_ENGANOSA, "max-width: 374px", ".atlas-mobile-dock-action small"), false);
});

test("e APROVA quando a propriedade está mesmo no corpo da regra", () => {
  const certa = `
    .atlas-page-action { min-height: 44px; }
    .atlas-quick-create strong { display: none; }
    @media (max-width: 374px) { .atlas-mobile-dock-action small { font-size: 10px; } }
  `;
  assert.equal(temAlvoDeToque(certa, ".atlas-page-action", 44), true);
  assert.equal(familiaDeclara(certa, ".atlas-quick-create strong", "display", "none"), true);
  assert.equal(mediaAlcanca(certa, "max-width: 374px", ".atlas-mobile-dock-action small"), true);
});

test("alvo de toque abaixo do mínimo reprova — o número é comparado, não casado", () => {
  assert.equal(temAlvoDeToque(".alvo { min-height: 40px; }", ".alvo", 44), false);
  assert.equal(temAlvoDeToque(".alvo { min-height: 44px; }", ".alvo", 44), true);
  assert.equal(temAlvoDeToque(".alvo { height: 48px; }", ".alvo", 44), true, "altura fixa também é alvo");
});

test("comentário não é implementação", () => {
  const soComentario = "/* .atlas-page-action { min-height: 44px; } */ .atlas-page-action { padding: 2px; }";
  assert.equal(temAlvoDeToque(soComentario, ".atlas-page-action", 44), false);
});

/* ── TOKEN: distinguir "vale 44px" de "não existe" ────────────────────────── */

test("valorDoToken separa token declarado de token apenas USADO", () => {
  /* O caso medido em `check-evolution-phase-092.mjs`:
     `css.includes("--atlas-control-height-touch")` tinha UMA ocorrência em
     `app/globals.css`, e ela é `min-height: var(--atlas-control-height-touch)`
     — um uso. A declaração vive em `styles/atlas-tokens.css`. */
  const soUso = ".alvo { min-height: var(--atlas-control-height-touch); }";
  assert.ok(soUso.includes("--atlas-control-height-touch"), "a busca por texto acha");
  assert.equal(valorDoToken(soUso, "--atlas-control-height-touch"), null, "e a medição sabe que não vale nada");

  assert.equal(valorDoToken(":root { --atlas-control-height-touch: 44px; }", "--atlas-control-height-touch"), 44);
  assert.equal(valorDoToken(":root { --x: 1728px; }", "--x"), 1728);
  assert.equal(valorDoToken("/* --x: 44px; */", "--x"), null, "declaração comentada não vale");
});

test("os tokens vivos que os portões cobram continuam declarados", () => {
  const tokens = readFileSync("styles/atlas-tokens.css", "utf8");
  assert.equal(valorDoToken(tokens, "--atlas-control-height-touch"), 44);
  assert.equal(valorDoToken(tokens, "--atlas-content-max"), 1728);
});

/* ── ESCOPO: o corpo da regra, não o arquivo ──────────────────────────────── */

test("regrasQueCitam devolve o CORPO, e o corpo é o que decide", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const ambient = regrasQueCitam(css, ".atlas-ambient");
  assert.ok(ambient.length > 5, `esperava várias regras .atlas-ambient, achei ${ambient.length}`);

  /* A medição que derrubou a asserção da fase 092: `transform: none` aparece
     dezenas de vezes no arquivo e NENHUMA na família que a asserção nomeava. */
  assert.ok((css.match(/transform: none/g) || []).length > 10, "o texto está por toda parte");
  assert.equal(
    ambient.some(({ corpo }) => /transform:\s*none/.test(corpo)),
    false,
    "e em nenhuma regra da família — era isso que a asserção não sabia",
  );
});
