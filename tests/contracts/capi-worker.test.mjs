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

// ── A tabela manda no QUE e PARA ONDE; o ambiente guarda só o segredo ───────

test("o envio lê dataset e modo da ORGANIZAÇÃO, não do ambiente", () => {
  // `meta_conversion_configs` tinha dataset_id, enabled, mode e test_event_code,
  // e o enviador lia tudo do env — a tabela era decorativa. Num produto
  // multi-organização, um dataset global manda a conversão de uma imobiliária
  // para o dataset de outra.
  const envio = ler("lib", "integrations", "meta", "capi-feedback.ts");
  assert.match(envio, /config: CapiOrgConfig/);
  assert.match(envio, /const datasetId = String\(config\.datasetId \?\? ""\)\.trim\(\);/);
  assert.ok(!/process\.env\.META_CAPI_DATASET_ID/.test(envio),
    "o dataset não pode mais vir do ambiente");
  // O segredo continua no ambiente: credencial em linha de banco vaza num dump.
  assert.match(envio, /process\.env\.META_CONVERSIONS_ACCESS_TOKEN/);
});

test("mode='test' sem código é RECUSADO — o acidente que isso impede", () => {
  // O default da tabela é mode='test'. Antes, o modo nunca chegava no envio:
  // quem configurasse teste e ligasse a env mandaria os eventos como PRODUÇÃO,
  // e dado de teste entraria no algoritmo real de otimização.
  const envio = ler("lib", "integrations", "meta", "capi-feedback.ts");
  assert.match(envio, /missing_test_event_code/);
  assert.match(envio, /config\.mode === "test" && !testEventCode/);
  assert.match(envio, /test_event_code: testEventCode/,
    "em modo teste o código precisa ir no corpo, senão a Meta trata como produção");
});

test("valor desconhecido de mode cai para TESTE, não para produção", () => {
  const nucleo = ler("lib", "integrations", "meta", "capi-window.ts");
  assert.match(nucleo, /data\.mode === "live" \? "live" : "test"/,
    "errar para o teste custa um evento; errar para o outro contamina a otimização");
});

test("sem linha de config, ninguém envia", () => {
  const nucleo = ler("lib", "integrations", "meta", "capi-window.ts");
  assert.match(nucleo, /if \(!data\?\.dataset_id\) return null;/);
  assert.match(worker, /sem meta_conversion_configs para esta organização/);
  assert.match(manual, /CAPI_NOT_CONFIGURED/);
});

test("os dois chamadores usam o MESMO leitor de config", () => {
  for (const [nome, arquivo] of [["worker", worker], ["rota manual", manual]]) {
    assert.match(arquivo, /loadOrgCapiConfig/, `${nome} precisa usar o leitor compartilhado`);
    assert.ok(!/from\("meta_conversion_configs"\)/.test(arquivo),
      `${nome} não pode ler a tabela por conta própria`);
  }
});

// ── Ir para produção é gesto deliberado ────────────────────────────────────

test("configurar SEMPRE grava modo teste", () => {
  const rota = ler("app", "api", "v1", "integrations", "meta", "route.ts");
  assert.match(rota, /mode: "test", enabled: true/,
    "ninguém liga envio de conversão em produção por engano");
});

test("existe caminho explícito de teste para produção", () => {
  // Sem ele, o efeito era PIOR que não configurar: você veria os eventos na
  // aba de TESTE do Gerenciador, concluiria que funciona, e a otimização nunca
  // receberia nada. Evento de teste não entra no aprendizado do algoritmo.
  const rota = ler("app", "api", "v1", "integrations", "meta", "route.ts");
  assert.match(rota, /conversion_go_live/);
  assert.match(rota, /mode: "live"/);
});

test("só promove o que já está configurado em teste", () => {
  const rota = ler("app", "api", "v1", "integrations", "meta", "route.ts");
  assert.match(rota, /Configure o Dataset em modo teste antes de ir para produção/);
  assert.match(rota, /status: 422/);
});

test("promover é decisão de diretor", () => {
  const rota = ler("app", "api", "v1", "integrations", "meta", "route.ts");
  assert.match(rota, /body\.action === "conversion_go_live"[\s\S]{0,80}isDirector/);
});

test("o código de teste é limpo ao ir para produção", () => {
  // Deixá-lo gravado faria a próxima volta para teste parecer configurada
  // quando o código já pode ter expirado.
  const rota = ler("app", "api", "v1", "integrations", "meta", "route.ts");
  assert.match(rota, /test_event_code: null/);
});
