import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createModuleCompletionMemory } from "../../lib/release/module-completion-memory.mjs";
import { buildModuleDependencyGraph, createModuleDependencyGraphConfiguration } from "../../lib/release/module-dependency-graph.mjs";
import { createReleaseCompositionPlan, evaluateReleaseCompositionEligibility } from "../../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidencePlan, createReleaseGateEvidenceRecord, RELEASE_GATE_REQUIREMENTS } from "../../lib/release/release-gate-evidence-matrix.mjs";
import { createReleaseEvidenceIntake, createReleaseEvidenceIntakePolicy, processReleaseEvidenceIntake } from "../../lib/release/release-evidence-intake.mjs";
import { createReleaseEvidenceProvenanceEnvelope, createReleaseEvidenceProvenancePolicy, verifyReleaseEvidenceProvenance } from "../../lib/release/release-evidence-provenance.mjs";
import { admitReleaseEvidenceToMatrix, createReleaseEvidenceAdmissionPolicy } from "../../lib/release/release-evidence-admission.mjs";
import { createAdmittedEvidenceMatrixEvaluationPolicy, evaluateAdmittedEvidenceMatrix } from "../../lib/release/admitted-evidence-matrix-evaluation.mjs";
import { createReleaseGateReviewPacketPolicy, prepareReleaseGateReviewPacket } from "../../lib/release/release-gate-review-packet.mjs";
import {
  createHumanReleaseGateDecision, createHumanReleaseGateDecisionPolicy,
  inspectHumanReleaseGateDecision, inspectHumanReleaseGateDecisionPolicy,
  inspectHumanReleaseGateDecisionRegister, recordHumanReleaseGateDecisions,
} from "../../lib/release/human-release-gate-decisions.mjs";

