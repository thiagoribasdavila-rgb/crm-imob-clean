/**
 * Contrato: NENHUM WHATSAPP SAI POR NÚMERO QUE NÃO ESTÁ PRONTO.
 *
 * ── O que foi medido (2026-07-28) ───────────────────────────────────────────
 *
 * O número configurado estava numa WABA aprovada, qualidade GREEN — e mesmo
 * assim `code_verification_status: NOT_VERIFIED`, `status: DISCONNECTED`,
 * `platform_type: ON_PREMISE`. Cadastrado não é ativo: um número assim não
 * envia nada, e a Graph devolveria um erro opaco POR MENSAGEM, queimando a
 * fila inteira sem apontar a causa.
 *
 * O preflight em `deliverWhatsApp` — o ponto único por onde todo envio real
 * passa (ensaio de template e abordagem noturna incluídos) — verifica o número
 * ANTES do primeiro envio e recusa com o passo que falta e QUEM resolve.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const rota = fs.readFileSync(path.join(raiz, "app", "api", "v2", "outbox", "process", "route.ts"), "utf8");
/** Sem comentários: o cabeçalho CITA o estado quebrado para explicá-lo. */
const codigo = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("o envio verifica o número ANTES de sair", () => {
  const iPreflight = codigo.indexOf("preflightNumeroWhatsApp(phoneNumberId");
  const iEnvio = codigo.indexOf("/messages`");
  assert.ok(iPreflight > -1, "o preflight sumiu de deliverWhatsApp");
  assert.ok(iEnvio > -1);
  assert.ok(iPreflight < iEnvio, "verificar depois de enviar não protege nada");
  assert.match(codigo, /if \(bloqueio\) throw new Error\(`Envio bloqueado antes de sair/);
});

test("número não verificado e plataforma errada são causas DISTINTAS", () => {
  // "Não funciona" sem distinguir manda a pessoa errada resolver: a verificação
  // é de quem tem o aparelho; a migração de plataforma é no WhatsApp Manager.
  assert.match(codigo, /code_verification_status.*!== "VERIFIED"/s);
  assert.match(codigo, /platform_type.*!== "CLOUD_API"/s);
  assert.match(rota, /Quem resolve: quem tem o aparelho/i);
});

test("rede fora não autoriza envio às cegas", () => {
  // Falha FECHADA: se a verificação não completou, o envio não sai — mas o
  // motivo diz que foi a verificação, não o número.
  assert.match(rota, /verifica[çc][ãa]o do n[úu]mero n[ãa]o completou/i);
});

test("um GET por lote, não por mensagem", () => {
  // O estado do número não muda entre duas mensagens do mesmo lote; pagar um
  // GET por mensagem dobraria a latência da fila sem ganhar nada.
  assert.match(codigo, /numeroWhatsAppCache/);
  assert.match(codigo, /5 \* 60_000/);
});

test("o token não aparece em mensagem de erro", () => {
  // As mensagens de bloqueio são montadas com o estado do número e com
  // describeMetaGraphFailure — nunca com o token. A assinatura e o cabeçalho
  // Authorization são os únicos lugares legítimos para `accessToken` existir.
  const preflight = codigo.slice(codigo.indexOf("async function preflightNumeroWhatsApp"), codigo.indexOf("async function deliverWhatsApp"));
  const motivos = [...preflight.matchAll(/motivo = ([^;]+);/g)].map((m) => m[1]);
  assert.ok(motivos.length >= 4, `esperava as quatro atribuições de motivo, achei ${motivos.length}`);
  for (const m of motivos) {
    assert.ok(!/accessToken/.test(m), `um motivo interpola o token: ${m.slice(0, 80)}`);
  }
});
