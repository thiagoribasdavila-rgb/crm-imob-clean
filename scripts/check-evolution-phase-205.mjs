import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidenceRecord } from "../lib/release/release-gate-evidence-matrix.mjs";
import { createReleaseEvidenceIntake, processReleaseEvidenceIntake } from "../lib/release/release-evidence-intake.mjs";
import { createReleaseEvidenceProvenanceEnvelope, createReleaseEvidenceProvenancePolicy, verifyReleaseEvidenceProvenance } from "../lib/release/release-evidence-provenance.mjs";
import { admitReleaseEvidenceToMatrix, createReleaseEvidenceAdmissionPolicy } from "../lib/release/release-evidence-admission.mjs";
import { createAdmittedEvidenceMatrixEvaluationPolicy, evaluateAdmittedEvidenceMatrix, inspectAdmittedEvidenceMatrixEvaluationPolicy, inspectAdmittedEvidenceMatrixEvaluationResult } from "../lib/release/admitted-evidence-matrix-evaluation.mjs";

const fail = (message) => { throw new Error(`[phase-205] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-205-admitted-evidence-matrix-evaluation.json",
  "config/admitted-evidence-matrix-evaluation-policy.json",
  "docs/EVOLUTION_PHASE_205_ADMITTED_EVIDENCE_MATRIX_EVALUATION.md",
  "lib/release/admitted-evidence-matrix-evaluation.mjs",
  "scripts/run-admitted-evidence-matrix-evaluation-phase-205.mjs",
  "tests/contracts/admitted-evidence-matrix-evaluation.test.mjs"
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
const evaluationPolicy = readJson(required[1]);
if (phase.phase !== 205 || phase.status !== "implemented") fail("fase ou status inválido");
if (canonicalProvenancePolicy.trustedSigners.length !== 0) fail("signatário real foi inventado");
const inspection = inspectAdmittedEvidenceMatrixEvaluationPolicy(evaluationPolicy, { decision, plan, intakePolicy, provenancePolicy: canonicalProvenancePolicy, admissionPolicy: canonicalAdmissionPolicy });
if (!inspection.ok || phase.currentState.evaluationPolicyHash !== evaluationPolicy.policyHash) fail(`política canônica inválida: ${inspection.reason ?? "hash divergente"}`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");

const gate = plan.modules[0].gates.find((item) => item.gate === "runtimeHomologated");
const keys = generateKeyPairSync("ed25519");
const signer = { keyId: "phase-205-test-key", actorId: "phase-205-qa", role: gate.ownerRole, channels: ["isolated_handoff"], publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), validFrom: "2026-08-08T00:00:00.000Z", validUntil: "2026-08-10T00:00:00.000Z", status: "active" };
const provenancePolicy = createReleaseEvidenceProvenancePolicy({ decision, plan, intakePolicy, trustedSigners: [signer] });
const admissionPolicy = createReleaseEvidenceAdmissionPolicy({ decision, plan, intakePolicy, provenancePolicy });
const policy = createAdmittedEvidenceMatrixEvaluationPolicy({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy });
const moduleEntry = plan.modules[0];
const record = createReleaseGateEvidenceRecord({ evidenceId: "phase-205-proof", moduleId: moduleEntry.moduleId, revision: moduleEntry.revision, entryHash: moduleEntry.entryHash, compositionDecisionHash: decision.decisionHash, gate: gate.gate, evidenceType: gate.requiredEvidence[0], ownerRole: gate.ownerRole, environment: "isolated", result: "passed", observedAt: "2026-08-08T12:00:00.000Z", validUntil: "2026-08-09T12:00:00.000Z", artifacts: ["evidence/phase-205/proof.json"], artifactHash: "c".repeat(64) });
const intake = createReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intakeId: "phase-205-intake", submitter: { actorId: signer.actorId, role: signer.role }, channel: "isolated_handoff", submittedAt: "2026-08-08T12:01:00.000Z", records: [record] });
const intakeResult = processReleaseEvidenceIntake({ decision, plan, policy: intakePolicy, intake, receivedAt: "2026-08-08T12:02:00.000Z" });
const envelope = createReleaseEvidenceProvenanceEnvelope({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: signer.keyId, signedAt: "2026-08-08T12:03:00.000Z", nonce: "phase-205-once", privateKey: keys.privateKey });
const provenanceResult = verifyReleaseEvidenceProvenance({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, envelope, verifiedAt: "2026-08-08T12:04:00.000Z" });
const admissionResult = admitReleaseEvidenceToMatrix({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, intake, intakeResult, envelope, provenanceResult, admittedAt: "2026-08-08T12:05:00.000Z" });
const context = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy: policy, admissions: [{ intake, intakeResult, envelope, provenanceResult, admissionResult }] };
const result = evaluateAdmittedEvidenceMatrix({ ...context, evaluatedAt: "2026-08-08T12:06:00.000Z" });
if (result.status !== "matrix_evaluated_incomplete" || result.recordsEvaluated !== 1 || result.evidenceCoverageComplete) fail("cobertura parcial divergente");
if (!inspectAdmittedEvidenceMatrixEvaluationResult(result, context).ok) fail("resultado não revalidou");
for (const key of ["gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) if (result[key] !== false) fail(`${key} executado indevidamente`);
const duplicate = evaluateAdmittedEvidenceMatrix({ ...context, admissions: [...context.admissions, ...context.admissions], evaluatedAt: "2026-08-08T12:06:00.000Z" });
if (duplicate.status !== "rejected" || !duplicate.rejectionReasons.includes("duplicate_evidence_id_across_admissions")) fail("replay cruzado não foi bloqueado");

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 205) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-205:assess", "evolution:phase-205:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);
console.log("[phase-205] PASS — matriz parcial avaliada apenas com recibo admitido, replay cruzado bloqueado e nenhum gate, pacote, deploy ou promoção executado.");
