import { readFileSync } from "node:fs";
import { createModuleDependencyGraphConfiguration, buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectHumanReleaseGateDecisionPolicy } from "../lib/release/human-release-gate-decisions.mjs";

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
const decisionPolicy = readJson("config/human-release-gate-decision-policy.json");
const context = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, packetPolicy };
const inspection = inspectHumanReleaseGateDecisionPolicy(decisionPolicy, context);
if (!inspection.ok) throw new Error(`human_release_gate_decision_policy_invalid:${inspection.reason}`);

console.log(JSON.stringify({
  schema: "atlas.human-release-gate-decision-readiness.v1",
  phase: 207,
  compositionId: decision.compositionId,
  humanDecisionPolicyHash: decisionPolicy.policyHash,
  trustedSignersConfigured: provenancePolicy.trustedSigners.length,
  readiness: provenancePolicy.trustedSigners.length > 0
    ? "awaiting_ready_review_packet"
    : "awaiting_trusted_signer_configuration",
  reviewPacketAvailable: false,
  humanDecisionsRecorded: false,
  explicitReviewComplete: false,
  unanimousExplicitApproval: false,
  releaseApproved: false,
  gatesExecuted: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
