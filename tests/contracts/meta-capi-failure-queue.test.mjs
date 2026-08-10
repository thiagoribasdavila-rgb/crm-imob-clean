import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/integrations/health/page.tsx", "utf8");
const api = readFileSync("app/api/v1/governance/integration-health/route.ts", "utf8");
const retry = readFileSync("app/api/v3/dlq/retry/route.ts", "utf8");
const notifications = readFileSync("components/AtlasNotificationCenter.tsx", "utf8");
const config = JSON.parse(readFileSync("config/operational-ux-phase-053-meta-capi-failure-queue.json", "utf8"));

test("fase 53 cria uma fila operacional canônica", () => {
  assert.equal(config.phase, 53);
  assert.equal(config.canonicalRoute, "/integrations/health");
  assert.match(page, /data-ux-phase="53-meta-capi-failure-queue"/);
  assert.match(page, /FILA OPERACIONAL SUPERVISIONADA/);
  assert.match(page, /Falhas Meta\/CAPI e integrações/);
});

test("API retorna diagnóstico sanitizado sem payload bruto", () => {
  assert.equal(config.rawPayloadReturned, false);
  assert.equal(config.rawProviderErrorReturned, false);
  assert.match(api, /failureQueue/);
  assert.match(api, /operationalFailureReason/);
  assert.match(api, /canRetry: Boolean\(event\.outbox_event_id\)/);
  assert.doesNotMatch(api, /failureQueue[\s\S]{0,800}payload:/);
});

test("Meta Lead Ads e CAPI recebem nomes operacionais", () => {
  assert.match(api, /Conversão Meta\/CAPI/);
  assert.match(api, /Lead Ads Meta/);
  assert.match(api, /topic\.startsWith\("meta\."\)/);
});

test("reprocessamento reutiliza endpoint governado e exige diretoria", () => {
  assert.equal(config.directorSupervisionRequired, true);
  assert.equal(config.existingRetryEndpointReused, true);
  assert.match(page, /\/api\/v3\/dlq\/retry/);
  assert.match(retry, /isDirectorProfile/);
  assert.match(retry, /eq\("organization_id", identity\.organizationId\)/);
});

test("interface explica limites e não automatiza decisão", () => {
  assert.equal(config.automaticRetryFromUi, false);
  assert.match(page, /revisão humana obrigatória/);
  assert.match(page, /não altera campanhas, públicos ou orçamento/);
  assert.match(page, /não expõe payload, contato, credencial ou resposta bruta/);
});

test("notificações encaminham para a fila correta sem erro bruto", () => {
  assert.match(notifications, /href="\/integrations\/health"/);
  assert.match(notifications, /Tratar falhas/);
  assert.match(notifications, /diagnóstico sanitizado/);
  assert.doesNotMatch(notifications, /\{failure\.error_message\}/);
});

test("fase preserva infraestrutura e não envia evento externo", () => {
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDeliveryDuringPhase, false);
  assert.equal(config.campaignMutation, false);
  assert.equal(config.budgetMutation, false);
  assert.equal(config.buildExecuted, false);
});
