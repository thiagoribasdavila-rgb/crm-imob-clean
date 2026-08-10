import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectApprovedReleaseMemory, inspectApprovedReleaseMemoryPolicy } from "../lib/release/approved-release-memory-commitment.mjs";
import { inspectApprovedReleasePackageAuthorizationPolicy } from "../lib/release/approved-release-package-authorization.mjs";
import { inspectAuthorizedReleasePackageAssemblyMemory, inspectAuthorizedReleasePackageAssemblyPolicy } from "../lib/release/authorized-release-package-assembly.mjs";
import { inspectAuthorizedPackageEvidenceCommitmentPolicy, inspectAuthorizedPackageEvidenceMemory } from "../lib/release/authorized-package-evidence-commitment.mjs";
import { inspectAuthorizedPackagePublicationDecisionMemory, inspectAuthorizedPackagePublicationDecisionPolicy } from "../lib/release/authorized-package-publication-decision.mjs";

const fail = (message) => { throw new Error(`[phase-216] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-216-authorized-package-publication-decision.json",
  "config/authorized-package-publication-decision-policy.json",
  "config/authorized-package-publication-decision-memory.json",
  "config/authorized-package-evidence-commitment-policy.json",
  "config/authorized-package-evidence-memory.json",
  "config/authorized-release-package-assembly-policy.json",
  "config/authorized-release-package-assembly-memory.json",
  "docs/EVOLUTION_PHASE_216_AUTHORIZED_PACKAGE_PUBLICATION_DECISION.md",
  "lib/release/authorized-package-publication-decision.mjs",
  "scripts/run-authorized-package-publication-decision-phase-216.mjs",
  "tests/contracts/authorized-package-publication-decision.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const publicationPolicy = readJson(required[1]);
const publicationMemory = readJson(required[2]);
const evidencePolicy = readJson(required[3]);
const evidenceMemory = readJson(required[4]);
const assemblyPolicy = readJson(required[5]);
const assemblyMemory = readJson(required[6]);
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

if (phase.phase !== 216 || phase.status !== "implemented") fail("fase ou status inválido");
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
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (
  approvalPolicy.trustedApprovers.length ||
  packageAuthorizationPolicy.trustedPackageAuthorizers.length ||
  evidencePolicy.trustedEvidenceCustodians.length ||
  publicationPolicy.trustedPublicationDirectors.length
) fail("identidade real foi inventada");
if (memory.entries.length || assemblyMemory.entries.length || evidenceMemory.entries.length || publicationMemory.entries.length) {
  fail("evidência ou decisão canônica foi inventada");
}
if (phase.currentState.packageEvidencePolicyHash !== evidencePolicy.policyHash || phase.currentState.packageEvidenceMemoryHash !== evidenceMemory.memoryHash) fail("vínculo de evidência divergente");
if (phase.currentState.publicationDecisionPolicyHash !== publicationPolicy.policyHash || phase.currentState.publicationDecisionMemoryHash !== publicationMemory.memoryHash) fail("vínculo de decisão divergente");
for (const key of ["trustedPublicationDirectorsConfigured", "committedPackageEvidence", "recordedPublicationDecisions", "authorizedPackages"]) {
  if (phase.currentState[key] !== 0) fail(`${key} inventado`);
}
for (const key of ["publicationAuthorized", "publicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");
for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticPublication", "automaticDeploy", "automaticReleasePromotion"]) {
  if (publicationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync(required[8], "utf8");
for (const marker of [
  "package_publication_director_must_be_independent",
  "package_publication_duplicate_evidence_decision",
  "package_publication_duplicate_package_decision",
  "package_publication_decision_not_recorded",
  "package_publication_evidence_invalid",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 216) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-216:assess", "evolution:phase-216:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-216] PASS — decisão assinada exige evidência exata e diretor independente; nenhuma publicação, geração de pacote, build, deploy ou promoção foi executada no estado canônico.");
