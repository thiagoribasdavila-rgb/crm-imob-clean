/**
 * Contrato do WORKER DE CONVERSÕES (CAPI).
 *
 * A Meta sabe quem preencheu o formulário; não sabe quem virou visita,
 * proposta ou venda. Sem esse sinal de volta ela otimiza para gerar mais
 * formulários — e a verba vai para lead que nunca ia fechar.
 *
 * O CAPI já existia inteiro, mas o único caminho que enviava exigia sessão
 * humana de liderança e por isso não rodava por cron: virou botão que ninguém
 * aperta. Medido antes: `meta_conversion_events` com ZERO linhas.
 *
 * O que este contrato guarda é sobretudo a régua de CONSENTIMENTO — o pedaço
 * que não pode existir em duas cópias.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const worker = ler("app", "api", "v2", "marketing", "capi-feedback", "process", "route.ts");
const manual = ler("app", "api", "v1", "integrations", "meta", "capi-export", "route.ts");
const nucleo = ler("lib", "integrations", "meta", "capi-window.ts");

test("uma régua de consentimento só — os dois importam o MESMO código", () => {
  // Duas cópias andando separado é o dia em que sai PII de quem não consentiu.
  assert.match(worker, /from "@\/lib\/integrations\/meta\/capi-window"/);
  assert.match(manual, /from "@\/lib\/integrations\/meta\/capi-window"/);
  assert.match(nucleo, /export async function loadWindowBatch/);
  for (const [nome, arquivo] of [["worker", worker], ["rota manual", manual]]) {
    assert.ok(!/consentStateOf|loadConsentPolicy/.test(arquivo),
      `${nome} não pode ter cópia própria da régua de consentimento`);
  }
});

test("falha FECHADA: sem política legível, consentimento é obrigatório", () => {
  assert.match(nucleo, /padrão é EXIGIR consentimento/);
  assert.match(nucleo, /data\.consent_required !== false/,
    "ausência de linha não vira permissão");
});

test("quem não tem consentimento verificado não entra, e a lacuna é contada", () => {
  assert.match(nucleo, /suppressedLeads/);
  assert.match(nucleo, /state === "unverifiable"/);
  assert.match(worker, /semConsentimento/, "o worker precisa declarar a lacuna, não engolir");
});

test("o descarte também respeita o consentimento da lead", () => {
  // O evento de descarte carrega PII hasheada do lead.
  assert.match(nucleo, /suppressedDiscardEvents/);
});

test("o worker não mexe em campanha nem em verba", () => {
  const codigo = worker.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/campaigns|adsets|daily_budget|status.*PAUSED|ACTIVE/i.test(codigo),
    "devolver sinal é uma coisa; mexer em campanha é outra");
  assert.ok(!/\.from\("leads"\)\.update|\.update\(/.test(codigo),
    "o worker não escreve na lead");
});

test("configuração ausente NÃO é falha do worker", () => {
  // Marcar como erro faria o alarme tocar todo dia até alguém desligar o alarme.
  assert.match(worker, /não é falha do worker/);
  assert.match(worker, /ok: true/);
});

test("está registrado no agendador e no contrato de segurança", () => {
  const sched = JSON.parse(ler("config", "workers-schedule.json"));
  const w = sched.workers.find((x) => x.rota === "/api/v2/marketing/capi-feedback/process");
  assert.ok(w, "sem cadência versionada, o worker depende de alguém lembrar do crontab");
  assert.match(w.porque, /PREENCHE FORMULARIO|formulario/i);
  const contrato = JSON.parse(ler("config", "api-security-contract.json"));
  assert.ok(contrato.workerRoutes.includes("app/api/v2/marketing/capi-feedback/process/route.ts"));
});
