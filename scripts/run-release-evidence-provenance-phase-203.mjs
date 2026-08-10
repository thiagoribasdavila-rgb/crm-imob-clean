import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectReleaseEvidenceProvenancePolicy } from "../lib/release/release-evidence-provenance.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const graph = buildModuleDependencyGraph({ completionMemory: readJson("config/release-module-completion-memory.json"), configuration: readJson("config/release-module-dependency-graph.json") });
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const plan = readJson("config/release-gate-evidence-plan.json");
const intakePolicy = readJson("config/release-evidence-intake-policy.json");
const provenancePolicy = readJson("config/release-evidence-provenance-policy.json");
const inspection = inspectReleaseEvidenceProvenancePolicy(provenancePolicy, { decision, plan, intakePolicy });
if (!inspection.ok) throw new Error(`release_evidence_provenance_policy_invalid:${inspection.reason}`);

console.log(JSON.stringify({
  schema: "atlas.release-evidence-provenance-readiness.v1",
  phase: 203,
  compositionId: decision.compositionId,
  policyHash: provenancePolicy.policyHash,
  signatureAlgorithm: provenancePolicy.signatureAlgorithm,
  trustedSignersConfigured: provenancePolicy.trustedSigners.length,
  readiness: provenancePolicy.trustedSigners.length > 0 ? "ready_for_signed_intake" : "awaiting_trusted_signer_configuration",
  provenanceEnvelopesReceived: 0,
  provenanceVerified: false,
  eligibleForEvidenceMatrix: false,
  evidenceMatrixEvaluated: false,
  gatesExecuted: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false,
}, null, 2));
