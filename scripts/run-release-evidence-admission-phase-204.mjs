import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectReleaseEvidenceAdmissionPolicy } from "../lib/release/release-evidence-admission.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const graph = buildModuleDependencyGraph({ completionMemory: readJson("config/release-module-completion-memory.json"), configuration: readJson("config/release-module-dependency-graph.json") });
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const plan = readJson("config/release-gate-evidence-plan.json");
const intakePolicy = readJson("config/release-evidence-intake-policy.json");
const provenancePolicy = readJson("config/release-evidence-provenance-policy.json");
const admissionPolicy = readJson("config/release-evidence-admission-policy.json");
const inspection = inspectReleaseEvidenceAdmissionPolicy(admissionPolicy, { decision, plan, intakePolicy, provenancePolicy });
if (!inspection.ok) throw new Error(`release_evidence_admission_policy_invalid:${inspection.reason}`);

console.log(JSON.stringify({
  schema: "atlas.release-evidence-admission-readiness.v1",
  phase: 204,
  compositionId: decision.compositionId,
  admissionPolicyHash: admissionPolicy.policyHash,
  trustedSignersConfigured: provenancePolicy.trustedSigners.length,
  readiness: provenancePolicy.trustedSigners.length > 0 ? "awaiting_verified_provenance" : "awaiting_trusted_signer_configuration",
  admissionsReceived: 0,
  admissionsAccepted: 0,
  recordsAdmitted: 0,
  eligibleForEvidenceMatrix: false,
  evidenceMatrixEvaluated: false,
  gatesExecuted: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false
}, null, 2));
