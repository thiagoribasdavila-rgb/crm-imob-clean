import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL(
  "../../components/integrations/WhatsAppMemoryDirectorDecisionPanel.tsx",
  import.meta.url,
);
const routeUrl = new URL(
  "../../app/api/v1/integrations/whatsapp/memory-director-decision/route.ts",
  import.meta.url,
);

test("painel bloqueia decisão até persistência e prova humana estarem prontas", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /state\?\.persistenceReady === true/);
  assert.match(source, /readyForHumanRelease/);
  assert.match(source, /canBeReviewed/);
  assert.match(source, /reason\.trim\(\)\.length >= 20/);
  assert.match(source, /scopeConfirmed/);
  assert.match(source, /limitsConfirmed/);
  assert.match(source, /disabled=\{!formReady \|\| submitting\}/);
});

test("browser envia somente intenção humana e chave de idempotência", async () => {
  const source = await readFile(componentUrl, "utf8");
  const payload = source.match(/body: JSON\.stringify\(\{([\s\S]*?)\}\),/)?.[1] ?? "";
  assert.match(source, /"Idempotency-Key"/);
  assert.match(payload, /decision,/);
  assert.match(payload, /reason: reason\.trim\(\)/);
  assert.match(payload, /operationalScopeConfirmed: true/);
  assert.match(payload, /evidenceLimitsConfirmed: true/);
  assert.doesNotMatch(payload, /organizationId\s*:/);
  assert.doesNotMatch(payload, /actorId\s*:/);
  assert.doesNotMatch(payload, /evidenceSnapshot\s*:/);
  assert.doesNotMatch(payload, /evidenceFingerprint\s*:/);
});

test("consulta e escrita são tenant-scoped e exclusivas da diretoria", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
  assert.match(source, /identity\.access\.organization\.id/);
  assert.match(source, /identity\.access\.profile\.commercialRole === "director"/);
  assert.match(source, /\.eq\("organization_id", organizationId\)/);
  assert.match(source, /p_organization_id: organizationId/);
});

test("migration ausente vira estado bloqueado, nunca falsa aprovação", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /persistenceReady: false/);
  assert.match(source, /migrationRequired:/);
  assert.match(source, /decisions: \[\]/);
  assert.match(source, /learningActivated: false/);
});
