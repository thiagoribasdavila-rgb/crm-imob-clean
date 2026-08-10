import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectApprovedReleaseMemory, inspectApprovedReleaseMemoryPolicy } from "../lib/release/approved-release-memory-commitment.mjs";
import { inspectApprovedReleasePackageAuthorizationPolicy } from "../lib/release/approved-release-package-authorization.mjs";
import { inspectAuthorizedReleasePackageAssemblyMemory, inspectAuthorizedReleasePackageAssemblyPolicy } from "../lib/release/authorized-release-package-assembly.mjs";
import { inspectAuthorizedPackageEvidenceCommitmentPolicy, inspectAuthorizedPackageEvidenceMemory } from "../lib/release/authorized-package-evidence-commitment.mjs";
import { inspectAuthorizedPackagePublicationDecisionMemory, inspectAuthorizedPackagePublicationDecisionPolicy } from "../lib/release/authorized-package-publication-decision.mjs";
import { inspectAuthorizedPublicationExecutionAuthorizationMemory, inspectAuthorizedPublicationExecutionAuthorizationPolicy } from "../lib/release/authorized-publication-execution-authorization.mjs";
import { inspectAuthorizedPublicationExecutionMemory, inspectAuthorizedPublicationExecutionPolicy } from "../lib/release/authorized-publication-execution.mjs";

const fail = (message) => { throw new Error(`[phase-218] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-218-authorized-publication-execution.json",
  executionPolicy: "config/authorized-publication-execution-policy.json",
  executionMemory: "config/authorized-publication-execution-memory.json",
  authorizationPolicy: "config/authorized-publication-execution-authorization-policy.json",
  authorizationMemory: "config/authorized-publication-execution-authorization-memory.json",
  publicationPolicy: "config/authorized-package-publication-decision-policy.json",
  publicationMemory: "config/authorized-package-publication-decision-memory.json",
  evidencePolicy: "config/authorized-package-evidence-commitment-policy.json",
  evidenceMemory: "config/authorized-package-evidence-memory.json",
  assemblyPolicy: "config/authorized-release-package-assembly-policy.json",
  assemblyMemory: "config/authorized-release-package-assembly-memory.json",
  documentation: "docs/EVOLUTION_PHASE_218_AUTHORIZED_PUBLICATION_EXECUTION.md",
  library: "lib/release/authorized-publication-execution.mjs",
  runner: "scripts/run-authorized-publication-execution-phase-218.mjs",
  test: "tests/contracts/authorized-publication-execution.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const executionPolicy = readJson(paths.executionPolicy);
const executionMemory = readJson(paths.executionMemory);
const executionAuthorizationPolicy = readJson(paths.authorizationPolicy);
const executionAuthorizationMemory = readJson(paths.authorizationMemory);
const publicationPolicy = readJson(paths.publicationPolicy);
const publicationMemory = readJson(paths.publicationMemory);
const evidencePolicy = readJson(paths.evidencePolicy);
const evidenceMemory = readJson(paths.evidenceMemory);
const assemblyPolicy = readJson(paths.assemblyPolicy);
const assemblyMemory = readJson(paths.assemblyMemory);
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

if (phase.phase !== 218 || phase.status !== "implemented") fail("fase ou status inválido");
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
  inspectAuthorizedPublicationExecutionPolicy(executionPolicy, { executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy }),
  inspectAuthorizedPublicationExecutionMemory(executionMemory, { policy: executionPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (
  approvalPolicy.trustedApprovers.length ||
  packageAuthorizationPolicy.trustedPackageAuthorizers.length ||
  evidencePolicy.trustedEvidenceCustodians.length ||
  publicationPolicy.trustedPublicationDirectors.length ||
  executionAuthorizationPolicy.trustedExecutionAuthorizers.length ||
  executionPolicy.trustedExecutors.length ||
  executionPolicy.trustedPublicationHandlers.length
) fail("identidade ou handler real foi inventado");
if (
  memory.entries.length ||
  assemblyMemory.entries.length ||
  evidenceMemory.entries.length ||
  publicationMemory.entries.length ||
  executionAuthorizationMemory.entries.length ||
  executionMemory.entries.length
) fail("evidência, decisão, autorização ou execução canônica foi inventada");

const hashBindings = {
  packageAuthorizationPolicyHash: packageAuthorizationPolicy.policyHash,
  packageAssemblyPolicyHash: assemblyPolicy.policyHash,
  packageAssemblyMemoryHash: assemblyMemory.memoryHash,
  packageEvidencePolicyHash: evidencePolicy.policyHash,
  packageEvidenceMemoryHash: evidenceMemory.memoryHash,
  publicationDecisionPolicyHash: publicationPolicy.policyHash,
  publicationDecisionMemoryHash: publicationMemory.memoryHash,
  executionAuthorizationPolicyHash: executionAuthorizationPolicy.policyHash,
  executionAuthorizationMemoryHash: executionAuthorizationMemory.memoryHash,
  executionPolicyHash: executionPolicy.policyHash,
  executionMemoryHash: executionMemory.memoryHash,
};
for (const [key, value] of Object.entries(hashBindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedExecutionAuthorizersConfigured",
  "trustedPublicationExecutorsConfigured",
  "trustedPublicationHandlersConfigured",
  "recordedPublicationDecisions",
  "approvedPublicationDecisions",
  "executionAuthorizations",
  "recordedExecutions",
  "successfulLocalProofs",
  "failedLocalProofs",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "executionAuthorized",
  "publicationProofExecuted",
  "publicationExecuted",
  "externalPublicationExecuted",
  "packageGenerated",
  "buildExecuted",
  "deployExecuted",
  "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");
for (const key of [
  "networkAccessAllowed",
  "databaseMutationAllowed",
  "arbitraryCommandExecutionAllowed",
  "externalPublicationAllowed",
  "automaticPackageGeneration",
  "automaticBuild",
  "automaticDeploy",
  "automaticReleasePromotion",
]) if (executionPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "publication_executor_must_be_independent",
  "publication_handler_untrusted",
  "publication_execution_authorization_already_consumed",
  "publication_execution_authorization_claim_failed",
  "publication_execution_receipt_not_recorded",
  "externalPublicationAllowed: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 218) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-218:assess", "evolution:phase-218:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-218] PASS — prova local exige autorização registrada, executor independente, handler confiável, consumo atômico e recibo assinado; nenhuma publicação externa, geração de pacote, build, deploy ou promoção foi executada no estado canônico.");
