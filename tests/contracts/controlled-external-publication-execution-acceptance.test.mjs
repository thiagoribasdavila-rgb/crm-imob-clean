import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  createControlledExternalPublicationExecutionAcceptanceMemory,
  createControlledExternalPublicationExecutionAcceptancePolicy,
  inspectControlledExternalPublicationExecutionAcceptanceMemory,
  inspectControlledExternalPublicationExecutionAcceptancePolicy,
  inspectControlledExternalPublicationExecutionAcceptanceReceipt,
  recordControlledExternalPublicationExecutionAcceptance,
} from "../../lib/release/controlled-external-publication-execution-acceptance.mjs";
import {
  createControlledExternalPublicationExecutionHandoff,
} from "../../lib/release/controlled-external-publication-execution-handoff.mjs";
import {
  fixture as handoffFixture,
  handoffArguments,
} from "./controlled-external-publication-execution-handoff.test.mjs";

function acceptancePolicyContext(subject) {
  return {
    ...handoffArguments(subject),
    controlledExternalPublicationExecutionHandoffPolicy: subject.controlledExternalPublicationExecutionHandoffPolicy,
  };
}

export async function fixture() {
  const subject = await handoffFixture();
  const handoff = createControlledExternalPublicationExecutionHandoff(handoffArguments(subject));
  const controlledExternalPublicationExecutionAcceptancePolicy = createControlledExternalPublicationExecutionAcceptancePolicy(
    acceptancePolicyContext(subject),
  );
  const controlledExternalPublicationExecutionAcceptanceMemory = createControlledExternalPublicationExecutionAcceptanceMemory({
    policy: controlledExternalPublicationExecutionAcceptancePolicy,
  });
  return {
    ...subject,
    handoffReceipt: handoff.handoffReceipt,
    controlledExternalPublicationExecutionHandoffMemory: handoff.controlledExternalPublicationExecutionHandoffMemory,
    controlledExternalPublicationExecutionAcceptancePolicy,
    controlledExternalPublicationExecutionAcceptanceMemory,
  };
}

export function acceptanceArguments(subject, overrides = {}) {
  return {
    ...handoffArguments(subject),
    controlledExternalPublicationExecutionHandoffReceipt: subject.handoffReceipt,
    controlledExternalPublicationExecutionHandoffMemory: subject.controlledExternalPublicationExecutionHandoffMemory,
    controlledExternalPublicationExecutionAcceptancePolicy: subject.controlledExternalPublicationExecutionAcceptancePolicy,
    controlledExternalPublicationExecutionAcceptanceMemory: subject.controlledExternalPublicationExecutionAcceptanceMemory,
    acceptanceId: "external-publication-execution-acceptance-one",
    externalExecutorKeyId: subject.executor.descriptor.keyId,
    externalExecutorPrivateKey: subject.executor.privateKey,
    decision: "accepted",
    reasonCode: "execution-handoff-accepted",
    decidedAt: "2026-08-09T10:30:30.000Z",
    nonce: "external-publication-execution-acceptance-nonce-one",
    ...overrides,
  };
}

