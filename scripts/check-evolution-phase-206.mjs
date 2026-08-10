import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidenceRecord } from "../lib/release/release-gate-evidence-matrix.mjs";
import { createReleaseEvidenceIntake, processReleaseEvidenceIntake } from "../lib/release/release-evidence-intake.mjs";
import { createReleaseEvidenceProvenanceEnvelope, createReleaseEvidenceProvenancePolicy, verifyReleaseEvidenceProvenance } from "../lib/release/release-evidence-provenance.mjs";
import { admitReleaseEvidenceToMatrix, createReleaseEvidenceAdmissionPolicy } from "../lib/release/release-evidence-admission.mjs";
import { createAdmittedEvidenceMatrixEvaluationPolicy, evaluateAdmittedEvidenceMatrix } from "../lib/release/admitted-evidence-matrix-evaluation.mjs";
import { createReleaseGateReviewPacketPolicy, inspectReleaseGateReviewPacket, inspectReleaseGateReviewPacketPolicy, prepareReleaseGateReviewPacket } from "../lib/release/release-gate-review-packet.mjs";

const fail = (message) => { throw new Error(`[phase-206] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-206-release-gate-review-packet.json",
  "config/release-gate-review-packet-policy.json",
  "docs/EVOLUTION_PHASE_206_RELEASE_GATE_REVIEW_PACKET.md",
  "lib/release/release-gate-review-packet.mjs",
  "scripts/run-release-gate-review-packet-phase-206.mjs",
  "tests/contracts/release-gate-review-packet.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const memory = readJson("config/release-module-completion-memory.json");
const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: readJson("config/release-module-dependency-graph.json") });
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const plan = readJson("config/release-gate-evidence-plan.json");
const intakePolicy = readJson("config/release-evidence-intake-policy.json");
const canonicalProvenancePolicy = readJson("config/release-evidence-provenance-policy.json");
const canonicalAdmissionPolicy = readJson("config/release-evidence-admission-policy.json");
const canonicalEvaluationPolicy = readJson("config/admitted-evidence-matrix-evaluation-policy.json");
const canonicalPacketPolicy = readJson(required[1]);
const canonicalContext = { decision, plan, intakePolicy, provenancePolicy: canonicalProvenancePolicy, admissionPolicy: canonicalAdmissionPolicy, evaluationPolicy: canonicalEvaluationPolicy };

if (phase.phase !== 206 || phase.status !== "implemented") fail("fase ou status inválido");
if (canonicalProvenancePolicy.trustedSigners.length !== 0) fail("signatário real foi inventado");
const canonicalInspection = inspectReleaseGateReviewPacketPolicy(canonicalPacketPolicy, canonicalContext);
if (!canonicalInspection.ok || phase.currentState.reviewPacketPolicyHash !== canonicalPacketPolicy.policyHash) fail(`política canônica inválida: ${canonicalInspection.reason ?? "hash divergente"}`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");
for (const key of ["approvalRecorded", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}

const gate = plan.modules[0].gates.find((item) => item.gate === "runtimeHomologated");
const keys = generateKeyPairSync("ed25519");
const signer = {
  keyId: "phase-206-test-key",
  actorId: "phase-206-qa",
  role: gate.ownerRole,
  channels: ["isolated_handoff"],
  publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
  validFrom: "2026-08-09T00:00:00.000Z",
  validUntil: "2026-08-10T00:00:00.000Z",
  status: "active",
};
const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision, plan, intakePolicy, trustedSigners: [signer] });
const admissionPolicy = createReleaseEvidenceAdmissionPolicy({ decision, plan, intakePolicy, provenancePolicy });
const evaluationPolicy = createAdmittedEvidenceMatrixEvaluationPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy });
const moduleEntry = plan.modules[0];
const record = createReleaseGateEvidenceRecord({
  evidenceId: "phase-206-proof",
  moduleId: moduleEntry.moduleId,
  revision: moduleEntry.revision,
  entryHash: moduleEntry.entryHash,
  compositionDecisionHash: decision.decisionHash,
  gate: gate.gate,
  evidenceType: gate.requiredEvidence[0],
  ownerRole: gate.ownerRole,
  environment: "isolated",
  result: "passed",
  observedAt: "2026-08-09T12:00:00.000Z",
  validUntil: "2026-08-09T13:00:00.000Z",
  artifacts: ["evidence/phase-206/proof.json"],
  artifactHash: "d".repeat(64),
});
const intake = createReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intakeId: "phase-206-intake", submitter: { actorId: signer.actorId, role: signer.role }, channel: "isolated_handoff", submittedAt: "2026-08-09T12:01:00.000Z", records: [record] });
const intakeResult = processReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-09T12:02:00.000Z" });
const envelope = createReleaseEvidenceProvenanceEnvelope({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-09T12:03:00.000Z", nonce: "phase-206-once", privateKey: keys.privateKey });
const provenanceResult = verifyReleaseEvidenceProvenance({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, envelope, verifiedAt: "2026-08-09T12:04:00.000Z" });
const admissionResult = admitReleaseEvidenceToMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, intake, intakeResult, envelope, provenanceResult, admittedAt: "2026-08-09T12:05:00.000Z" });
const admissions = [{ intake, intakeResult, envelope, provenanceResult, admissionResult }];
const evaluationResult = evaluateAdmittedEvidenceMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, admissions, evaluatedAt: "2026-08-09T12:06:00.000Z" });
const packetPolicy = createReleaseGateReviewPacketPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy });
const context = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, packetPolicy, admissions, evaluationResult };
const packet = prepareReleaseGateReviewPacket({ ...context, preparedAt: "2026-08-09T12:07:00.000Z" });
if (packet.status !== "blocked_incomplete_evidence" || packet.matrixSummary?.missingEvidenceItems < 1) fail("dossiê parcial não foi bloqueado");
if (!packet.evidenceRevalidatedAtPreparation || !inspectReleaseGateReviewPacket(packet, context).ok) fail("dossiê não revalidou");
for (const key of ["approvalRecorded", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
  if (packet[key] !== false) fail(`${key} executado indevidamente`);
}

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 206) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-206:assess", "evolution:phase-206:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);
console.log("[phase-206] PASS — avaliação revalidada, matriz reconstruída, dossiê incompleto bloqueado e nenhum gate, aprovação, pacote, deploy ou promoção executado.");
