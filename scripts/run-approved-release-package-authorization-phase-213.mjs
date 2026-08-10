import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import {
  inspectApprovedReleaseMemory,
  inspectApprovedReleaseMemoryPolicy,
} from "../lib/release/approved-release-memory-commitment.mjs";
import { inspectApprovedReleasePackageAuthorizationPolicy } from "../lib/release/approved-release-package-authorization.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const completionMemory = readJson("config/release-module-completion-memory.json");
const graph = buildModuleDependencyGraph({ completionMemory, configuration: readJson("config/release-module-dependency-graph.json") });
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const packetContext = {
  decision,
  plan: readJson("config/release-gate-evidence-plan.json"),
  intakePolicy: readJson("config/release-evidence-intake-policy.json"),
  provenancePolicy: readJson("config/release-evidence-provenance-policy.json"),
  admissionPolicy: readJson("config/release-evidence-admission-policy.json"),
  evaluationPolicy: readJson("config/admitted-evidence-matrix-evaluation-policy.json"),
  packetPolicy: readJson("config/release-gate-review-packet-policy.json"),
};
const decisionPolicy = readJson("config/human-release-gate-decision-policy.json");
const authorizationPolicy = readJson("config/release-gate-execution-authorization-policy.json");
const executionPolicy = readJson("config/authorized-release-gate-execution-policy.json");
const adjudicationPolicy = readJson("config/release-gate-result-adjudication-policy.json");
const approvalPolicy = readJson("config/final-release-approval-policy.json");
const memoryPolicy = readJson("config/approved-release-memory-policy.json");
const memory = readJson("config/approved-release-memory.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const approvalContext = { packetContext, decisionPolicy, authorizationPolicy, executionPolicy, adjudicationPolicy };

const memoryPolicyInspection = inspectApprovedReleaseMemoryPolicy(memoryPolicy, { approvalPolicy, ...approvalContext });
if (!memoryPolicyInspection.ok) throw new Error(`approved_release_memory_policy_invalid:${memoryPolicyInspection.reason}`);
const memoryInspection = inspectApprovedReleaseMemory(memory, { policy: memoryPolicy });
if (!memoryInspection.ok) throw new Error(`approved_release_memory_invalid:${memoryInspection.reason}`);
const packagePolicyInspection = inspectApprovedReleasePackageAuthorizationPolicy(packageAuthorizationPolicy, {
  approvalPolicy,
  memoryPolicy,
  ...approvalContext,
});
if (!packagePolicyInspection.ok) throw new Error(`approved_release_package_authorization_policy_invalid:${packagePolicyInspection.reason}`);

console.log(JSON.stringify({
  schema: "atlas.approved-release-package-authorization-readiness.v1",
  phase: 213,
  compositionId: decision.compositionId,
  approvalPolicyHash: approvalPolicy.policyHash,
  memoryPolicyHash: memoryPolicy.policyHash,
  memoryHash: memory.memoryHash,
  packageAuthorizationPolicyHash: packageAuthorizationPolicy.policyHash,
  trustedPackageAuthorizersConfigured: packageAuthorizationPolicy.trustedPackageAuthorizers.length,
  committedApprovals: memory.summary.committedApprovals,
  readiness: "awaiting_committed_approved_release",
  approvedMemoryEntryAvailable: memory.entries.length > 0,
  packageAssemblyAuthorized: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