test("política habilita somente a decisão assinada e mantém toda execução bloqueada", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectControlledExternalPublicationExecutionAcceptancePolicy(
      subject.controlledExternalPublicationExecutionAcceptancePolicy,
      acceptancePolicyContext(subject),
    ).ok, true);
    assert.equal(inspectControlledExternalPublicationExecutionAcceptanceMemory(
      subject.controlledExternalPublicationExecutionAcceptanceMemory,
      { policy: subject.controlledExternalPublicationExecutionAcceptancePolicy },
    ).ok, true);
    assert.equal(subject.controlledExternalPublicationExecutionAcceptancePolicy.executionAcceptanceAllowed, true);
    for (const key of [
      "publicationExecutionAllowed",
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticPublicationExecution",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.controlledExternalPublicationExecutionAcceptancePolicy[key], false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("executor direcionado aceita o handoff com recibo assinado sem executar publicação", async () => {
  const subject = await fixture();
  try {
    const result = recordControlledExternalPublicationExecutionAcceptance(acceptanceArguments(subject));
    const inspection = inspectControlledExternalPublicationExecutionAcceptanceReceipt(result.acceptanceReceipt, {
      ...acceptanceArguments(subject),
      controlledExternalPublicationExecutionAcceptanceMemory: result.controlledExternalPublicationExecutionAcceptanceMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(inspection.decision, "accepted");
    assert.equal(inspection.executionAccepted, true);
    assert.equal(inspection.publicationExecutionPermitted, false);
    assert.equal(result.acceptanceReceipt.externalPublicationExecuted, false);
    assert.equal(result.acceptanceReceipt.buildExecuted, false);
    assert.equal(result.acceptanceReceipt.deployExecuted, false);
    assert.equal(result.controlledExternalPublicationExecutionAcceptanceMemory.summary.accepted, 1);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("rejeição também é terminal, assinada e não executa qualquer efeito externo", async () => {
  const subject = await fixture();
  try {
    const result = recordControlledExternalPublicationExecutionAcceptance(acceptanceArguments(subject, {
      decision: "rejected",
      reasonCode: "execution-handoff-rejected",
    }));
    const inspection = inspectControlledExternalPublicationExecutionAcceptanceReceipt(result.acceptanceReceipt, {
      ...acceptanceArguments(subject),
      controlledExternalPublicationExecutionAcceptanceMemory: result.controlledExternalPublicationExecutionAcceptanceMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(inspection.decision, "rejected");
    assert.equal(inspection.executionAccepted, false);
    assert.equal(result.controlledExternalPublicationExecutionAcceptanceMemory.summary.rejected, 1);
    assert.equal(result.acceptanceReceipt.externalPublicationExecuted, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("executor diferente, chave privada diferente e decisão fora da validade são rejeitados", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => recordControlledExternalPublicationExecutionAcceptance(acceptanceArguments(subject, {
      externalExecutorKeyId: "external-publication-wrong-executor-key",
    })), /wrong_target_executor/);
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(() => recordControlledExternalPublicationExecutionAcceptance(acceptanceArguments(subject, {
      externalExecutorPrivateKey: unrelated.privateKey,
    })), /private_key_does_not_match_external_publication_executor/);
    assert.throws(() => recordControlledExternalPublicationExecutionAcceptance(acceptanceArguments(subject, {
      decidedAt: "2026-08-09T10:31:31.000Z",
    })), /after_handoff_expiration/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("decisão duplicada, recibo adulterado e memória divergente são detectados", async () => {
  const subject = await fixture();
  try {
    const first = recordControlledExternalPublicationExecutionAcceptance(acceptanceArguments(subject));
    assert.throws(() => recordControlledExternalPublicationExecutionAcceptance(acceptanceArguments(subject, {
      controlledExternalPublicationExecutionAcceptanceMemory: first.controlledExternalPublicationExecutionAcceptanceMemory,
      acceptanceId: "external-publication-execution-acceptance-two",
      nonce: "external-publication-execution-acceptance-nonce-two",
    })), /handoff_decision_already_recorded/);
    const inspectionContext = {
      ...acceptanceArguments(subject),
      controlledExternalPublicationExecutionAcceptanceMemory: first.controlledExternalPublicationExecutionAcceptanceMemory,
    };
    assert.equal(inspectControlledExternalPublicationExecutionAcceptanceReceipt({
      ...first.acceptanceReceipt,
      publicationExecutionPermitted: true,
    }, inspectionContext).ok, false);
    assert.equal(inspectControlledExternalPublicationExecutionAcceptanceMemory({
      ...first.controlledExternalPublicationExecutionAcceptanceMemory,
      summary: { ...first.controlledExternalPublicationExecutionAcceptanceMemory.summary, buildExecuted: true },
    }, { policy: subject.controlledExternalPublicationExecutionAcceptancePolicy }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});
