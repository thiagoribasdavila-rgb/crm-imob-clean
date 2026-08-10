import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWhatsAppMemoryHumanReview } from "../../lib/analytics/whatsapp-memory-human-review.ts";

const releaseGate = () => ({
  scope: "authenticated_organization",
  containsPii: false,
  readsMessageContent: false,
  automaticDecision: false,
  proof: {
    observedConversations: 2,
    observedMessages: 4,
    usableMessages: 4,
    canonicalMessages: 4,
    completeCommercialMemories: 2,
    minimumTraceabilityPercent: 100,
  },
  gate: {
    status: "ready_for_human_release",
    readyForHumanRelease: true,
    passedControls: 10,
    totalControls: 10,
    blockers: [],
    requiresHumanApproval: true,
  },
  measuredAt: "2026-08-10T12:00:00.000Z",
});

test("mantém a decisão pendente mesmo com evidência técnica completa", () => {
  const result = buildWhatsAppMemoryHumanReview(releaseGate());
  assert.equal(result.review.status, "awaiting_human_decision");
  assert.equal(result.review.canBeReviewed, true);
  assert.equal(result.review.approved, false);
  assert.equal(result.review.requiresAuthenticatedDirector, true);
  assert.equal(result.review.evidenceReady, result.review.totalChecklistItems);
  assert.equal(result.review.humanConfirmationsPending, 2);
});

test("bloqueia revisão quando a prova técnica está incompleta", () => {
  const gate = releaseGate();
  gate.gate.status = "blocked";
  gate.gate.readyForHumanRelease = false;
  gate.gate.passedControls = 8;
  gate.gate.blockers = ["LEAD_LINKAGE", "COMMERCIAL_CONTEXT"];
  gate.proof.minimumTraceabilityPercent = 75;
  const result = buildWhatsAppMemoryHumanReview(gate);
  assert.equal(result.review.status, "blocked_by_technical_evidence");
  assert.equal(result.review.canBeReviewed, false);
  assert.equal(result.review.approved, false);
  assert.deepEqual(result.review.blockers, ["LEAD_LINKAGE", "COMMERCIAL_CONTEXT"]);
});

test("preserva privacidade e impede decisão automática", () => {
  const result = buildWhatsAppMemoryHumanReview(releaseGate());
  assert.equal(result.containsPii, false);
  assert.equal(result.readsMessageContent, false);
  assert.equal(result.automaticDecision, false);
  assert.match(result.decisionGuard, /diretor autenticado/);
});

test("interface apresenta a revisão humana sem botão de aprovação fictício", () => {
  const page = readFileSync("app/(crm)/integrations/whatsapp/page.tsx", "utf8");
  assert.match(page, /data-phase="370-whatsapp-memory-human-review"/);
  assert.match(page, /AGUARDANDO DECISÃO HUMANA/);
  assert.match(page, /diretor autenticado/);
  assert.match(page, /não comprova aumento de vendas nem precisão preditiva/i);
  assert.doesNotMatch(page, /Aprovar memória agora/);
});
