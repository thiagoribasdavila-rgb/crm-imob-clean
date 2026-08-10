import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import {
  inspectApprovedReleaseMemory,
  inspectApprovedReleaseMemoryPolicy,
} from "../lib/release/approved-release-memory-commitment.mjs";
import { inspectApprovedReleasePackageAuthorizationPolicy } from "../lib/release/approved-release-package-authorization.mjs";
import {
  inspectAuthorizedReleasePackageAssemblyMemory,
  inspectAuthorizedReleasePackageAssemblyPolicy,
} from "../lib/release/authorized-release-package-assembly.mjs";

const fail = (message) => { throw new Error(`[phase-214] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-214-authorized-release-package-assembly.json",
  "config/authorized-release-package-assembly-policy.json",
  "config/authorized-release-package-assembly-memory.json",
  "config/approved-release-package-authorization-policy.json",
  "config/approved-release-memory-policy.json",
  "config/approved-release-memory.json",
  "docs/EVOLUTION_PHASE_214_AUTHORIZED_RELEASE_PACKAGE_ASSEMBLY.md",
  "lib/release/authorized-release-package-assembly.mjs",
  "scripts/run-authorized-release-package-assembly-phase-214.mjs",
  "tests/contracts/authorized-release-package-assembly.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const assemblyPolicy = readJson(required[1]);
const assemblyMemory = readJson(required[2]);
const packageAuthorizationPolicy = readJson(required[3]);
const memoryPolicy = readJson(required[4]);
const memory = readJson(required[5]);
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
const approvalContext = {
  packetContext,
  decisionPolicy: readJson("config/human-release-gate-decision-policy.json"),
  authorizationPolicy: readJson("config/release-gate-execution-authorization-policy.json"),
  executionPolicy: readJson("config/authorized-release-gate-execution-policy.json"),
  adjudicationPolicy: readJson("config/release-gate-result-adjudication-policy.json"),
};
const approvalPolicy = readJson("config/final-release-approval-policy.json");

if (phase.phase !== 214 || phase.status !== "implemented") fail("fase ou status inválido");
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
const assemblyPolicyInspection = inspectAuthorizedReleasePackageAssemblyPolicy(assemblyPolicy, {
  packageAuthorizationPolicy,
  approvalPolicy,
  memoryPolicy,
  ...approvalContext,
});
if (!assemblyPolicyInspection.ok) fail(`política de montagem canônica inválida: ${assemblyPolicyInspection.reason}`);
const assemblyMemoryInspection = inspectAuthorizedReleasePackageAssemblyMemory(assemblyMemory, { policy: assemblyPolicy });
if (!assemblyMemoryInspection.ok) fail(`memória de montagem canônica inválida: ${assemblyMemoryInspection.reason}`);
if (memory.entries.length !== 0 || memory.summary.committedApprovals !== 0) fail("aprovação final foi inventada na memória");
if (packageAuthorizationPolicy.trustedPackageAuthorizers.length !== 0) fail("autorizador de pacote foi inventado");
if (assemblyMemory.entries.length !== 0 || assemblyMemory.summary.assembledPackages !== 0 || assemblyMemory.summary.consumedAuthorizations !== 0) fail("montagem canônica foi inventada");
if (phase.currentState.approvalPolicyHash !== approvalPolicy.policyHash) fail("hash da política final divergente");
if (phase.currentState.memoryPolicyHash !== memoryPolicy.policyHash) fail("hash da política de memória divergente");
if (phase.currentState.memoryHash !== memory.memoryHash) fail("hash da memória divergente");
if (phase.currentState.packageAuthorizationPolicyHash !== packageAuthorizationPolicy.policyHash) fail("hash da política de autorização divergente");
if (phase.currentState.packageAssemblyPolicyHash !== assemblyPolicy.policyHash) fail("hash da política de montagem divergente");
if (phase.currentState.packageAssemblyMemoryHash !== assemblyMemory.memoryHash) fail("hash da memória de montagem divergente");
if (phase.currentState.committedApprovals !== 0 || phase.currentState.trustedPackageAuthorizersConfigured !== 0) fail("estado canônico inventado");
for (const key of ["authorizationAvailable", "authorizationConsumed", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");
for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion"]) {
  if (assemblyPolicy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync("lib/release/authorized-release-package-assembly.mjs", "utf8");
for (const marker of [
  "package_authorization_already_consumed",
  "package_assembler_must_match_authorizer",
  "package_inventory_sensitive_env",
  "package_zip_signature_invalid",
  "package_assembly_receipt_not_committed",
]) {
  if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 214) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-214:assess", "evolution:phase-214:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-214] PASS — ZIP e inventário são provados sob autorização válida de uso único; sem aprovação real, nenhum pacote, build, deploy ou promoção foi executado.");
