import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES,
  createControlledProofExecutionRecurringCycleMemory,
  createControlledProofExecutionRecurringCyclePolicy,
  inspectControlledProofExecutionRecurringCycleMemory,
  recordControlledProofExecutionRecurringCycleStage,
} from "../../lib/release/controlled-proof-execution-recurring-cycle.mjs";

const hash = (character) => character.repeat(64);

function fixture() {
  const keys = CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.map(() => generateKeyPairSync("ed25519"));
  const trustedActors = CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.map((stage, index) => ({
    stage,
    keyId: `phase-${255 + index}-${stage}-key`,
    actorId: `phase-${255 + index}-${stage}-actor`,
    publicKeyPem: keys[index].publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T15:00:00.000Z",
    validUntil: "2026-08-09T18:00:00.000Z",
  }));
  const policy = createControlledProofExecutionRecurringCyclePolicy({
    compositionId: "conversion-core-candidate",
    upstreamAuthorizationPolicyHash: hash("a"),
    upstreamAuthorizationMemoryHash: hash("b"),
    trustedActors,
  });
  return { keys, policy, memory: createControlledProofExecutionRecurringCycleMemory({ policy }) };
}

test("dezenove ciclos recorrentes são registrados na ordem, assinados e sem efeitos externos", () => {
  const subject = fixture();
  let memory = subject.memory;
  Array.from({ length: 19 }, () => CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES).flat().forEach((stage, index) => {
    const actorIndex = index % CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.length;
    const result = recordControlledProofExecutionRecurringCycleStage({
      policy: subject.policy,
      memory,
      stage,
      inputEvidenceHash: (index + 1).toString(16).padStart(64, "0"),
      actorKeyId: subject.policy.trustedActors[actorIndex].keyId,
      actorPrivateKey: subject.keys[actorIndex].privateKey,
      recordedAt: `2026-08-09T${String(15 + Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`,
    });
    memory = result.memory;
  });
  assert.equal(memory.entries.length, 95);
  assert.equal(memory.summary.completedCycles, 19);
  assert.equal(memory.summary.nextStage, "authorization-consumption");
  assert.equal(inspectControlledProofExecutionRecurringCycleMemory(memory, { policy: subject.policy }).ok, true);
  for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
    assert.equal(memory.summary[key], false, key);
  }
});

test("ordem, assinatura, independência e integridade não podem ser contornadas", () => {
  const subject = fixture();
  assert.throws(() => recordControlledProofExecutionRecurringCycleStage({
    policy: subject.policy,
    memory: subject.memory,
    stage: "continuation",
    inputEvidenceHash: hash("c"),
    actorKeyId: subject.policy.trustedActors[1].keyId,
    actorPrivateKey: subject.keys[1].privateKey,
    recordedAt: "2026-08-09T15:01:00.000Z",
  }), /stage_order_invalid/);
  assert.throws(() => recordControlledProofExecutionRecurringCycleStage({
    policy: subject.policy,
    memory: subject.memory,
    stage: "authorization-consumption",
    inputEvidenceHash: hash("c"),
    actorKeyId: subject.policy.trustedActors[0].keyId,
    actorPrivateKey: subject.keys[1].privateKey,
    recordedAt: "2026-08-09T15:01:00.000Z",
  }), /private_key_does_not_match/);
  assert.equal(inspectControlledProofExecutionRecurringCycleMemory({ ...subject.memory, memoryHash: hash("f") }, { policy: subject.policy }).ok, false);
});
