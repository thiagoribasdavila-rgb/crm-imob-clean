/**
 * Contrato do CONSENTIMENTO META.
 *
 * Medido no banco vivo antes de escrever: 217 leads, TODAS com e-mail ou
 * telefone, sete já em etapa que dispara evento de conversão — e ZERO prontas
 * para enviar. Faltava uma coisa só, em todas: ninguém registrou consentimento.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const rota = ler("app", "api", "v1", "crm", "leads", "meta-consent", "route.ts");
const painel = ler("components", "crm", "meta-consent-control.tsx");
const lib = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(ler("lib", "crm", "meta-consent.ts")))}`
);

test("ausência NUNCA vira consentimento", () => {
  for (const md of [null, undefined, {}, { meta: {} }, { meta: { ad_id: "1" } }]) {
    assert.equal(lib.lerEstado(md), "nao_perguntado");
  }
});

test("a atribuição da lead é preservada ao gravar", () => {
  // Sobrescrever `meta` apagaria ad_id/form_id/campaign_id — a atribuição que
  // faz o funil por criativo funcionar.
  const antes = { meta: { ad_id: "120251113236390624", form_id: "999" }, outro: "x" };
  const d = lib.aplicarConsentimento(antes, { estado: "concedido", origem: "declarado_pelo_corretor", registradoPor: "p1" });
  assert.equal(d.meta.ad_id, "120251113236390624");
  assert.equal(d.meta.form_id, "999");
  assert.equal(d.outro, "x");
});

test("o booleano que o capi-window lê continua sendo gravado", () => {
  // Duas verdades sobre a mesma coisa é o defeito que este projeto vem
  // desfazendo: o estado é legível, o booleano é o que o envio consulta.
  const d = lib.aplicarConsentimento({}, { estado: "concedido", origem: "declarado_pelo_corretor", registradoPor: "p1" });
  assert.equal(d.meta.dataSharingConsent, true);
  const n = lib.aplicarConsentimento({}, { estado: "nao_perguntado", origem: "declarado_pelo_corretor", registradoPor: "p1" });
  assert.equal(n.meta.dataSharingConsent, false, "'não perguntei' não envia");
});

test("quem registrou e quando ficam gravados", () => {
  // "O sistema diz que sim" não é resposta numa fiscalização.
  const d = lib.aplicarConsentimento({}, { estado: "concedido", origem: "declarado_pelo_corretor", registradoPor: "perfil-1" });
  assert.equal(d.meta.registradoPor, "perfil-1");
  assert.ok(d.meta.registradoEm);
  assert.equal(d.meta.origem, "declarado_pelo_corretor");
});

test("só o dono da lead ou a liderança registram", () => {
  assert.match(rota, /lead\.assigned_to === perfilId \|\| lead\.assigned_user_id === perfilId/);
  assert.match(rota, /Só quem atende a lead — ou a liderança/);
  assert.match(rota, /status: 403/);
});

test("'formulario_meta' não pode ser marcado à mão", () => {
  // Essa base vem do webhook, quando a lead preencheu dentro da Meta. Deixar
  // marcar à mão transformaria base verificável em afirmação sem lastro.
  assert.match(rota, /`formulario_meta` não é\s*\n?\s*\/\/ aceito aqui|`formulario_meta` não é/);
  assert.match(rota, /corpo\?\.origem === "importado"\s*\?\s*"importado" : "declarado_pelo_corretor"/);
});

test("as três respostas existem, e 'não perguntei' é uma delas", () => {
  assert.deepEqual([...lib.ESTADOS].sort(), ["concedido", "nao_perguntado", "negado"]);
  assert.match(painel, /Ainda não perguntei/);
  assert.match(painel, /um "sim" que não aconteceu é pior/,
    "a razão de existir a terceira opção precisa estar escrita");
});

test("falha de rede DESFAZ o estado otimista", () => {
  // Mostrar "autorizado" para algo que não gravou é o pior erro possível aqui.
  assert.match(painel, /setEstado\(anterior\)/);
  assert.match(painel, /nada foi registrado/);
});

test("a tela diz a consequência de não registrar", () => {
  assert.match(painel, /não volta para otimizar a campanha/);
});

test("o controle está na tela da lead, junto das ações", () => {
  const pagina = ler("app", "(crm)", "leads", "[id]", "page.tsx");
  assert.match(pagina, /<MetaConsentControl/);
  assert.match(pagina, /estadoInicial=\{lerEstado\(lead\.metadata\)\}/);
});

// ── Assertivo para o corretor: só pede o que falta ─────────────────────────

test("lead já respondida não pede decisão de novo", () => {
  // 204 de 217 leads já têm consentimento. Três botões em todas elas é pedir
  // 204 reconfirmações — e é assim que se treina alguém a ignorar o painel.
  assert.match(painel, /const resolvido = estado !== "nao_perguntado";/);
  assert.match(painel, /if \(resolvido && !aberto\)/);
  assert.match(painel, /atlas-consent-resumo/);
});

test("resolvido continua alterável, sem estar no caminho", () => {
  assert.match(painel, /onClick=\{\(\) => setAberto\(true\)\}/);
  assert.match(painel, /· alterar/);
});

test("só o pendente pede atenção — é o único que bloqueia", () => {
  assert.match(painel, /data-pendente=\{!resolvido\}/);
  const css = ler("app", "globals.css");
  assert.match(css, /\.atlas-consent\[data-pendente="true"\]/);
  assert.match(css, /border-left: 2px solid var\(--atlas-warning\)/);
});

test("pendente pergunta, resolvido afirma", () => {
  // Título em pergunta convida a responder; em afirmação, só informa.
  assert.match(painel, /O cliente autorizou compartilhar os dados com a Meta\?/);
  assert.match(painel, /Enquanto você não responder, o resultado desta lead não volta/);
});
