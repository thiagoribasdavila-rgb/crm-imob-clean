import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWhatsAppMemoryReleaseGate } from "../../lib/analytics/whatsapp-memory-release-gate.ts";

const evidence = () => ({
  continuity: {
    source: { total: 2, observed: 2, truncated: false },
    ownership: {
      linked: 2,
      unlinked: 0,
      ownershipComparable: 2,
      alignedOwner: 2,
      ownerMismatch: 0,
      conversationOwnerMissing: 0,
      leadOwnerMissing: 0,
      bothUnassigned: 0,
      missingLeadRecord: 0,
      alignmentRate: 100,
    },
  },
  capture: {
    source: { total: 4, observed: 4, truncated: false },
    capture: { total: 4, structurallyUsable: 4, structuralCoveragePercent: 100 },
    traceability: { externallyTraceable: 4, coveragePercent: 100 },
    canonicalMemory: { coveredMessages: 4, coveragePercent: 100, structuredLearningReady: true },
    authorization: { rawContentLearningAuthorized: false },
    learning: { mode: "structured_only", structuredLearningReady: true, rawContentLearningReady: false },
  },
  context: {
    source: { total: 2, observed: 2, truncated: false },
    context: { total: 2, complete: 2, completenessPercent: 100 },
    readiness: { decisionSupportReady: true, rawContentUsed: false, requiresHumanReview: true },
  },
});

test("libera somente para aprovação humana quando toda evidência está completa", () => {
  const result = buildWhatsAppMemoryReleaseGate(evidence());
  assert.equal(result.gate.status, "ready_for_human_release");
  assert.equal(result.gate.readyForHumanRelease, true);
  assert.equal(result.gate.requiresHumanApproval, true);
  assert.equal(result.gate.passedControls, result.gate.totalControls);
  assert.equal(result.containsPii, false);
  assert.equal(result.readsMessageContent, false);
  assert.equal(result.automaticDecision, false);
});

test("bloqueia ausência de tráfego real", () => {
  const input = evidence();
  input.capture.source.total = 0;
  input.capture.source.observed = 0;
  input.capture.capture.total = 0;
  const result = buildWhatsAppMemoryReleaseGate(input);
  assert.equal(result.gate.status, "blocked");
  assert.ok(result.gate.blockers.includes("REAL_TRAFFIC"));
});

test("bloqueia fonte parcial, órfãos e divergência de titularidade", () => {
  const input = evidence();
  input.continuity.source.truncated = true;
  input.continuity.ownership.unlinked = 1;
  input.continuity.ownership.ownerMismatch = 1;
  input.continuity.ownership.alignmentRate = 50;
  const result = buildWhatsAppMemoryReleaseGate(input);
  assert.equal(result.gate.readyForHumanRelease, false);
  assert.ok(result.gate.blockers.includes("COMPLETE_OBSERVATION"));
  assert.ok(result.gate.blockers.includes("LEAD_LINKAGE"));
  assert.ok(result.gate.blockers.includes("OWNERSHIP_PROVEN"));
});

test("interface declara governança, privacidade e limite da prova", () => {
  const page = readFileSync("app/(crm)/integrations/whatsapp/page.tsx", "utf8");
  assert.match(page, /data-phase="369-whatsapp-memory-release-gate"/);
  assert.match(page, /APROVAÇÃO HUMANA/);
  assert.match(page, /Sem PII, conteúdo bruto ou decisão automática/);
  assert.match(page, /Não comprova ganho de vendas/);
});