function fixture({ complete = true } = {}) {
  const memory = createModuleCompletionMemory([{ moduleId: "conversion-core", moduleName: "Conversion Core", canonicalOwner: "conversion-core", revision: 1, completionLevel: "locally_verified", outcome: "captura governada", sourcePaths: ["lib/conversion-core.mjs"], evidencePaths: ["tests/conversion-core.test.mjs"], checks: { contracts: true, typecheck: true, lint: true, secretScan: true }, releaseGates: { runtimeHomologated: false, cleanBuildVerified: false, rollbackReady: false, directorApproved: false } }]);
  const entry = memory.entries[0];
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: createModuleDependencyGraphConfiguration({ sourceMemoryHash: memory.memoryHash, modules: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, dependencies: [] }] }) });
  const decision = evaluateReleaseCompositionEligibility({ graph, plan: createReleaseCompositionPlan({ compositionId: "conversion-core-candidate", sourceGraphHash: graph.graphHash, roots: [{ moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash }] }) });
  const plan = createReleaseGateEvidencePlan({ decision });
  const intakePolicy = createReleaseEvidenceIntakePolicy({ decision, plan });
  const selected = complete ? plan.modules[0].gates : [plan.modules[0].gates[0]];
  const requirements = selected.flatMap((gate) => gate.requiredEvidence.map((evidenceType) => ({ gate, evidenceType })));
  const records = requirements.map(({ gate, evidenceType }, index) => createReleaseGateEvidenceRecord({ evidenceId: `human-proof-${index + 1}`, moduleId: entry.moduleId, revision: 1, entryHash: entry.entryHash, compositionDecisionHash: decision.decisionHash, gate: gate.gate, evidenceType, ownerRole: RELEASE_GATE_REQUIREMENTS[gate.gate].ownerRole, environment: gate.gate === "directorApproved" ? "governance" : "isolated", result: "passed", observedAt: "2026-08-09T10:00:00.000Z", validUntil: "2026-08-09T12:00:00.000Z", artifacts: [`evidence/${gate.gate}/${evidenceType}.json`], artifactHash: `${index + 1}`.repeat(64).slice(0, 64) }));
  const roles = [...new Set(plan.modules[0].gates.map((gate) => gate.ownerRole))];
  const keyPairs = Object.fromEntries(roles.map((role) => [role, generateKeyPairSync("ed25519")]));
  const signers = roles.map((role) => ({ keyId: `${role.replaceAll("_", "-")}-key`, actorId: `${role.replaceAll("_", "-")}-actor`, role, channels: ["isolated_handoff"], publicKeyPem: keyPairs[role].publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-09T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" }));
  const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision, plan, intakePolicy, trustedSigners: signers, maxSignatureAgeSeconds: 900 });
  const admissionPolicy = createReleaseEvidenceAdmissionPolicy({ decision, plan, intakePolicy, provenancePolicy });
  const admissions = [...new Set(records.map((record) => record.ownerRole))].map((role, index) => {
    const signer = signers.find((item) => item.role === role);
    const intake = createReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intakeId: `human-intake-${role.replaceAll("_", "-")}`, submitter: { actorId: signer.actorId, role }, channel: "isolated_handoff", submittedAt: "2026-08-09T10:05:00.000Z", records: records.filter((record) => record.ownerRole === role) });
    const intakeResult = processReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-09T10:06:00.000Z" });
    const envelope = createReleaseEvidenceProvenanceEnvelope({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-09T10:07:00.000Z", nonce: `human-${index + 1}`, privateKey: keyPairs[role].privateKey });
    const provenanceResult = verifyReleaseEvidenceProvenance({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, envelope, verifiedAt: "2026-08-09T10:08:00.000Z" });
    const admissionResult = admitReleaseEvidenceToMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, intake, intakeResult, envelope, provenanceResult, admittedAt: "2026-08-09T10:09:00.000Z" });
    return { intake, intakeResult, envelope, provenanceResult, admissionResult };
  });
  const evaluationPolicy = createAdmittedEvidenceMatrixEvaluationPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy });
  const evaluationResult = evaluateAdmittedEvidenceMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, admissions, evaluatedAt: "2026-08-09T10:10:00.000Z" });
  const packetPolicy = createReleaseGateReviewPacketPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy });
  const packetContext = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, packetPolicy, admissions, evaluationResult };
  const packet = prepareReleaseGateReviewPacket({ ...packetContext, preparedAt: "2026-08-09T10:11:00.000Z" });
  const decisionPolicy = createHumanReleaseGateDecisionPolicy(packetContext);
  return { packetContext, packet, decisionPolicy, keyPairs, signers };
}

function signedDecision(value, gateName, outcome = "approved", suffix = "one") {
  const gate = value.packet.modules[0].gates.find((item) => item.gate === gateName);
  const signer = value.signers.find((item) => item.role === gate.reviewerRole);
  return createHumanReleaseGateDecision({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisionId: `decision-${gateName.toLowerCase()}-${suffix}`, moduleId: value.packet.modules[0].moduleId, gate: gateName, keyId: signer.keyId, outcome, reason: outcome === "approved" ? "Evidências revisadas e aceitas explicitamente." : "Evidências rejeitadas após revisão humana explícita.", decidedAt: "2026-08-09T10:12:00.000Z", nonce: `nonce-${gateName.toLowerCase()}-${suffix}`, privateKey: value.keyPairs[gate.reviewerRole].privateKey });
}

