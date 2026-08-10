import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectAuthorizedReleaseGateExecutionPolicy } from "../lib/release/authorized-release-gate-execution.mjs";

const fail = (message) => { throw new Error(`[phase-209] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-209-authorized-release-gate-execution.json",
  "config/authorized-release-gate-execution-policy.json",
  "docs/EVOLUTION_PHASE_209_AUTHORIZED_RELEASE_GATE_EXECUTION.md",
  "lib/release/authorized-release-gate-execution.mjs",
  "scripts/run-authorized-release-gate-execution-phase-209.mjs",
  "tests/contracts/authorized-release-gate-execution.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const memory = readJson("config/release-module-completion-memory.json");
const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: readJson("config/release-module-dependency-graph.json") });
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
const executionPolicy = readJson(required[1]);

if (phase.phase !== 209 || phase.status !== "implemented") fail("fase ou status inválido");
if (executionPolicy.trustedExecutors.length !== 0) fail("executor real foi inventado");
if (executionPolicy.trustedGateHandlers.length !== 0) fail("handler real foi inventado");
const inspection = inspectAuthorizedReleaseGateExecutionPolicy(executionPolicy, { packetContext, decisionPolicy, authorizationPolicy });
if (!inspection.ok) fail(`política canônica inválida: ${inspection.reason}`);
if (phase.currentState.executionPolicyHash !== executionPolicy.policyHash) fail("hash da política divergente");
if (phase.executionRules.maximumGateDurationSeconds !== executionPolicy.maxGateDurationSeconds) fail("limite de duração divergente");
if (phase.executionRules.executorRole !== executionPolicy.executorRole) fail("papel do executor divergente");
if (phase.executionRules.isolationMode !== executionPolicy.isolationMode) fail("modo de isolamento divergente");
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");
for (const key of ["humanDecisionRegisterAvailable", "executionAuthorizationAvailable", "authorizationConsumed", "executionRegisterAvailable", "gatesExecuted", "releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
for (const key of ["networkAccessAllowed", "databaseMutationAllowed", "arbitraryCommandExecutionAllowed", "automaticReleaseApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) {
  if (executionPolicy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync("lib/release/authorized-release-gate-execution.mjs", "utf8");
for (const marker of ["atomic_authorization_consumption_store_required", "execution_authorization_already_consumed", "gate_execution_catalog_target_set_mismatch", "gate_execution_handler_identity_mismatch", "gate_execution_duration_exceeded", "gate_receipt_signature_invalid", "gate_execution_register_hash_mismatch"]) {
  if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 209) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-209:assess", "evolution:phase-209:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-209] PASS — autorização é consumida atomicamente uma vez; somente handlers confiáveis executam o conjunto exato em isolamento e produzem recibos assinados, sem aprovação, pacote, deploy ou promoção.");
