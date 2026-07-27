/**
 * Contrato: NENHUMA LEAD PAGA É DESCARTADA.
 *
 * ── O QUE FOI MEDIDO ────────────────────────────────────────────────────────
 *
 * A Meta versiona formulário a cada edição: "Arvo - novo (v4)" vira "(v5)" com
 * um form_id NOVO. O CRM ficou preso na versão antiga:
 *
 *   ATIVO    Arvo - novo (v4)      0 leads
 *   inativo  Arvo - novo (v5)     11 leads
 *   inativo  Spin Mood (v7)        7 leads
 *   inativo  Spin Mood             3 leads
 *
 * O webhook filtrava `active = true` e, sem fonte, fazia `continue`. A lead —
 * que já custou verba para chegar — virava uma linha de log e sumia.
 *
 * ── AS DUAS PROMESSAS ───────────────────────────────────────────────────────
 *
 *   1. **Nada se perde.** Fonte desconhecida é registrada e o evento gravado.
 *   2. **Nada entra sozinho.** A fonte nasce INATIVA e a lead fica retida até
 *      alguém liberar. Registrar não é ativar.
 *
 * Rodar: node --test tests/contracts/ingestao-nao-descarta.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const webhook = fs.readFileSync(path.join(raiz, "app", "api", "webhooks", "meta", "route.ts"), "utf8");
const processador = fs.readFileSync(path.join(raiz, "app", "api", "v2", "outbox", "process", "route.ts"), "utf8");
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("fonte desconhecida é registrada em vez de virar log", () => {
  const codigo = semComentarios(webhook);
  assert.match(codigo, /\.from\("meta_lead_sources"\)[\s\S]{0,200}\.insert\(\{/,
    "sem o registro, a lead não tem source_id e o evento não pode ser gravado");
  assert.match(codigo, /name: `\[auto\] Formulário/,
    "o nome tem que denunciar que foi descoberto pelo webhook, não cadastrado por alguém");
});

test("a fonte auto-registrada nasce INATIVA", () => {
  // Ativar sozinho faria o Atlas aceitar qualquer formulário que alguém criasse
  // na página da Meta, sem ninguém decidir.
  const trecho = webhook.slice(webhook.indexOf('name: `[auto] Formulário'), webhook.indexOf('name: `[auto] Formulário') + 200);
  assert.match(trecho, /active: false/, "registrar não é ativar");
});

test("página completamente desconhecida NÃO inventa organização", () => {
  // Sem saber a qual empresa a lead pertence, gravá-la em alguma seria pior que
  // perdê-la: vazaria dado de um cliente para outro.
  const codigo = semComentarios(webhook);
  assert.match(codigo, /if \(!organizacaoDaPagina\.data\?\.organization_id\)/);
  assert.match(webhook, /reason: "unknown_page"/);
});

test("corrida de registro simultâneo é tratada", () => {
  // Dois eventos do mesmo lote podem tentar registrar a mesma fonte. O segundo
  // relê em vez de desistir e perder a lead.
  const codigo = semComentarios(webhook);
  assert.match(codigo, /const relida = await admin[\s\S]{0,200}\.from\("meta_lead_sources"\)/);
  assert.match(codigo, /source = relida\.data;/);
});

test("o processador RESPEITA a fonte inativa", () => {
  const codigo = semComentarios(processador);
  assert.match(codigo, /select\("active,default_owner_id/,
    "sem buscar `active`, a flag não significa nada");
  assert.match(codigo, /if \(sourceResult\.data\?\.active === false\)/);
  assert.match(codigo, /status: "blocked"/,
    "o evento fica retido com status próprio, não é apagado");
});

test("a lead retida diz o que fazer para destravá-la", () => {
  assert.match(
    processador,
    /Fonte inativa: libere o formulário em Marketing → Leads represadas/,
    "erro que não diz o próximo passo vira ticket de suporte",
  );
});

test("o evento retido preserva o payload inteiro", () => {
  // O ponto de reter em vez de descartar é poder recuperar depois. Um evento
  // sem payload é um registro de que algo se perdeu, não a lead.
  const codigo = semComentarios(webhook);
  assert.match(codigo, /payload: value/, "o corpo do evento tem que ser gravado");
});
