import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildWhatsAppMemoryDecisionEvidence,
  fingerprintWhatsAppMemoryDecisionEvidence,
  parseWhatsAppMemoryDirectorDecisionInput,
} from "../../lib/analytics/whatsapp-memory-director-decision-execution.ts";

const validBody = {
  decision: "approve",
  reason: "A diretoria revisou o escopo operacional e os limites da evidência.",
  operationalScopeConfirmed: true,
  evidenceLimitsConfirmed: true,
};

const gate = {
  containsPii: false,
  readsMessageContent: false,
  automaticDecision: false,
  proof: { observedConversations: 2, observedMessages: 4 },
  controls: [
    { code: "REAL_TRAFFIC", passed: true, label: "Tráfego real" },
    { code: "SAFE_HUMAN_GOVERNANCE", passed: true, label: "Governança" },
  ],
  gate: {
    readyForHumanRelease: true,
    passedControls: 2,
    totalControls: 2,
    blockers: [],
  },
  measuredAt: "2026-08-10T12:00:00.000Z",
};

test("aceita somente a decisão humana mínima prevista no contrato", () => {
  const parsed = parseWhatsAppMemoryDirectorDecisionInput(validBody);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, validBody);
});

test("rejeita organização, ator, snapshot e fingerprint enviados pelo navegador", () => {
  for (const forbiddenKey of ["organizationId", "actorId", "evidenceSnapshot", "evidenceFingerprint"]) {
    const parsed = parseWhatsAppMemoryDirectorDecisionInput({ ...validBody, [forbiddenKey]: "client-value" });
    assert.equal(parsed.ok, false, forbiddenKey);
    if (!parsed.ok) assert.equal(parsed.code, "DECISION_BODY_FIELDS_INVALID");
  }
});

test("exige justificativa suficiente e as duas confirmações explícitas", () => {
  assert.equal(parseWhatsAppMemoryDirectorDecisionInput({ ...validBody, reason: "curta" }).ok, false);
  assert.equal(parseWhatsAppMemoryDirectorDecisionInput({ ...validBody, operationalScopeConfirmed: false }).ok, false);
  assert.equal(parseWhatsAppMemoryDirectorDecisionInput({ ...validBody, evidenceLimitsConfirmed: false }).ok, false);
});

test("monta snapshot exclusivamente server-side com fingerprint determinístico", () => {
  const evidence = buildWhatsAppMemoryDecisionEvidence(gate, { review: { canBeReviewed: true } });
  assert.equal(evidence.source, "server_recalculation");
  assert.equal(evidence.containsPii, false);
  assert.equal(evidence.readsMessageContent, false);
  assert.equal(evidence.automaticDecision, false);
  assert.equal(evidence.technicalGateReady, true);
  assert.match(fingerprintWhatsAppMemoryDecisionEvidence(evidence), /^[a-f0-9]{64}$/);
  assert.equal(
    fingerprintWhatsAppMemoryDecisionEvidence(evidence),
    fingerprintWhatsAppMemoryDecisionEvidence(evidence),
  );
});

test("rota autentica, autoriza diretoria e recalcula a evidência antes do RPC", async () => {
  const source = await readFile(
    new URL("../../app/api/v1/integrations/whatsapp/memory-director-decision/route.ts", import.meta.url),
    "utf8",
  );
  for (const required of [
    "requireAccessContext(request)",
    "enforceRateLimit(request",
    "isTrustedMutationOrigin(request)",
    "readIdempotencyKey(request)",
    "loadWhatsAppMemoryDirectorEvidence(organizationId)",
    '.rpc("record_whatsapp_memory_director_decision"',
    '"PERSISTENCE_MIGRATION_PENDING"',
    "learningActivated: false",
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(source.indexOf("loadWhatsAppMemoryDirectorEvidence") < source.indexOf('.rpc("record_whatsapp_memory_director_decision"'));
});

test("carregador usa somente campos estruturais e nunca conteúdo de conversa", async () => {
  const source = await readFile(
    new URL("../../lib/server/whatsapp-memory-director-evidence.ts", import.meta.url),
    "utf8",
  );
  const selects = [...source.matchAll(/\.select\("([^"]+)"/g)].map((match) => match[1]);
  assert.ok(selects.length >= 8);
  for (const selection of selects) {
    assert.doesNotMatch(selection, /content|body|text|phone|email/i);
  }
});

test("interface liga o painel protegido sem confiar prova do navegador", async () => {
  const source = await readFile(
    new URL("../../app/(crm)/integrations/whatsapp/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /373-whatsapp-memory-director-decision-endpoint/);
  assert.match(source, /375-whatsapp-memory-director-decision-ui/);
  assert.match(source, /WhatsAppMemoryDirectorDecisionPanel/);
});
