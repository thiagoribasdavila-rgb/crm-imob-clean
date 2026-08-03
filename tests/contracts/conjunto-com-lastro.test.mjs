/**
 * CONTRATO: a poda por lastro não desalinha o feixe, e o fallback não é buraco.
 *
 * O modo padrão do estúdio de criativos gravava em `creative_assets` sem
 * conferir lastro — a porta irmã do modo `variacoes_com_lastro`, que confere.
 * Ao fechá-la, dois erros ficaram fáceis de cometer, e são estes os casos:
 *
 *   1. filtrar cada lista por conta própria, desalinhando título de um conceito
 *      com o texto de outro;
 *   2. julgar `arr[i]` quando a gravação usa `arr[i] ?? arr[0]` — deixando um
 *      texto reprovado entrar por uma posição que nem texto próprio tem.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { podarConjuntoSemLastro, textosPublicaveis } from "../../lib/marketing/conjunto-com-lastro.ts";

/** Três conceitos, cada um com seu título/texto/descrição. */
function conjunto() {
  return {
    conceitos: [
      { nome: "A", angulo: "a", publicoAlvo: "p" },
      { nome: "B", angulo: "b", publicoAlvo: "p" },
      { nome: "C", angulo: "c", publicoAlvo: "p" },
    ],
    titulos: ["titulo A", "titulo B", "titulo C"],
    textosPrincipais: ["texto A", "texto B", "texto C"],
    descricoes: ["desc A", "desc B", "desc C"],
    ctas: ["cta A", "cta B", "cta C"],
    roteirosVideo: [{ titulo: "roteiro", cenas: ["cena"] }],
  };
}

test("sem reprovação, o conjunto atravessa inteiro", () => {
  const { conjunto: saida, recusadas } = podarConjuntoSemLastro(conjunto(), new Set());
  assert.deepEqual(recusadas, []);
  assert.deepEqual(saida.conceitos.map((c) => c.nome), ["A", "B", "C"]);
  assert.deepEqual(saida.titulos, ["titulo A", "titulo B", "titulo C"]);
});

test("a posição reprovada sai INTEIRA — e o que sobra continua casado", () => {
  const { conjunto: saida, recusadas } = podarConjuntoSemLastro(conjunto(), new Set(["texto B"]));

  assert.equal(recusadas.length, 1);
  assert.equal(recusadas[0].conceito, "B");
  assert.equal(recusadas[0].campo, "texto principal");

  // O ponto do contrato: A continua com A, C continua com C. Se cada lista
  // fosse filtrada sozinha, "titulo C" cairia ao lado do conceito "B".
  assert.deepEqual(saida.conceitos.map((c) => c.nome), ["A", "C"]);
  assert.deepEqual(saida.titulos, ["titulo A", "titulo C"]);
  assert.deepEqual(saida.textosPrincipais, ["texto A", "texto C"]);
  assert.deepEqual(saida.descricoes, ["desc A", "desc C"]);
  assert.deepEqual(saida.ctas, ["cta A", "cta C"]);
});

test("O BURACO DO FALLBACK: posição sem texto próprio herda o da posição 0 — e é julgada por ele", () => {
  // O modelo devolveu 3 conceitos e só 1 texto principal. `salvarCriativos`
  // grava `textosPrincipais[i] ?? textosPrincipais[0]`, então B e C gravariam o
  // MESMO "texto A". Se "texto A" não tem lastro, as três posições estão
  // contaminadas — não só a primeira.
  const entrada = conjunto();
  entrada.textosPrincipais = ["texto A"];

  const { conjunto: saida, recusadas } = podarConjuntoSemLastro(entrada, new Set(["texto A"]));

  assert.deepEqual(
    saida.conceitos,
    [],
    "julgar arr[i] em vez do valor efetivo deixaria B e C passarem gravando o texto reprovado da posição 0",
  );
  assert.equal(recusadas.length, 3);
  assert.deepEqual(recusadas.map((r) => r.conceito), ["A", "B", "C"]);
});

test("lista mais curta que os conceitos não vira buraco no feixe", () => {
  const entrada = conjunto();
  entrada.descricoes = ["desc A"]; // só a primeira veio

  const { conjunto: saida } = podarConjuntoSemLastro(entrada, new Set(["titulo B"]));

  assert.deepEqual(saida.conceitos.map((c) => c.nome), ["A", "C"]);
  // A lista curta continua curta e SEM undefined no meio — `undefined` viraria
  // `null` no insert e apagaria a descrição de uma peça aprovada.
  assert.deepEqual(saida.descricoes, ["desc A"]);
  assert.ok(saida.descricoes.every((d) => typeof d === "string"));
});

test("o roteiro de vídeo não é descartado sem ter sido julgado", () => {
  const { conjunto: saida } = podarConjuntoSemLastro(conjunto(), new Set(["titulo A", "titulo B", "titulo C"]));
  assert.deepEqual(saida.conceitos, []);
  assert.equal(saida.roteirosVideo.length, 1, "sumir em silêncio é a forma muda do mesmo erro");
});

test("o que vai para a auditoria são os textos publicáveis, sem repetição nem vazio", () => {
  const entrada = conjunto();
  entrada.titulos = ["igual", "igual", ""];
  const textos = textosPublicaveis(entrada);

  assert.equal(textos.filter((t) => t === "igual").length, 1, "texto repetido não deve ser auditado duas vezes");
  assert.ok(!textos.includes(""), "string vazia não é texto publicável");
  assert.ok(textos.includes("texto A") && textos.includes("desc A"));
});
