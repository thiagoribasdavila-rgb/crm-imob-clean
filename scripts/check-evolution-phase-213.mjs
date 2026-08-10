import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import {
  inspectApprovedReleaseMemory,
  inspectApprovedReleaseMemoryPolicy,
} from "../lib/release/approved-release-memory-commitment.mjs";
import { inspectApprovedReleasePackageAuthorizationPolicy } from "../lib/release/approved-release-package-authorization.mjs";

const fail = (message) => { throw new Error(`[phase-213] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-213-approved-release-package-authorization.json",
  "config/approved-release-package-authorization-policy.json",
  "config/approved-release-memory-policy.json",
  "config/approved-release-memory.json",
  "docs/EVOLUTION_PHASE_213_APPROVED_RELEASE_PACKAGE_AUTHORIZATION.md",
  "lib/release/approved-release-package-authorization.mjs",
  "scripts/run-approved-release-package-authorization-phase-213.mjs",
  "tests/contracts/approved-release-package-authorization.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const packageAuthorizationPolicy = readJson(required[1]);
const memoryPolicy = readJson(required[2]);
const memory = readJson(required[3]);
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
const approvalContext = { packetContext, decisionPolicy, authorizationPolicy, executionPolicy, adjudicationPolicy };

if (phase.phase !== 213 || phase.status !== "implemented") fail("fase ou status inválido");
if (approvalPolicy.trustedApprovers.length !== 0) fail("aprovador final real foi inventado");
const memoryPolicyInspection = inspectApprovedReleaseMemoryPolicy(memoryPolicy, { approvalPolicy, ...approvalContext });
if (!memoryPolicyInspection.ok) fail(`política de memória canônica inválida: ${memoryPolicyInspection.reason}`);
const memoryInspection = inspectApprovedReleaseMemory(memory, { policy: memoryPolicy });
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
const packagePolicyInspection = inspectApprovedReleasePackageAuthorizationPolicy(packageAuthorizationPolicy, {
  approvalPolicy,
  memoryPolicy,
  ...approvalContext,
});
if (!packagePolicyInspection.ok) fail(`política de autorização canônica inválida: ${packagePolicyInspection.reason}`);
if (memory.entries.length !== 0 || memory.summary.committedApprovals !== 0) fail("aprovação final foi inventada na memória");
if (packageAuthorizationPolicy.trustedPackageAuthorizers.length !== 0) fail("autorizador de pacote foi inventado");
if (phase.currentState.approvalPolicyHash !== approvalPolicy.policyHash) fail("hash da política final divergente");
if (phase.currentState.memoryPolicyHash !== memoryPolicy.policyHash) fail("hash da política de memória divergente");
if (phase.currentState.memoryHash !== memory.memoryHash) fail("hash da memória divergente");
if (phase.currentState.packageAuthorizationPolicyHash !== packageAuthorizationPolicy.policyHash) fail("hash da política de autorização divergente");
if (phase.currentState.committedApprovals !== 0 || phase.currentState.trustedPackageAuthorizersConfigured !== 0) fail("estado canônico inventado");
for (const key of ["approvedMemoryEntryAvailable", "packageAssemblyAuthorized", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");
for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion"]) {
  if (packageAuthorizationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync("lib/release/approved-release-package-authorization.mjs", "utf8");
for (const marker of [
  "approved_release_memory_entry_not_found",
  "package_authorizer_must_match_committed_approver",
  "package_authorization_signature_verification_failed",
  "package_authorization_expired",
  "package_name_invalid",
]) {
  if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 213) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-213:assess", "evolution:phase-213:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-213] PASS — a montagem exige autorização Ed25519 vinculada à entrada aprovada exata e ao mesmo diretor; sem aprovação real, pacote, build, deploy e promoção continuam bloqueados.");
