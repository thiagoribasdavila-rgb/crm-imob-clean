import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  loadConversationContinuityRegistry,
  validateConversationContinuity,
} from "../../scripts/check-v3000-phase-45-conversation-continuity.mjs";

const root = process.cwd();

test("Fase 45 adota continuidade comprovada e preserva a Fase 44", () => {
  const registry = loadConversationContinuityRegistry(root);
  const result = validateConversationContinuity({ root, registry });

  assert.equal(result.phase, 45);
  assert.equal(result.status, "conversation-continuity-adopted");
  assert.equal(result.tenantScoped, true);
  assert.equal(result.metadataOnly, true);
  assert.equal(result.channelEvidenceRequired, true);
});

test("Fase 45 rejeita exposição de conteúdo de mensagem", () => {
  const registry = structuredClone(loadConversationContinuityRegistry(root));
  registry.scope.messageContentExposed = true;

  assert.throws(
    () => validateConversationContinuity({ root, registry }),
    /Conteúdo de mensagem não pode ser exposto/,
  );
});

test("Fase 45 consulta conversas e mensagens dentro da organização", () => {
  const api = fs.readFileSync(
    path.join(root, "app/api/v1/pipeline/route.ts"),
    "utf8",
  );

  assert.match(api, /\.from\("conversations"\)[\s\S]+\.eq\("organization_id", identity\.organizationId\)/);
  assert.match(api, /\.from\("messages"\)[\s\S]+\.eq\("organization_id", identity\.organizationId\)/);
});

test("Fase 45 usa prova externa sem ler o texto da mensagem", () => {
  const api = fs.readFileSync(
    path.join(root, "app/api/v1/pipeline/route.ts"),
    "utf8",
  );
  const messageRead =
    api.match(/\.from\("messages"\)([\s\S]*?)if \(result\.error\)/)?.[1] ?? "";

  assert.match(messageRead, /external_message_id/);
  assert.doesNotMatch(messageRead, /[\"',]content(?:[\"',]|\b)/);
});

test("Fase 45 mantém fallback honesto sem inferir WhatsApp", () => {
  const pipeline = fs.readFileSync(
    path.join(root, "app/(crm)/pipeline/page.tsx"),
    "utf8",
  );

  assert.match(pipeline, /Sem conversa comprovada/);
  assert.match(pipeline, /Canal não comprovado/);
  assert.match(pipeline, /channelConfirmed[\s\S]+conversationChannelLabel/);
});
