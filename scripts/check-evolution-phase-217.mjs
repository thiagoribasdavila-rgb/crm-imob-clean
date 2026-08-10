import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectApprovedReleaseMemory, inspectApprovedReleaseMemoryPolicy } from "../lib/release/approved-release-memory-commitment.mjs";
import { inspectApprovedReleasePackageAuthorizationPolicy } from "../lib/release/approved-release-package-authorization.mjs";
import { inspectAuthorizedReleasePackageAssemblyMemory, inspectAuthorizedReleasePackageAssemblyPolicy } from "../lib/release/authorized-release-package-assembly.mjs";
import { inspectAuthorizedPackageEvidenceCommitmentPolicy, inspectAuthorizedPackageEvidenceMemory } from "../lib/release/authorized-package-evidence-commitment.mjs";
import { inspectAuthorizedPackagePublicationDecisionMemory, inspectAuthorizedPackagePublicationDecisionPolicy } from "../lib/release/authorized-package-publication-decision.mjs";
import { inspectAuthorizedPublicationExecutionAuthorizationMemory, inspectAuthorizedPublicationExecutionAuthorizationPolicy } from "../lib/release/authorized-publication-execution-authorization.mjs";

const fail = (message) => { throw new Error(`[phase-217] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-217-authorized-publication-execution-authorization.json",
  "config/authorized-publication-execution-authorization-policy.json",
  "config/authorized-publication-execution-authorization-memory.json",
  "config/authorized-package-publication-decision-policy.json",
  "config/authorized-package-publication-decision-memory.json",
  "config/authorized-package-evidence-commitment-policy.json",
  "config/authorized-package-evidence-memory.json",
  "config/authorized-release-package-assembly-policy.json",
  "config/authorized-release-package-assembly-memory.json",
  "docs/EVOLUTION_PHASE_217_AUTHORIZED_PUBLICATION_EXECUTION_AUTHORIZATION.md",
  "lib/release/authorized-publication-execution-authorization.mjs",
  "scripts/run-authorized-publication-execution-authorization-phase-217.mjs",
  "tests/contracts/authorized-publication-execution-authorization.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const executionAuthorizationPolicy = readJson(required[1]);
const executionAuthorizationMemory = readJson(required[2]);
const publicationPolicy = readJson(required[3]);
const publicationMemory = readJson(required[4]);
const evidencePolicy = readJson(required[5]);
const evidenceMemory = readJson(required[6]);
const assemblyPolicy = readJson(required[7]);
const assemblyMemory = readJson(required[8]);
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const memoryPolicy = readJson("config/approved-release-memory-policy.json");
const memory = readJson("config/approved-release-memory.json");
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

if (phase.phase !== 217 || phase.status !== "implemented") fail("fase ou status inválido");
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
  inspectAuthorizedPublicationExecutionAuthorizationPolicy(executionAuthorizationPolicy, { publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }),
  inspectAuthorizedPublicationExecutionAuthorizationMemory(executionAuthorizationMemory, { policy: executionAuthorizationPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (
  approvalPolicy.trustedApprovers.length ||
  packageAuthorizationPolicy.trustedPackageAuthorizers.length ||
  evidencePolicy.trustedEvidenceCustodians.length ||
  publicationPolicy.trustedPublicationDirectors.length ||
  executionAuthorizationPolicy.trustedExecutionAuthorizers.length
) fail("identidade real foi inventada");
if (
  memory.entries.length ||
  assemblyMemory.entries.length ||
  evidenceMemory.entries.length ||
  publicationMemory.entries.length ||
  executionAuthorizationMemory.entries.length
) fail("evidência, decisão ou autorização canônica foi inventada");
if (phase.currentState.packageEvidencePolicyHash !== evidencePolicy.policyHash || phase.currentState.packageEvidenceMemoryHash !== evidenceMemory.memoryHash) fail("vínculo de evidência divergente");
if (phase.currentState.publicationDecisionPolicyHash !== publicationPolicy.policyHash || phase.currentState.publicationDecisionMemoryHash !== publicationMemory.memoryHash) fail("vínculo de decisão divergente");
if (phase.currentState.executionAuthorizationPolicyHash !== executionAuthorizationPolicy.policyHash || phase.currentState.executionAuthorizationMemoryHash !== executionAuthorizationMemory.memoryHash) fail("vínculo de autorização divergente");
for (const key of ["trustedExecutionAuthorizersConfigured", "recordedPublicationDecisions", "approvedPublicationDecisions", "executionAuthorizations"]) {
  if (phase.currentState[key] !== 0) fail(`${key} inventado`);
}
for (const key of ["executionAuthorized", "publicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");
for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticPublication", "automaticDeploy", "automaticReleasePromotion"]) {
  if (executionAuthorizationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync(required[10], "utf8");
for (const marker of [
  "publication_execution_authorizer_must_be_independent",
  "approved_publication_decision_required",
  "publication_execution_duplicate_decision_authorization",
  "publication_execution_duplicate_package_authorization",
  "publication_execution_authorization_not_recorded",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 217) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-217:assess", "evolution:phase-217:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-217] PASS — execução exige decisão de publicação aprovada, registro exato e autorizador independente; nenhuma publicação, geração de pacote, build, deploy ou promoção foi executada no estado canônico.");
