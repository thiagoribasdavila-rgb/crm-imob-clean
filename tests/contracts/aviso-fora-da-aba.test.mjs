/**
 * Contrato do AVISO FORA DA ABA.
 *
 * A pastilha da barra lateral só existe com o Atlas em primeiro plano, e o
 * corretor passa o dia no WhatsApp e no portal. Com SLA de primeiro contato de
 * 5 minutos, perceber tarde é perder o prazo.
 *
 * Quase todo caso abaixo é sobre NÃO anunciar. Notificação repetida é a coisa
 * mais fácil de construir e a mais rápida de fazer alguém desligar — e uma
 * permissão negada não volta sozinha.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { decidirAnuncio, podarAvisados } from "../../lib/crm/aviso-fora-da-aba.ts";

const chegada = (leadId, over = {}) => ({
  leadId, nome: `Lead ${leadId}`, origem: "Meta Lead Ads", esperaMinutos: 3, ...over,
});
const estado = (over = {}) => ({
  jaAvisados: new Set(),
  linhaDeBaseEstabelecida: true,
  abaVisivel: false,
  ...over,
});

// ── O CASO QUE JUSTIFICA O MÓDULO ───────────────────────────────────────────

test("lead nova com a aba em segundo plano é anunciada, com nome e destino", () => {
  const a = decidirAnuncio([chegada("l1", { nome: "Chiara Ferro", esperaMinutos: 7 })], estado());
  assert.equal(a.paraAnunciar.length, 1);
  assert.equal(a.titulo, "Lead nova na sua carteira");
  assert.match(a.corpo, /Chiara Ferro/);
  assert.match(a.corpo, /Meta Lead Ads/);
  assert.match(a.corpo, /7 min/);
  assert.equal(a.destino, "/leads/l1", "uma lead abre a ficha, que é onde o atendimento começa");
});

test("várias leads levam à lista, não à ficha de uma delas", () => {
  const a = decidirAnuncio(
    [chegada("l1", { esperaMinutos: 2 }), chegada("l2", { esperaMinutos: 40 })],
    estado(),
  );
  assert.equal(a.titulo, "2 leads novas na sua carteira");
  assert.equal(a.destino, "/leads");
  assert.match(a.corpo, /40 min/, "a espera anunciada é a da MAIS ANTIGA — é ela que decide a urgência");
});

// ── AS TRÊS REGRAS DE SILÊNCIO ──────────────────────────────────────────────

test("não anuncia duas vezes a mesma lead", () => {
  const primeira = decidirAnuncio([chegada("l1")], estado());
  assert.equal(primeira.paraAnunciar.length, 1);

  const segunda = decidirAnuncio(
    [chegada("l1")],
    estado({ jaAvisados: new Set(primeira.proximosAvisados) }),
  );
  assert.equal(segunda.paraAnunciar.length, 0);
  assert.equal(segunda.titulo, null);
});

test("com a aba visível não anuncia — a pastilha já está fazendo isso", () => {
  const a = decidirAnuncio([chegada("l1")], estado({ abaVisivel: true }));
  assert.equal(a.paraAnunciar.length, 0);
});

test("a primeira leitura só estabelece a linha de base", () => {
  // Abrir o Atlas de manhã com 8 pendentes de ontem não são 8 novidades.
  const chegadas = Array.from({ length: 8 }, (_, i) => chegada(`l${i}`));
  const a = decidirAnuncio(chegadas, estado({ linhaDeBaseEstabelecida: false }));
  assert.equal(a.paraAnunciar.length, 0);
  assert.equal(a.proximosAvisados.length, 8, "mas todas passam a contar como conhecidas");
});

test("o que foi suprimido NÃO volta a tocar quando a aba é minimizada", () => {
  // Este é o caso que o `proximosAvisados` existe para cobrir: se os ids
  // suprimidos ficassem de fora, minimizar a janela dispararia o anúncio de
  // tudo o que a pessoa acabou de ver na tela.
  const comAbaAberta = decidirAnuncio([chegada("l1"), chegada("l2")], estado({ abaVisivel: true }));
  assert.equal(comAbaAberta.paraAnunciar.length, 0);

  const depoisDeMinimizar = decidirAnuncio(
    [chegada("l1"), chegada("l2")],
    estado({ jaAvisados: new Set(comAbaAberta.proximosAvisados), abaVisivel: false }),
  );
  assert.equal(depoisDeMinimizar.paraAnunciar.length, 0);
});

test("entre as conhecidas, só a nova é anunciada", () => {
  const a = decidirAnuncio(
    [chegada("velha"), chegada("nova", { nome: "Hericles Lima" })],
    estado({ jaAvisados: new Set(["velha"]) }),
  );
  assert.equal(a.paraAnunciar.length, 1);
  assert.equal(a.titulo, "Lead nova na sua carteira");
  assert.match(a.corpo, /Hericles Lima/);
});

test("lista vazia não produz aviso nem apaga o que já era conhecido", () => {
  const a = decidirAnuncio([], estado({ jaAvisados: new Set(["l1"]) }));
  assert.equal(a.titulo, null);
  assert.deepEqual(a.proximosAvisados, ["l1"]);
});

test("lead que acabou de chegar diz 'agora', não '0 min'", () => {
  const a = decidirAnuncio([chegada("l1", { esperaMinutos: 0 })], estado());
  assert.match(a.corpo, /agora$/);
  assert.ok(!/0 min/.test(a.corpo));
});

// ── A MEMÓRIA NÃO CRESCE SEM FIM ────────────────────────────────────────────

test("a memória de avisados é podada pelos mais ANTIGOS", () => {
  const ids = Array.from({ length: 600 }, (_, i) => `l${i}`);
  const podados = podarAvisados(ids, 500);
  assert.equal(podados.length, 500);
  assert.equal(podados[0], "l100", "os recentes ficam: são eles que podem reaparecer");
  assert.equal(podados.at(-1), "l599");
});

test("podar não duplica nem reordena o que cabe", () => {
  assert.deepEqual(podarAvisados(["a", "b", "a"], 500), ["a", "b"]);
});
