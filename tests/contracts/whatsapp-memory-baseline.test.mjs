import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWhatsAppMemoryBaseline } from "../../lib/analytics/whatsapp-memory-baseline.ts";

const counts = (overrides = {}) => ({
  conversations: 10,
  linkedConversations: 8,
  assignedConversations: 7,
  messages: 30,
  inboundMessages: 18,
  outboundMessages: 12,
  deliveredMessages: 9,
  readMessages: 6,
  failedMessages: 1,
  externallyConfirmedMessages: 20,
  ...overrides,
});

test("tráfego só é comprovado por mensagem com identificador externo", () => {
  const result = buildWhatsAppMemoryBaseline({
    lines: [{ status: "connected", config: { recordConversations: true } }],
    counts: counts(),
    measuredAt: "2026-08-10T12:00:00.000Z",
  });

  assert.equal(result.connection.state, "proven");
  assert.equal(result.connection.trafficProven, true);
  assert.equal(result.lines.recordingEnabled, 1);
  assert.equal(result.containsPii, false);
});

test("linha conectada sem mensagem externa permanece não comprovada", () => {
  const result = buildWhatsAppMemoryBaseline({
    lines: [{ status: "connected", config: {} }],
    counts: counts({ externallyConfirmedMessages: 0 }),
  });

  assert.equal(result.connection.state, "configured_unproven");
  assert.equal(result.connection.configured, true);
  assert.equal(result.connection.trafficProven, false);
});

test("ausência de linha e tráfego não vira conexão ativa", () => {
  const result = buildWhatsAppMemoryBaseline({
    lines: [],
    counts: counts({ messages: 0, inboundMessages: 0, outboundMessages: 0, externallyConfirmedMessages: 0 }),
  });

  assert.equal(result.connection.state, "not_configured");
  assert.equal(result.learning.readyForLearning, false);
});

test("mede cobertura de memória e limita contagens inconsistentes", () => {
  const result = buildWhatsAppMemoryBaseline({
    lines: [],
    counts: counts({ conversations: 4, linkedConversations: 9, assignedConversations: 6 }),
  });

  assert.equal(result.conversations.linkedToLead, 4);
  assert.equal(result.conversations.unlinkedToLead, 0);
  assert.equal(result.conversations.leadLinkRate, 100);
  assert.equal(result.conversations.unassigned, 0);
});

test("API e interface mantêm isolamento, diretoria e linguagem factual", () => {
  const api = readFileSync("app/api/v1/integrations/whatsapp/memory-baseline/route.ts", "utf8");
  const page = readFileSync("app/(crm)/integrations/whatsapp/page.tsx", "utf8");

  assert.match(api, /buildWhatsAppMemoryBaseline/);
  assert.ok((api.match(/\.eq\("organization_id", organizationId\)/g) ?? []).length >= 4);
  assert.match(api, /commercialRole === "director"/);
  assert.doesNotMatch(api, /select\("(?:content|sender|recipient)/);
  assert.match(page, /data-phase="365-whatsapp-memory-baseline"/);
  assert.match(page, /TRÁFEGO COMPROVADO/);
  assert.match(page, /SEM TRÁFEGO COMPROVADO/);
  assert.match(page, /sem telefones ou conteúdo/i);
});
