/**
 * CONTRATO: a represa cobre TODAS as Páginas, não a eleita.
 *
 * ── O defeito, e por que ele nasceu da minha própria correção ─────────────
 *
 * De manhã, 03/08/2026, corrigi a represa: ela lia a Página de META_PAGE_ID,
 * variável ausente no servidor, e devolvia 0 com 103 leads esperando. Passei a
 * eleger a Página a partir de `meta_lead_sources` e marquei `ambigua: true`
 * quando havia mais de uma candidata.
 *
 * À tarde, conectada a Página da Inside, o produto passou a ter DUAS. E a
 * represa devolveu `totalRepresado: 0` de novo — com 198 leads esperando lá.
 * A rota SABIA que havia duas (`paginasRegistradas: 2, ambigua: true`) e ainda
 * assim olhava para uma.
 *
 * Eu tinha construído o aviso e não a cobertura. Marcar "houve escolha" é
 * inútil quando a escolha não devia existir: represa não é uma pergunta sobre
 * UMA Página, é sobre tudo que a operação paga e não recebe.
 *
 * `elegerPagina` continua existindo — quem precisa de UMA Página (derivar token
 * para uma chamada, preencher um campo padrão na tela) continua elegendo. O que
 * muda é quem pergunta "quanto está represado": esse pergunta a todas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegerPagina, paginasRegistradas } from "../../lib/meta/pagina-da-organizacao.ts";

const DAVILA = "582258611872380";
const INSIDE = "1115087091694606";

/* ── O CASO EXATO DE 03/08/2026 ──────────────────────────────────────────── */

test("com duas Páginas, TODAS voltam — a represa não pode escolher uma", () => {
  const linhas = [
    ...Array.from({ length: 29 }, (_, i) => ({ page_id: DAVILA, active: i < 16 })),
    { page_id: INSIDE, active: true },
    { page_id: INSIDE, active: false },
  ];
  const todas = paginasRegistradas(linhas);
  assert.equal(todas.length, 2, "duas Páginas registradas, duas na resposta");
  assert.deepEqual(
    todas.map((p) => p.pageId).sort(),
    [INSIDE, DAVILA].sort(),
  );
});

test("a Página com MENOS fontes não pode sumir — foi ela que escondeu 198 leads", () => {
  // A Inside tinha 1 fonte ativa contra 16 da DA'Vila. A eleição por "mais
  // ativas" a descartava, e era justamente ela que tinha a represa inteira.
  const linhas = [
    ...Array.from({ length: 16 }, () => ({ page_id: DAVILA, active: true })),
    { page_id: INSIDE, active: true },
  ];
  const todas = paginasRegistradas(linhas);
  const inside = todas.find((p) => p.pageId === INSIDE);
  assert.ok(inside, "a Página minoritária tem de estar na lista");
  assert.equal(inside.fontesAtivas, 1);
});

test("só as ATIVAS entram — Página com fontes todas desligadas não gera consulta à Graph", () => {
  // Consultar a Graph por uma Página que a operação desligou gasta cota e não
  // muda decisão nenhuma: fonte inativa descarta a lead de qualquer jeito.
  const todas = paginasRegistradas([
    { page_id: DAVILA, active: true },
    { page_id: "999999999999", active: false },
    { page_id: "999999999999", active: false },
  ]);
  assert.deepEqual(todas.map((p) => p.pageId), [DAVILA]);
});

test("a ordem é estável — mais ativas primeiro, id como desempate", () => {
  const a = paginasRegistradas([
    { page_id: INSIDE, active: true },
    { page_id: DAVILA, active: true },
    { page_id: DAVILA, active: true },
  ]);
  const b = paginasRegistradas([
    { page_id: DAVILA, active: true },
    { page_id: DAVILA, active: true },
    { page_id: INSIDE, active: true },
  ]);
  assert.deepEqual(a.map((p) => p.pageId), b.map((p) => p.pageId), "mesma entrada, mesma ordem");
  assert.equal(a[0].pageId, DAVILA, "quem tem mais fonte ativa vem primeiro");
});

test("sem nenhuma fonte, lista vazia — e vazio aqui significa NADA REGISTRADO", () => {
  assert.deepEqual(paginasRegistradas([]), []);
  assert.deepEqual(paginasRegistradas([{ page_id: null, active: true }]), []);
});

/* ── ELEGER CONTINUA VALENDO PARA QUEM PRECISA DE UMA SÓ ─────────────────── */

test("elegerPagina não foi removida: quem precisa de UMA continua elegendo", () => {
  const linhas = [
    { page_id: DAVILA, active: true },
    { page_id: DAVILA, active: true },
    { page_id: INSIDE, active: true },
  ];
  const uma = elegerPagina(linhas);
  assert.equal(uma.pageId, DAVILA);
  assert.equal(uma.ambigua, true, "avisar que houve escolha continua importando para quem elege");
  // E a lista completa não perde ninguém.
  assert.equal(paginasRegistradas(linhas).length, 2);
});
