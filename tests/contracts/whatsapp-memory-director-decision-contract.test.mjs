import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWhatsAppMemoryDirectorDecisionContract } from "../../lib/analytics/whatsapp-memory-director-decision-contract.ts";

const humanReview = () => ({
  scope: "authenticated_organization",
  containsPii: false,
  readsMessageContent: false,
  automaticDecision: false,
  review: {
    status: "awaiting_human_decision",
    canBeReviewed: true,
    approved: false,
    requiresAuthenticatedDirector: true,
    humanConfirmationsPending: 2,
    blockers: [],
  },
  measuredAt: "2026-08-10T12:00:00.000Z",
});

test("define o fluxo autenticado sem registrar decisão", () => {
  const result = buildWhatsAppMemoryDirectorDecisionContract(humanReview());
  assert.equal(result.contract.status, "ready_for_authenticated_decision_flow");
  assert.equal(result.contract.technicallyDecidable, true);
  assert.equal(result.contract.persisted, false);
  assert.equal(result.contract.executed, false);
  assert.equal(result.contract.effectiveDecision, null);
  assert.deepEqual(result.contract.allowedRoles, ["admin", "director"]);
  assert.deepEqual(result.contract.allowedDecisions, ["approve", "reject"]);
});

test("bloqueia o contrato quando a evidência técnica está incompleta", () => {
  const review = humanReview();
  review.review.status = "blocked_by_technical_evidence";
  review.review.canBeReviewed = false;
  review.review.blockers = ["LEAD_LINKAGE"];
  const result = buildWhatsAppMemoryDirectorDecisionContract(review);
  assert.equal(result.contract.status, "blocked_by_technical_evidence");
  assert.equal(result.contract.technicallyDecidable, false);
  assert.deepEqual(result.contract.blockers, ["LEAD_LINKAGE"]);
});

test("exige segurança, idempotência, justificativa e auditoria", () => {
  const result = buildWhatsAppMemoryDirectorDecisionContract(humanReview());
  assert.equal(result.contract.authenticationRequired, true);
  assert.equal(result.contract.tenantMatchRequired, true);
  assert.equal(result.contract.minimumReasonLength, 20);
  assert.equal(result.contract.requiredHumanConfirmations, 2);
  assert.equal(result.contract.idempotencyKeyRequired, true);
  assert.equal(result.contract.auditEventRequired, true);
  assert.equal(result.contract.requirements.length, 8);
  assert.equal(result.containsPii, false);
  assert.equal(result.readsMessageContent, false);
  assert.equal(result.automaticDecision, false);
});

test("interface explica o contrato sem oferecer aprovação fictícia", () => {
  const page = readFileSync("app/(crm)/integrations/whatsapp/page.tsx", "utf8");
  assert.match(page, /data-phase="371-whatsapp-memory-director-decision-contract"/);
  assert.match(page, /Contrato da decisão do diretor/);
  assert.match(page, /não registra nem executa qualquer decisão/i);
  assert.doesNotMatch(page, /Aprovar memória agora/);
});
