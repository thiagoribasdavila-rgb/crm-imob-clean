import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectApprovedReleaseMemory, inspectApprovedReleaseMemoryPolicy } from "../lib/release/approved-release-memory-commitment.mjs";
import { inspectApprovedReleasePackageAuthorizationPolicy } from "../lib/release/approved-release-package-authorization.mjs";
import { inspectAuthorizedReleasePackageAssemblyMemory, inspectAuthorizedReleasePackageAssemblyPolicy } from "../lib/release/authorized-release-package-assembly.mjs";
import { inspectAuthorizedPackageEvidenceCommitmentPolicy, inspectAuthorizedPackageEvidenceMemory } from "../lib/release/authorized-package-evidence-commitment.mjs";
import { inspectAuthorizedPackagePublicationDecisionMemory, inspectAuthorizedPackagePublicationDecisionPolicy } from "../lib/release/authorized-package-publication-decision.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const graph = buildModuleDependencyGraph({
  completionMemory: readJson("config/release-module-completion-memory.json"),
  configuration: readJson("config/release-module-dependency-graph.json"),
});
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
const approvalContext = {
  packetContext,
  decisionPolicy: readJson("config/human-release-gate-decision-policy.json"),
  authorizationPolicy: readJson("config/release-gate-execution-authorization-policy.json"),
  executionPolicy: readJson("config/authorized-release-gate-execution-policy.json"),
  adjudicationPolicy: readJson("config/release-gate-result-adjudication-policy.json"),
};
const approvalPolicy = readJson("config/final-release-approval-policy.json");
const memoryPolicy = readJson("config/approved-release-memory-policy.json");
const memory = readJson("config/approved-release-memory.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const assemblyMemory = readJson("config/authorized-release-package-assembly-memory.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const evidenceMemory = readJson("config/authorized-package-evidence-memory.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const publicationMemory = readJson("config/authorized-package-publication-decision-memory.json");

const inspections = [
  inspectApprovedReleaseMemoryPolicy(memoryPolicy, { approvalPolicy, ...approvalContext }),
  inspectApprovedReleaseMemory(memory, { policy: memoryPolicy }),
  inspectApprovedReleasePackageAuthorizationPolicy(packageAuthorizationPolicy, { approvalPolicy, memoryPolicy, ...approvalContext }),
  inspectAuthorizedReleasePackageAssemblyPolicy(assemblyPolicy, { packageAuthorizationPolicy, approvalPolicy, memoryPolicy, ...approvalContext }),
  inspectAuthorizedReleasePackageAssemblyMemory(assemblyMemory, { policy: assemblyPolicy }),
  inspectAuthorizedPackageEvidenceCommitmentPolicy(evidencePolicy, { assemblyPolicy, packageAuthorizationPolicy }),
  inspectAuthorizedPackageEvidenceMemory(evidenceMemory, { policy: evidencePolicy }),
  inspectAuthorizedPackagePublicationDecisionPolicy(publicationPolicy, { evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }),
  inspectAuthorizedPackagePublicationDecisionMemory(publicationMemory, { policy: publicationPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) throw new Error(`authorized_package_publication_decision_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.authorized-package-publication-decision-readiness.v1",
  phase: 216,
  compositionId: decision.compositionId,
  packageEvidencePolicyHash: evidencePolicy.policyHash,
  packageEvidenceMemoryHash: evidenceMemory.memoryHash,
  publicationDecisionPolicyHash: publicationPolicy.policyHash,
  publicationDecisionMemoryHash: publicationMemory.memoryHash,
  trustedPublicationDirectorsConfigured: publicationPolicy.trustedPublicationDirectors.length,
  committedPackageEvidence: evidenceMemory.summary.committedPackages,
  recordedPublicationDecisions: publicationMemory.summary.recordedDecisions,
  authorizedPackages: publicationMemory.summary.authorizedPackages,
  readiness: "awaiting_committed_package_evidence_and_independent_publication_director",
  publicationAuthorized: false,
  publicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
