import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidenceRecord } from "../lib/release/release-gate-evidence-matrix.mjs";
import { createReleaseEvidenceIntake, processReleaseEvidenceIntake } from "../lib/release/release-evidence-intake.mjs";
import {
  createReleaseEvidenceProvenanceEnvelope,
  createReleaseEvidenceProvenancePolicy,
  verifyReleaseEvidenceProvenance,
} from "../lib/release/release-evidence-provenance.mjs";
import {
  admitReleaseEvidenceToMatrix,
  createReleaseEvidenceAdmissionPolicy,
  extractAdmittedEvidenceRecords,
  inspectReleaseEvidenceAdmissionPolicy,
  inspectReleaseEvidenceAdmissionResult,
} from "../lib/release/release-evidence-admission.mjs";

const fail = (message) => { throw new Error(`[phase-204] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-204-evidence-matrix-admission.json",
  "config/release-evidence-admission-policy.json",
  "docs/EVOLUTION_PHASE_204_EVIDENCE_MATRIX_ADMISSION.md",
  "lib/release/release-evidence-admission.mjs",
  "scripts/run-release-evidence-admission-phase-204.mjs",
  "tests/contracts/release-evidence-admission.test.mjs",
];

for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const admissionPolicy = readJson(required[1]);
const plan = readJson("config/release-gate-evidence-plan.json");
const intakePolicy = readJson("config/release-evidence-intake-policy.json");
const provenancePolicy = readJson("config/release-evidence-provenance-policy.json");
const graph = buildModuleDependencyGraph({
  completionMemory: readJson("config/release-module-completion-memory.json"),
  configuration: readJson("config/release-module-dependency-graph.json"),
});
const decision = evaluateReleaseCompositionEligibility({
  graph,
  plan: readJson("config/release-composition-plan.json"),
});

if (phase.phase !== 204 || phase.status !== "implemented") fail("fase ou status inválido");
for (const [key, value] of Object.entries(phase.safety)) {
  if (value !== false) fail(`${key} deveria permanecer falso`);
}

const policyInspection = inspectReleaseEvidenceAdmissionPolicy(admissionPolicy, {
  decision,
  plan,
  intakePolicy,
  provenancePolicy,
});
if (!policyInspection.ok) fail(`política canônica inválida: ${policyInspection.reason}`);
if (phase.currentState.admissionPolicyHash !== admissionPolicy.policyHash) fail("hash da política divergente");
if (provenancePolicy.trustedSigners.length !== 0) {
  fail("signatário real foi inventado");
}
for (const key of ["admissionsReceived", "admissionsAccepted", "recordsAdmitted"]) {
  if (phase.currentState[key] !== 0) fail(`${key} deveria iniciar zerado`);
}

const moduleEntry = plan.modules[0];
const gate = moduleEntry.gates.find((item) => item.gate === "runtimeHomologated");
if (!gate) fail("gate de fixture não encontrado");

const record = createReleaseGateEvidenceRecord({
  evidenceId: "phase-204-contract-fixture",
  moduleId: moduleEntry.moduleId,
  revision: moduleEntry.revision,
  entryHash: moduleEntry.entryHash,
  compositionDecisionHash: decision.decisionHash,
  gate: gate.gate,
  evidenceType: gate.requiredEvidence[0],
  ownerRole: gate.ownerRole,
  environment: "isolated",
  result: "passed",
  observedAt: "2026-08-08T12:00:00.000Z",
  validUntil: "2026-08-09T12:00:00.000Z",
  artifacts: ["evidence/phase-204/proof.json"],
  artifactHash: "b".repeat(64),
});
const intake = createReleaseEvidenceIntake({
  decision,
  plan,
  policy: intakePolicy,
  intakeId: "phase-204-contract-intake",
  submitter: { actorId: "phase-204-checker", role: gate.ownerRole },
  channel: "isolated_handoff",
  submittedAt: "2026-08-08T12:01:00.000Z",
  records: [record],
});
const intakeResult = processReleaseEvidenceIntake({
  decision,
  plan,
  policy: intakePolicy,
  intake,
  receivedAt: "2026-08-08T12:02:00.000Z",
});

const keys = generateKeyPairSync("ed25519");
const testProvenancePolicy = createReleaseEvidenceProvenancePolicy({
  decision,
  plan,
  intakePolicy,
  trustedSigners: [{
    keyId: "phase-204-test-key",
    actorId: "phase-204-checker",
    role: gate.ownerRole,
    channels: ["isolated_handoff"],
    publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    validFrom: "2026-08-08T00:00:00.000Z",
    validUntil: "2026-08-10T00:00:00.000Z",
    status: "active",
  }],
});
const envelope = createReleaseEvidenceProvenanceEnvelope({
  decision,
  plan,
  intakePolicy,
  provenancePolicy: testProvenancePolicy,
  intake,
  intakeResult,
  keyId: "phase-204-test-key",
  signedAt: "2026-08-08T12:03:00.000Z",
  nonce: "phase-204-once",
  privateKey: keys.privateKey,
});
const provenanceResult = verifyReleaseEvidenceProvenance({
  decision,
  plan,
  intakePolicy,
  provenancePolicy: testProvenancePolicy,
  intake,
  intakeResult,
  envelope,
  verifiedAt: "2026-08-08T12:04:00.000Z",
});
if (!provenanceResult.provenanceVerified) fail("proveniência efêmera não foi validada");

const testAdmissionPolicy = createReleaseEvidenceAdmissionPolicy({
  decision,
  plan,
  intakePolicy,
  provenancePolicy: testProvenancePolicy,
});
const admissionContext = {
  decision,
  plan,
  intakePolicy,
  provenancePolicy: testProvenancePolicy,
  admissionPolicy: testAdmissionPolicy,
  intake,
  intakeResult,
  envelope,
  provenanceResult,
};
const admission = admitReleaseEvidenceToMatrix({
  ...admissionContext,
  admittedAt: "2026-08-08T12:05:00.000Z",
});
if (admission.status !== "admitted_to_evidence_matrix" || admission.recordsAdmitted !== 1) {
  fail("evidência válida não foi admitida");
}
const resultInspection = inspectReleaseEvidenceAdmissionResult(admission, admissionContext);
if (!resultInspection.ok || !resultInspection.admitted) fail("resultado de admissão não revalidou");
const extracted = extractAdmittedEvidenceRecords(admission, intake);
if (extracted.length !== 1 || extracted[0].recordHash !== record.recordHash) fail("extração admitida divergente");
for (const key of ["evidenceMatrixEvaluated", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted"]) {
  if (admission[key] !== false) fail(`${key} foi executado indevidamente`);
}

const replay = admitReleaseEvidenceToMatrix({
  ...admissionContext,
  admittedAt: "2026-08-08T12:06:00.000Z",
  seenIntakeHashes: [intake.intakeHash],
  seenEvidenceIds: [record.evidenceId],
  seenRecordHashes: [record.recordHash],
});
if (replay.status !== "quarantined" || replay.recordsAdmitted !== 0 || replay.rejectionReasons.length !== 3) {
  fail("replay não foi bloqueado de forma completa");
}

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 204) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-204:assess", "evolution:phase-204:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log("[phase-204] PASS — admissão atômica validada, replay bloqueado, matriz não executada, 0 signatários reais inventados e nenhuma promoção realizada.");
