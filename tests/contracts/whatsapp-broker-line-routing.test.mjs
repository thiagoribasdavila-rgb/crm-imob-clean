import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("WhatsApp Cloud vincula linha oficial ao corretor sem usar credencial pessoal", async () => {
  const route = await source("app/api/v1/integrations/whatsapp/route.ts");

  assert.match(route, /action === "save_broker_line"/);
  assert.match(route, /brokerProfileId/);
  assert.match(route, /brokerProfileId, displayPhone/);
  assert.match(route, /phoneNumberId/);
  assert.match(route, /verifyPhoneNumber\(phoneNumberId, accessToken\)/);
  assert.match(route, /recordConversations: true/);
  assert.match(route, /scope: "broker"/);
  assert.match(route, /personalWhatsAppRequired: false/);
  assert.match(route, /conversationsRecordedInCrm/);
});

test("corretor visualiza apenas o estado da própria linha no perfil", async () => {
  const profile = await source("app/(crm)/settings/profile/page.tsx");

  assert.match(profile, /WhatsApp Business da minha carteira/);
  assert.match(profile, /Seu WhatsApp pessoal não é solicitado nem monitorado/);
  assert.match(profile, /conversas desta linha são registradas no CRM/);
  assert.match(profile, /Solicitar minha linha oficial/);
  assert.match(profile, /request_broker_line/);
});

test("corretor solicita a própria linha e a diretoria recebe um alerta auditável", async () => {
  const route = await source("app/api/v1/integrations/whatsapp/route.ts");

  assert.match(route, /action === "request_broker_line"/);
  assert.match(route, /isBroker\(identity\)/);
  assert.match(route, /status: "pending_approval"/);
  assert.match(route, /event_type: "whatsapp\.broker_line_requested"/);
  assert.match(route, /notifyRole: "director"/);
  assert.match(route, /Aguardando aprovação da diretoria/);
});

test("somente a diretoria aprova a linha pendente após validação oficial", async () => {
  const route = await source("app/api/v1/integrations/whatsapp/route.ts");
  const page = await source("app/(crm)/integrations/whatsapp/page.tsx");

  assert.match(route, /action === "approve_broker_line"/);
  assert.match(route, /verifyPhoneNumber\(pendingLine\.external_account_id, accessToken\)/);
  assert.match(route, /event_type: "whatsapp\.broker_line_approved"/);
  assert.match(page, /Aprovação da diretoria necessária/);
  assert.match(page, /Aprovar e validar na Meta/);
});

test("a central global avisa somente a diretoria sobre linhas pendentes", async () => {
  const pendingLines = await source("app/api/v1/integrations/whatsapp/pending-lines/route.ts");
  const notifications = await source("components/AtlasNotificationCenter.tsx");

  assert.match(pendingLines, /DIRECTOR_APPROVAL_REQUIRED/);
  assert.match(pendingLines, /status", "pending_approval"/);
  assert.match(notifications, /whatsapp\/pending-lines/);
  assert.match(notifications, /Aprovações da diretoria/);
  assert.match(notifications, /Linha oficial solicitada por/);
});

test("webhook registra a linha, o corretor e a conversa vinculada à lead", async () => {
  const webhook = await source("app/api/webhooks/whatsapp/route.ts");

  assert.match(webhook, /brokerProfileId/);
  assert.match(webhook, /phone_normalized/);
  assert.match(webhook, /assigned_to/);
  assert.match(webhook, /whatsapp_cloud_line/);
  assert.match(webhook, /recorded: config\.recordConversations !== false/);
});

test("outbox envia pela linha oficial do corretor e mantém a trilha no CRM", async () => {
  const outbox = await source("app/api/v2/outbox/process/route.ts");

  assert.match(outbox, /resolveWhatsAppLine/);
  assert.match(outbox, /conversation\.assigned_to/);
  assert.match(outbox, /phoneNumberId/);
  assert.match(outbox, /whatsapp_cloud_line/);
  assert.match(outbox, /Nenhuma linha oficial do WhatsApp está vinculada a este corretor/);
});
