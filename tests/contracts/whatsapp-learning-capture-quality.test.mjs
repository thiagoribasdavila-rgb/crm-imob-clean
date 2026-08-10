import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWhatsAppLearningCaptureQuality } from "../../lib/analytics/whatsapp-learning-capture-quality.ts";

const message = (overrides = {}) => ({
  id: "message-1",
  conversation_id: "conversation-1",
  direction: "inbound",
  external_message_id: "wamid-1",
  sent_at: "2026-08-10T12:00:00.000Z",
  created_at: "2026-08-10T12:00:00.000Z",
  ...overrides,
});

test("mede captura estrutural sem devolver identificadores", () => {
  const result = buildWhatsAppLearningCaptureQuality({
    messages: [message()],
    conversations: [{ id: "conversation-1", lead_id: "lead-1" }],
    behaviorEvents: [{ source_id: "message-1", event_name: "message_inbound" }],
    lines: [{ status: "connected", config: { recordConversations: true } }],
    now: "2026-08-10T13:00:00.000Z",
  });

  assert.equal(result.capture.structurallyUsable, 1);
  assert.equal(result.capture.structuralCoveragePercent, 100);
  assert.equal(result.containsPii, false);
  assert.equal(result.readsMessageContent, false);
  assert.equal(JSON.stringify(result).includes("message-1"), false);
  assert.equal(JSON.stringify(result).includes("lead-1"), false);
});

test("separa direção, data, conversa e vínculo com lead ausentes", () => {
  const result = buildWhatsAppLearningCaptureQuality({
    messages: [
      message({ id: "m1", direction: "unknown" }),
      message({ id: "m2", sent_at: null, created_at: null }),
      message({ id: "m3", conversation_id: "missing" }),
      message({ id: "m4", conversation_id: "conversation-without-lead" }),
    ],
    conversations: [{ id: "conversation-without-lead", lead_id: null }],
    behaviorEvents: [],
    lines: [],
  });

  assert.equal(result.gaps.invalidDirection, 1);
  assert.equal(result.gaps.missingTimestamp, 1);
  assert.equal(result.gaps.missingConversation, 3);
  assert.equal(result.gaps.missingLeadLink, 4);
});

test("deduplica eventos canônicos por mensagem e mede cobertura", () => {
  const result = buildWhatsAppLearningCaptureQuality({
    messages: [message()],
    conversations: [{ id: "conversation-1", lead_id: "lead-1" }],
    behaviorEvents: [
      { source_id: "message-1", event_name: "message_inbound" },
      { source_id: "message-1", event_name: "message_read" },
    ],
    lines: [],
  });

  assert.equal(result.canonicalMemory.behaviorEvents, 2);
  assert.equal(result.canonicalMemory.coveredMessages, 1);
  assert.equal(result.canonicalMemory.coveragePercent, 100);
  assert.equal(result.learning.structuredLearningReady, true);
});

test("gravação da linha não autoriza aprendizado com conteúdo bruto", () => {
  const result = buildWhatsAppLearningCaptureQuality({
    messages: [message()],
    conversations: [{ id: "conversation-1", lead_id: "lead-1" }],
    behaviorEvents: [{ source_id: "message-1", event_name: "message_inbound" }],
    lines: [{ status: "connected", config: { recordConversations: true } }],
  });

  assert.equal(result.recording.recordingConfiguredLines, 1);
  assert.equal(result.recording.provesAiLearningAuthorization, false);
  assert.equal(result.authorization.status, "not_proven");
  assert.equal(result.authorization.rawContentLearningAuthorized, false);
  assert.equal(result.learning.mode, "structured_only");
  assert.equal(result.learning.rawContentLearningReady, false);
});

test("API e interface preservam diretoria, tenant e conteúdo privado", () => {
  const api = readFileSync(
    "app/api/v1/integrations/whatsapp/learning-capture-quality/route.ts",
    "utf8",
  );
  const page = readFileSync(
    "app/(crm)/integrations/whatsapp/page.tsx",
    "utf8",
  );

  assert.ok((api.match(/\.eq\("organization_id", organizationId\)/g) ?? []).length >= 4);
  assert.match(api, /commercialRole === "director"/);
  assert.match(api, /id,conversation_id,direction,external_message_id,sent_at,created_at/);
  assert.doesNotMatch(api, /\.select\([^)]*(content|sender|recipient|media_url)/s);
  assert.match(page, /data-phase="367-whatsapp-learning-capture-quality"/);
  assert.match(page, /CONTEÚDO BRUTO · NÃO AUTORIZADO/);
  assert.match(page, /structured_only/);
});
