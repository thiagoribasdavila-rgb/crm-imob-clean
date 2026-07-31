/**
 * Contrato: A REGIÃO DE UM PORTÃO DE CAMADA TEM DOIS LADOS.
 *
 * ── O DEFEITO QUE ISTO FIXA (2026-07-29) ────────────────────────────────────
 *
 * `check-cc23-foundation.mjs` definia a camada CC23 como `css.slice(inicioCC23)`:
 * do marcador até o FIM DO ARQUIVO. Quando o check nasceu isso estava correto por
 * acidente — o CC23 era a última coisa do globals.css, então "do marcador ao EOF" e
 * "o bloco CC23" eram a MESMA string. Nenhum teste distinguia as duas ideias.
 *
 * Depois entraram 1.988 linhas de features vizinhas (TEMA CLARO, A LÂMINA DO LEAD 360,
 * o RAIL DA SIDEBAR) e passaram a responder pelas regras do CC23 por acidente de POSIÇÃO
 * NO ARQUIVO. Medido: as 4 falhas do portão estavam 100% FORA do CC23 —
 * `backdrop-filter: blur` em L9940/L9987, `transition` solta em `.atlas-lamina-*` e
 * `.atlas-rail-*`, hex literal em `.atlas-kanban-filtro-dono`, e um
 * `@media (prefers-reduced-motion: reduce)` em L10266 que era o REMÉDIO sendo reprovado
 * por não ter `pointer: fine`.
 *
 * Portão que acusa o inocente é pior que portão nenhum: ensina a ignorar portão.
 *
 * ── POR QUE O CONTRATO OLHA A REGIÃO, E NÃO O globals.css ───────────────────
 *
 * A propriedade não é "o CC23 de hoje está limpo" — isso o `cc23:check` já mede no
 * arquivo real. A propriedade é que o RECORTE não pode derivar: nem encolher (deixando
 * CC23 de fora do exame) nem esticar (cobrando do CC23 o CSS do vizinho). Por isso as
 * asserções aqui rodam sobre CSS SINTÉTICO, onde a deriva é construída de propósito.
 *
 * E `scripts/mutacoes.mjs` roda APENAS `test:contracts`: fosse esta lógica só do
 * `*:check`, a mutação não a cobriria — a lógica que JÁ apodreceu uma vez seguiria
 * sem rede. Ela vive em `scripts/lib/cc23-regiao.mjs` para ser exercitada daqui.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MARCA_CC23,
  recortarCC23,
  seletoresCC23Fora,
  seletoresEstranhosDentro,
  movimentoDaRegiao,
  temPortaoDuplo,
  temBlurDoProprioElemento,
} from "../../scripts/lib/cc23-regiao.mjs";

const raiz = path.resolve(import.meta.dirname, "..", "..");

const banner = (titulo) =>
  `/* ==========================================================================\n   ${titulo}\n   ========================================================================== */\n`;

/** Um globals.css de brinquedo: CC6 antes, CC23 no meio, uma feature vizinha depois. */
function cssSintetico({ vizinhoTemBanner = true } = {}) {
  return [
    banner("CC6 — a geração anterior"),
    ".cc6-panel {\n  padding: 16px;\n  border: 1px solid #223;\n}\n",
    banner(MARCA_CC23),
    ":root {\n  --cc23-unit: 4px;\n}\n",
    '[data-cc23-density="compact"] .cc6-panel {\n  padding: 12px;\n}\n',
    ".cc23-row {\n  display: flex;\n}\n",
    "@media (pointer: fine) and (prefers-reduced-motion: no-preference) {\n  .cc23-lift {\n    transition: box-shadow 180ms ease;\n  }\n}\n",
    vizinhoTemBanner ? banner("TEMA CLARO — a feature vizinha") : "/* TEMA CLARO — a feature vizinha */\n",
    ".atlas-lamina-painel {\n  background: #0b1220;\n  transition: transform 200ms ease;\n  backdrop-filter: blur(8px);\n}\n",
  ].join("\n");
}

test("a região do CC23 para no banner seguinte e NÃO engole a feature vizinha", () => {
  const { camada, delimitada } = recortarCC23(cssSintetico());
  assert.equal(delimitada, true, "o terminador existe e precisa ser reconhecido");
  assert.match(camada, /\.cc23-row/, "a região tem de conter o CC23");
  assert.doesNotMatch(camada, /atlas-lamina-painel/, "a região NÃO pode conter o vizinho");
});

test("sem terminador, a ausência é RELATADA — não vira licença para engolir o resto", () => {
  // Este é o modo exato da apodrecida: `slice(inicio)` até o EOF não falhava, só
  // passava a julgar terceiros. Aqui a falta de terminador é um fato observável.
  const { delimitada } = recortarCC23(cssSintetico({ vizinhoTemBanner: false }));
  assert.equal(delimitada, false, "sem banner seguinte, `delimitada` tem de acusar");
});

test("os dois lados: nada do CC23 fora da região, nada de estranho dentro", () => {
  const css = cssSintetico();
  const { inicio, fim, camada } = recortarCC23(css);
  assert.deepEqual(seletoresCC23Fora(css, { inicio, fim }), [], "nenhum .cc23-* fora");
  assert.deepEqual(seletoresEstranhosDentro(camada), [], "nenhum seletor estranho dentro");
});

test("região que ESTICOU por cima do vizinho é pega (o lado que faltava)", () => {
  // Sem terminador a região vai até o EOF e abraça `.atlas-lamina-painel`.
  const { camada } = recortarCC23(cssSintetico({ vizinhoTemBanner: false }));
  const estranhos = seletoresEstranhosDentro(camada);
  assert.ok(
    estranhos.some((s) => s.includes("atlas-lamina-painel")),
    `a esticada tem de ser acusada; vi: ${JSON.stringify(estranhos)}`,
  );
});

test("região que ENCOLHEU deixando CC23 de fora é pega", () => {
  // Um seletor .cc23-* depois do terminador: exame estreito demais é afrouxamento.
  const css = `${cssSintetico()}\n.cc23-orfao {\n  color: red;\n}\n`;
  const { inicio, fim } = recortarCC23(css);
  const fora = seletoresCC23Fora(css, { inicio, fim });
  assert.ok(fora.some((s) => s.includes("cc23-orfao")), `órfão tem de ser acusado; vi: ${JSON.stringify(fora)}`);
});

test("o escopo opt-in [data-cc23-density] pode citar .cc6-panel sem virar estranho", () => {
  // A densidade opt-in cita o CC6 de propósito. Se isto virar "estranho", o portão
  // reprova a própria migração aditiva que o CC23 promete.
  const estranhos = seletoresEstranhosDentro(
    '[data-cc23-density="compact"] .cc6-panel {\n  padding: 12px;\n}\n',
  );
  assert.deepEqual(estranhos, []);
});

test("`filter: blur` é pego e `backdrop-filter: blur` é deixado passar", () => {
  // Os DOIS lados da âncora. Frouxa demais e o vidro legítimo (20 usos no produto)
  // é acusado de glow; apertada demais e o glow real passa.
  assert.equal(temBlurDoProprioElemento("  filter: blur(4px);"), true);
  assert.equal(temBlurDoProprioElemento("  backdrop-filter: blur(4px);"), false);
  assert.equal(temBlurDoProprioElemento("  -webkit-backdrop-filter: blur(4px);"), false);
  assert.equal(temBlurDoProprioElemento("{filter: blur(2px)}"), true);
});

test("bloco de prefers-reduced-motion:reduce é o REMÉDIO, não exige portão de ponteiro", () => {
  // Foi a 4ª falha de hoje (L10266): a guarda reprovava o bloco que DESLIGA movimento
  // por não ter `pointer: fine` — punindo exatamente a acessibilidade que ela cobra.
  const reduce =
    "@media (prefers-reduced-motion: reduce) {\n  .atlas-rail-link {\n    transition: none;\n  }\n}\n";
  const { exigemPortao, reduceQueAnima } = movimentoDaRegiao(reduce);
  assert.deepEqual(exigemPortao, [], "bloco de redução não entra na cobrança de portão");
  assert.deepEqual(reduceQueAnima, [], "`transition: none` é desligar, e é legítimo");
});

test("movimento REAL escondido dentro de um bloco reduce é pego", () => {
  // A isenção acima não pode virar porta dos fundos.
  const disfarcado =
    "@media (prefers-reduced-motion: reduce) {\n  .x {\n    transition: transform 300ms ease;\n  }\n}\n";
  assert.equal(movimentoDaRegiao(disfarcado).reduceQueAnima.length, 1);
});

test("movimento solto é pego em QUALQUER indentação, não só com 2 espaços", () => {
  // O padrão antigo exigia exatamente `\s{2}` e perdia corpo reindentado ou aninhado —
  // asserção presa a formatação, que quebra no primeiro reflow.
  for (const espaco of ["  ", "    ", "\t", "      "]) {
    const solto = `.cc23-x {\n${espaco}transition: transform 200ms ease;\n}\n`;
    assert.equal(movimentoDaRegiao(solto).soltos, 1, `indentação ${JSON.stringify(espaco)} tem de ser pega`);
  }
  const dentroDoPortao =
    "@media (pointer: fine) and (prefers-reduced-motion: no-preference) {\n  .cc23-lift {\n    transition: box-shadow 180ms ease;\n  }\n}\n";
  assert.equal(movimentoDaRegiao(dentroDoPortao).soltos, 0, "movimento sob portão NÃO é solto");
});

test("o portão duplo exige as DUAS condições, nunca uma só", () => {
  const duplo = "@media (pointer: fine) and (prefers-reduced-motion: no-preference) { transform: none; }";
  assert.equal(temPortaoDuplo(duplo), true);
  assert.equal(temPortaoDuplo("@media (pointer: fine) { transform: none; }"), false);
  assert.equal(temPortaoDuplo("@media (prefers-reduced-motion: no-preference) { transform: none; }"), false);
});

test("no globals.css REAL a região é delimitada e contém só CC23", () => {
  // A prova no arquivo vivo: se amanhã alguém colar uma feature dentro do bloco CC23,
  // ou mover um .cc23-* para fora, isto cai aqui — e não em 4 falhas que culpam o CC23
  // pelo CSS de outra pessoa.
  const css = fs.readFileSync(path.join(raiz, "app", "globals.css"), "utf8");
  const { inicio, fim, camada, delimitada } = recortarCC23(css);
  assert.notEqual(inicio, -1, "o marcador do CC23 tem de existir");
  assert.equal(delimitada, true, "a região tem de terminar num banner, não no EOF");
  assert.deepEqual(seletoresCC23Fora(css, { inicio, fim }), []);
  assert.deepEqual(seletoresEstranhosDentro(camada), []);
});
