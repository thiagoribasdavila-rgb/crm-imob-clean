import { readFileSync } from "node:fs";
import {
  inspectPublicationExecutionEvidenceAdjudicationMemory,
  inspectPublicationExecutionEvidenceAdjudicationPolicy,
} from "../lib/release/publication-execution-evidence-adjudication.mjs";
import { inspectAuthorizedPublicationExecutionMemory } from "../lib/release/authorized-publication-execution.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const executionPolicy = readJson("config/authorized-publication-execution-policy.json");
const executionMemory = readJson("config/authorized-publication-execution-memory.json");
const executionAuthorizationPolicy = readJson("config/authorized-publication-execution-authorization-policy.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const publicationEvidenceAdjudicationPolicy = readJson("config/publication-execution-evidence-adjudication-policy.json");
const publicationEvidenceAdjudicationMemory = readJson("config/publication-execution-evidence-adjudication-memory.json");

const context = {
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
};
const inspections = [
  inspectAuthorizedPublicationExecutionMemory(executionMemory, { policy: executionPolicy }),
  inspectPublicationExecutionEvidenceAdjudicationPolicy(publicationEvidenceAdjudicationPolicy, context),
  inspectPublicationExecutionEvidenceAdjudicationMemory(publicationEvidenceAdjudicationMemory, { policy: publicationEvidenceAdjudicationPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) throw new Error(`publication_execution_evidence_adjudication_context_invalid:${failed.reason}`);

console.log(JSON.stringify({
  schema: "atlas.publication-execution-evidence-adjudication-readiness.v1",
  phase: 219,
  compositionId: executionPolicy.compositionId,
  executionPolicyHash: executionPolicy.policyHash,
  executionMemoryHash: executionMemory.memoryHash,
  evidenceAdjudicationPolicyHash: publicationEvidenceAdjudicationPolicy.policyHash,
  evidenceAdjudicationMemoryHash: publicationEvidenceAdjudicationMemory.memoryHash,
  trustedEvidenceAdjudicatorsConfigured: publicationEvidenceAdjudicationPolicy.trustedAdjudicators.length,
  recordedExecutions: executionMemory.summary.recordedExecutions,
  successfulLocalProofs: executionMemory.summary.successfulLocalProofs,
  failedLocalProofs: executionMemory.summary.failedLocalProofs,
  recordedAdjudications: publicationEvidenceAdjudicationMemory.summary.recordedDecisions,
  acceptedEvidence: publicationEvidenceAdjudicationMemory.summary.acceptedEvidence,
  rejectedEvidence: publicationEvidenceAdjudicationMemory.summary.rejectedEvidence,
  readiness: "awaiting_recorded_local_execution_proof_and_independent_evidence_adjudicator",
  publicationProofAdjudicated: false,
  evidenceAccepted: false,
  externalPublicationAuthorized: false,
  publicationExecuted: false,
  externalPublicationExecuted: false,
  packageGenerated: false,
  buildExecuted: false,
  deployExecuted: false,
  releasePromoted: false,
}, null, 2));
