/**
 * CONTRATO: aviso de lead sem dono não é apagado por alguém ter olhado a tela.
 *
 * ── O que foi medido em 03/08/2026 ────────────────────────────────────────
 *
 * Quatro leads da Inside entraram às 15:31:03, :04, :06 e :07. As quatro
 * geraram aviso. As quatro foram marcadas como VISTAS às 16:41:49 — no mesmo
 * segundo, 70 minutos depois. Não foram quatro pessoas percebendo quatro leads:
 * foi uma chamada ao POST, que carimba a lista inteira quando alguém abre a
 * tela por qualquer motivo.
 *
 * Três horas depois, as quatro seguiam SEM DONO, e o painel mostrava zero
 * pendências.
 *
 * O cabeçalho da própria rota já dizia a regra certa a respeito de outro
 * caminho: devolver zero sem ter conseguido ler "confirma a falsa tranquilidade
 * de uma fila parada". O POST fabricava essa tranquilidade — e passou, porque
 * zero parece bom.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { triarAlertasParaMarcar, fraseDaFila } from "../../lib/crm/alerta-que-nao-se-apaga.ts";

const chegouSemDono = (id, leadSemDono = true) => ({
  id, leadId: `lead-${id}`, motivo: "criacao", destinatarioId: null, leadSemDono,
});
const virouSua = (id) => ({
  id, leadId: `lead-${id}`, motivo: "atribuicao", destinatarioId: "corretor-1", leadSemDono: false,
});

/* ── O CASO DAS QUATRO LEADS DA INSIDE ───────────────────────────────────── */

test("as quatro que chegaram sem dono SOBREVIVEM à leitura", () => {
  const t = triarAlertasParaMarcar([
    chegouSemDono("pattricia"), chegouSemDono("estevao"),
    chegouSemDono("thiago"), chegouSemDono("manuella"),
  ]);
  assert.deepEqual(t.paraMarcar, [], "nenhum pode ser carimbado: as quatro continuam sem responsável");
  assert.equal(t.persistentes.length, 4);
  assert.match(t.motivoDaPersistencia, /ainda não tem responsável/i);
  assert.match(t.motivoDaPersistencia, /não por terem sido lidos/i, "a tela precisa explicar por que não somem");
});

test("assim que a lead ganha dono, o aviso PODE ser encerrado", () => {
  // A condição acabou. Aí sim ler basta.
  const t = triarAlertasParaMarcar([chegouSemDono("pattricia", false)]);
  assert.deepEqual(t.paraMarcar, ["pattricia"]);
  assert.deepEqual(t.persistentes, []);
  assert.equal(t.motivoDaPersistencia, null);
});

/* ── FATO E CONDIÇÃO SÃO COISAS DIFERENTES ───────────────────────────────── */

test("'passou a ser sua' é fato consumado: ler encerra", () => {
  const t = triarAlertasParaMarcar([virouSua("a"), virouSua("b")]);
  assert.deepEqual(t.paraMarcar, ["a", "b"]);
  assert.deepEqual(t.persistentes, []);
});

test("no mesmo lote, cada um segue a sua regra", () => {
  const t = triarAlertasParaMarcar([
    virouSua("ja-e-minha"),
    chegouSemDono("orfa"),
    chegouSemDono("ja-distribuida", false),
  ]);
  assert.deepEqual(t.paraMarcar.sort(), ["ja-distribuida", "ja-e-minha"]);
  assert.deepEqual(t.persistentes, ["orfa"]);
});

test("aviso de criação COM destinatário é fato: alguém foi encarregado", () => {
  // Chegou e já nasceu com dono — a condição "sem responsável" nunca existiu.
  const t = triarAlertasParaMarcar([
    { id: "x", leadId: "l", motivo: "criacao", destinatarioId: "corretor-1", leadSemDono: false },
  ]);
  assert.deepEqual(t.paraMarcar, ["x"]);
});

test("motivo desconhecido não vira persistente por acidente", () => {
  // Um motivo novo no futuro não deve herdar a regra mais restritiva sem
  // alguém decidir isso de propósito.
  const t = triarAlertasParaMarcar([
    { id: "y", leadId: "l", motivo: "reativacao", destinatarioId: null, leadSemDono: true },
  ]);
  assert.deepEqual(t.paraMarcar, ["y"]);
  assert.deepEqual(t.persistentes, []);
});

test("lista vazia não inventa motivo", () => {
  const t = triarAlertasParaMarcar([]);
  assert.deepEqual(t, { paraMarcar: [], persistentes: [], motivoDaPersistencia: null });
});

/* ── A FRASE QUE A TELA MOSTRA ───────────────────────────────────────────── */

test("a frase separa 'novas' de 'sem responsável' — são urgências diferentes", () => {
  assert.equal(fraseDaFila({ novas: 0, semDono: 0 }), "Nenhuma lead nova esperando.");
  assert.match(fraseDaFila({ novas: 9, semDono: 0 }), /9 lead\(s\) nova\(s\)/);
  assert.match(fraseDaFila({ novas: 0, semDono: 55 }), /55 lead\(s\) sem responsável/);
  assert.match(fraseDaFila({ novas: 9, semDono: 4 }), /9 .*sendo 4 SEM responsável/);
});
