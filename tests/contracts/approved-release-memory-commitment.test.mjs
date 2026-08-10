import assert from "node:assert/strict";
import test from "node:test";
import { createReleaseGateResultAdjudication } from "../../lib/release/release-gate-result-adjudication.mjs";
import { createFinalReleaseApprovalDecision } from "../../lib/release/final-release-approval-decision.mjs";
import {
  appendApprovedReleaseMemory,
  createApprovedReleaseMemory,
  createApprovedReleaseMemoryPolicy,
  inspectApprovedReleaseMemory,
  inspectApprovedReleaseMemoryPolicy
} from "../../lib/release/approved-release-memory-commitment.mjs";
import {
  adjudicationArguments,
  approvalArguments,
  approvalFixture,
  fixture,
  gateDecisions
} from "./final-release-approval-decision.test.mjs";

export async function approvedFixture() {
  const value = await fixture();
  const adjudicationRegister = createReleaseGateResultAdjudication(adjudicationArguments(value));
  const approval = approvalFixture(value);
  const approvalDecision = createFinalReleaseApprovalDecision(approvalArguments(value, adjudicationRegister, approval));
  const approvalContext = { ...value, adjudicationRegister };
  const policy = createApprovedReleaseMemoryPolicy({ approvalPolicy: approval.approvalPolicy, ...approvalContext });
  const memory = createApprovedReleaseMemory({ policy });
  return { value, adjudicationRegister, approval, approvalDecision, approvalContext, policy, memory };
}

export function appendArguments(subject, overrides = {}) {
  return {
    memory: subject.memory,
    policy: subject.policy,
    approvalDecision: subject.approvalDecision,
    committedAt: "2026-08-09T10:18:00.000Z",
    approvalPolicy: subject.approval.approvalPolicy,
    ...subject.approvalContext,
    ...overrides
  };
}

test("política e memória vazia são determinísticas e mantêm efeitos externos desligados", async () => {
  const subject = await approvedFixture();
  assert.equal(inspectApprovedReleaseMemoryPolicy(subject.policy, { approvalPolicy: subject.approval.approvalPolicy, ...subject.approvalContext }).ok, true);
  assert.equal(inspectApprovedReleaseMemory(subject.memory, { policy: subject.policy }).ok, true);
  assert.equal(subject.memory.entries.length, 0);
  for (const key of ["automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) assert.equal(subject.policy[key], false);
});

test("aprovação final válida é anexada sem gerar pacote, deploy ou promoção", async () => {
  const subject = await approvedFixture();
  const committed = appendApprovedReleaseMemory(appendArguments(subject));
  assert.equal(inspectApprovedReleaseMemory(committed, { policy: subject.policy }).ok, true);
  assert.equal(committed.summary.committedApprovals, 1);
  assert.equal(committed.entries[0].releaseMemoryCommitted, true);
  for (const key of ["packageGenerated", "deployExecuted", "releasePromoted"]) assert.equal(committed.entries[0][key], false);
});

test("decisão rejeitada nunca pode entrar na memória aprovada", async () => {
  const value = await fixture({ failFirstGate: true });
  const adjudicationRegister = createReleaseGateResultAdjudication(adjudicationArguments(value, { gateDecisions: gateDecisions(value, true) }));
  const approval = approvalFixture(value);
  const approvalDecision = createFinalReleaseApprovalDecision(approvalArguments(value, adjudicationRegister, approval, {
    outcome: "rejected",
    reasonCode: "gate-results-rejected",
    reason: "O conjunto de gates contém falha e não autoriza a liberação final."
  }));
  const approvalContext = { ...value, adjudicationRegister };
  const policy = createApprovedReleaseMemoryPolicy({ approvalPolicy: approval.approvalPolicy, ...approvalContext });
  const memory = createApprovedReleaseMemory({ policy });
  assert.throws(() => appendApprovedReleaseMemory({ memory, policy, approvalDecision, committedAt: "2026-08-09T10:18:00.000Z", approvalPolicy: approval.approvalPolicy, ...approvalContext }), /only_approved_final_release_decision_can_be_committed/);
});

test("decisão, identificador e nonce duplicados são bloqueados", async () => {
  const subject = await approvedFixture();
  const committed = appendApprovedReleaseMemory(appendArguments(subject));
  assert.throws(() => appendApprovedReleaseMemory(appendArguments(subject, { memory: committed })), /approved_release_memory_decision_duplicate/);

  const sameId = createFinalReleaseApprovalDecision(approvalArguments(subject.value, subject.adjudicationRegister, subject.approval, {
    nonce: "final-release-approval-two",
    decidedAt: "2026-08-09T10:17:10.000Z"
  }));
  assert.throws(() => appendApprovedReleaseMemory(appendArguments(subject, { memory: committed, approvalDecision: sameId, committedAt: "2026-08-09T10:18:10.000Z" })), /approved_release_memory_approval_id_duplicate/);

  const sameNonce = createFinalReleaseApprovalDecision(approvalArguments(subject.value, subject.adjudicationRegister, subject.approval, {
    approvalId: "final-release-approval-two",
    decidedAt: "2026-08-09T10:17:20.000Z"
  }));
  assert.throws(() => appendApprovedReleaseMemory(appendArguments(subject, { memory: committed, approvalDecision: sameNonce, committedAt: "2026-08-09T10:18:20.000Z" })), /approved_release_memory_approval_nonce_duplicate/);
});

test("adulteração e compromisso fora da janela são detectados", async () => {
  const subject = await approvedFixture();
  const committed = appendApprovedReleaseMemory(appendArguments(subject));
  const tampered = { ...committed, entries: [{ ...committed.entries[0], approverActorId: "outro-ator" }] };
  assert.equal(inspectApprovedReleaseMemory(tampered, { policy: subject.policy }).reason, "approved_release_memory_entry_hash_mismatch");
  assert.throws(() => appendApprovedReleaseMemory(appendArguments(subject, { committedAt: "2026-08-09T11:00:00.000Z" })), /release_memory_commit_window_expired/);
});
