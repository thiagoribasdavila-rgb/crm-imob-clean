import { readFileSync } from "node:fs";
import { createModuleDependencyGraphConfiguration, buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectReleaseGateReviewPacketPolicy } from "../lib/release/release-gate-review-packet.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const memory = readJson("config/release-module-completion-memory.json");
const graphConfiguration = readJson("config/release-module-dependency-graph.json");
createModuleDependencyGraphConfiguration(graphConfiguration);
const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: graphConfiguration });
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const plan = readJson("config/release-gate-evidence-plan.json");
const intakePolicy = readJson("config/release-evidence-intake-policy.json");
const provenancePolicy = readJson("config/release-evidence-provenance-policy.json");
const admissionPolicy = readJson("config/release-evidence-admission-policy.json");
const evaluationPolicy = readJson("config/admitted-evidence-matrix-evaluation-policy.json");
const packetPolicy = readJson("config/release-gate-review-packet-policy.json");
const context = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy };
const inspection = inspectReleaseGateReviewPacketPolicy(packetPolicy, context);
if (!inspection.ok) throw new Error(`release_gate_review_packet_policy_invalid:${inspection.reason}`);

console.log(JSON.stringify({
  schema: "atlas.release-gate-review-packet-readiness.v1",
  phase: 206,
  compositionId: decision.compositionId,
  reviewPacketPolicyHash: packetPolicy.policyHash,
  trustedSignersConfigured: provenancePolicy.trustedSigners.length,
  readiness: provenancePolicy.trustedSigners.length > 0
    ? "awaiting_admitted_evidence_evaluation"
    : "awaiting_trusted_signer_configuration",
  evaluationResultAvailable: false,
  reviewPacketPrepared: false,
  readyForHumanReview: false,
  approvalRecorded: false,
  gatesExecuted: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
