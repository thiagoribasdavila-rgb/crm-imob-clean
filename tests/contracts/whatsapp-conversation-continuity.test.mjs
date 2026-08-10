import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWhatsAppConversationContinuity } from "../../lib/analytics/whatsapp-conversation-continuity.ts";

const conversation = (overrides = {}) => ({
  id: "conversation-1",
  lead_id: "lead-1",
  assigned_to: "broker-1",
  status: "open",
  last_message_at: "2026-08-09T12:00:00.000Z",
  unread_count: 0,
  created_at: "2026-08-01T12:00:00.000Z",
  ...overrides,
});

test("mede alinhamento sem expor identificadores na saída", () => {
  const result = buildWhatsAppConversationContinuity({
    conversations: [conversation()],
    leads: [{ id: "lead-1", assigned_to: "broker-1" }],
    now: "2026-08-10T12:00:00.000Z",
  });

  assert.equal(result.ownership.alignedOwner, 1);
  assert.equal(result.ownership.alignmentRate, 100);
  assert.equal(result.containsPii, false);
  assert.equal(JSON.stringify(result).includes("broker-1"), false);
});

test("separa divergência, ausência de titularidade e conversa órfã", () => {
  const result = buildWhatsAppConversationContinuity({
    conversations: [
      conversation({ id: "c1", assigned_to: "broker-2" }),
      conversation({ id: "c2", lead_id: "lead-2", assigned_to: null }),
      conversation({ id: "c3", lead_id: null, assigned_to: null }),
      conversation({ id: "c4", lead_id: "lead-missing" }),
    ],
    leads: [
      { id: "lead-1", assigned_to: "broker-1" },
      { id: "lead-2", assigned_to: "broker-2" },
    ],
  });

  assert.equal(result.ownership.ownerMismatch, 1);
  assert.equal(result.ownership.conversationOwnerMissing, 1);
  assert.equal(result.ownership.unlinked, 1);
  assert.equal(result.ownership.missingLeadRecord, 1);
});

test("classifica atividade recente, parada, obsoleta e não lida", () => {
  const result = buildWhatsAppConversationContinuity({
    conversations: [
      conversation({ id: "recent" }),
      conversation({ id: "stale", last_message_at: "2026-06-01T12:00:00.000Z", unread_count: 3 }),
      conversation({ id: "unknown", last_message_at: null, created_at: null }),
    ],
    leads: [{ id: "lead-1", assigned_to: "broker-1" }],
    now: "2026-08-10T12:00:00.000Z",
  });

  assert.equal(result.continuity.activeWithinRecentWindow, 1);
  assert.equal(result.continuity.withoutRecentActivity, 1);
  assert.equal(result.continuity.stale, 1);
  assert.equal(result.continuity.noActivityDate, 1);
  assert.equal(result.continuity.unread, 1);
});

test("mede fragmentação e informa amostragem truncada", () => {
  const result = buildWhatsAppConversationContinuity({
    conversations: [conversation({ id: "c1" }), conversation({ id: "c2" })],
    leads: [{ id: "lead-1", assigned_to: "broker-1" }],
    sourceTotal: 10,
    observedLimit: 2,
  });

  assert.equal(result.fragmentation.leadsWithMultipleConversations, 1);
  assert.equal(result.fragmentation.extraConversations, 1);
  assert.equal(result.source.truncated, true);
});

test("API e interface preservam diretoria, tenant e leitura sem PII", () => {
  const api = readFileSync(
    "app/api/v1/integrations/whatsapp/continuity/route.ts",
    "utf8",
  );
  const page = readFileSync(
    "app/(crm)/integrations/whatsapp/page.tsx",
    "utf8",
  );

  assert.ok((api.match(/\.eq\("organization_id", organizationId\)/g) ?? []).length >= 3);
  assert.match(api, /commercialRole === "director"/);
  assert.doesNotMatch(api, /content|sender|recipient|display_phone/);
  assert.match(page, /data-phase="366-whatsapp-conversation-continuity"/);
  assert.match(page, /não redistribui/i);
});