test("política exige decisão humana assinada e não produz efeitos", () => {
  const value = fixture();
  assert.equal(inspectHumanReleaseGateDecisionPolicy(value.decisionPolicy, value.packetContext).ok, true);
  for (const key of ["automaticGateExecution", "automaticReleaseApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) assert.equal(value.decisionPolicy[key], false);
});

test("decisão válida fica presa ao pacote, gate, papel, evidência e motivo", () => {
  const value = fixture();
  const decision = signedDecision(value, "runtimeHomologated");
  const inspection = inspectHumanReleaseGateDecision(decision, { packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy });
  assert.equal(inspection.ok, true);
  assert.equal(decision.reviewerRole, "quality_assurance");
  assert.match(decision.evidenceSnapshotHash, /^[a-f0-9]{64}$/);
});

test("assinatura ou conteúdo adulterado é rejeitado", () => {
  const value = fixture();
  const decision = signedDecision(value, "cleanBuildVerified");
  assert.equal(inspectHumanReleaseGateDecision({ ...decision, outcome: "rejected" }, { packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy }).ok, false);
  assert.equal(inspectHumanReleaseGateDecision({ ...decision, signature: `${decision.signature}x` }, { packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy }).ok, false);
});

test("papel incorreto e pacote incompleto não podem decidir gate", () => {
  const value = fixture();
  const engineering = value.signers.find((item) => item.role === "engineering");
  assert.throws(() => createHumanReleaseGateDecision({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisionId: "wrong-role", moduleId: value.packet.modules[0].moduleId, gate: "runtimeHomologated", keyId: engineering.keyId, outcome: "approved", reason: "Tentativa explícita pelo papel incorreto.", decidedAt: "2026-08-09T10:12:00.000Z", nonce: "wrong-role-once", privateKey: value.keyPairs.engineering.privateKey }), /reviewer_role_mismatch/);
  const blocked = fixture({ complete: false });
  assert.equal(blocked.packet.status, "blocked_incomplete_evidence");
  assert.throws(() => signedDecision(blocked, "runtimeHomologated"), /review_packet_not_ready/);
});

test("revisão parcial permanece aguardando e não executa efeitos", () => {
  const value = fixture();
  const decision = signedDecision(value, "runtimeHomologated");
  const register = recordHumanReleaseGateDecisions({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: [decision], recordedAt: "2026-08-09T10:13:00.000Z" });
  assert.equal(register.status, "awaiting_human_decisions");
  assert.equal(register.summary.missingDecisions, 3);
  for (const key of ["gatesExecuted", "releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) assert.equal(register[key], false);
  assert.equal(inspectHumanReleaseGateDecisionRegister(register, { packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: [decision] }).ok, true);
});

test("aprovações explícitas completas fecham revisão sem aprovar ou promover release", () => {
  const value = fixture();
  const decisions = value.packet.modules[0].gates.map((gate) => signedDecision(value, gate.gate));
  const register = recordHumanReleaseGateDecisions({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions, recordedAt: "2026-08-09T10:13:00.000Z" });
  assert.equal(register.status, "human_review_complete_approved");
  assert.equal(register.explicitReviewComplete, true);
  assert.equal(register.unanimousExplicitApproval, true);
  assert.equal(register.releaseApproved, false);
  assert.equal(register.gatesExecuted, false);
  assert.equal(register.releasePromoted, false);
});

test("uma rejeição explícita encerra revisão como rejeitada", () => {
  const value = fixture();
  const decisions = value.packet.modules[0].gates.map((gate) => signedDecision(value, gate.gate, gate.gate === "directorApproved" ? "rejected" : "approved"));
  const register = recordHumanReleaseGateDecisions({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions, recordedAt: "2026-08-09T10:13:00.000Z" });
  assert.equal(register.status, "human_review_complete_rejected");
  assert.equal(register.summary.rejectedGates, 1);
  assert.equal(register.unanimousExplicitApproval, false);
});

test("decisão duplicada ou registro adulterado é rejeitado", () => {
  const value = fixture();
  const decision = signedDecision(value, "rollbackReady");
  const duplicate = recordHumanReleaseGateDecisions({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: [decision, decision], recordedAt: "2026-08-09T10:13:00.000Z" });
  assert.equal(duplicate.status, "rejected");
  assert.ok(duplicate.rejectionReasons.includes("duplicate_module_gate_decision"));
  const valid = recordHumanReleaseGateDecisions({ packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: [decision], recordedAt: "2026-08-09T10:13:00.000Z" });
  assert.equal(inspectHumanReleaseGateDecisionRegister({ ...valid, releaseApproved: true }, { packet: value.packet, packetContext: value.packetContext, decisionPolicy: value.decisionPolicy, decisions: [decision] }).ok, false);
});
