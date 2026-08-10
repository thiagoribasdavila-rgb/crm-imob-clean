import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectReleaseGateExecutionAuthorizationPolicy } from "../lib/release/release-gate-execution-authorization.mjs";

const fail = (message) => { throw new Error(`[phase-208] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-208-release-gate-execution-authorization.json",
  "config/release-gate-execution-authorization-policy.json",
  "docs/EVOLUTION_PHASE_208_RELEASE_GATE_EXECUTION_AUTHORIZATION.md",
  "lib/release/release-gate-execution-authorization.mjs",
  "scripts/run-release-gate-execution-authorization-phase-208.mjs",
  "tests/contracts/release-gate-execution-authorization.test.mjs",
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
const authorizationPolicy = readJson(required[1]);

if (phase.phase !== 208 || phase.status !== "implemented") fail("fase ou status inválido");
if (authorizationPolicy.trustedAuthorizers.length !== 0) fail("autoridade de execução real foi inventada");
const inspection = inspectReleaseGateExecutionAuthorizationPolicy(authorizationPolicy, { packetContext, decisionPolicy });
if (!inspection.ok) fail(`política canônica inválida: ${inspection.reason}`);
if (phase.currentState.authorizationPolicyHash !== authorizationPolicy.policyHash) fail("hash da política divergente");
if (phase.authorizationRules.maximumAuthorizationDelaySeconds !== authorizationPolicy.maxAuthorizationDelaySeconds) fail("janela de autorização divergente");
if (phase.authorizationRules.maximumAuthorizationValiditySeconds !== authorizationPolicy.maxAuthorizationValiditySeconds) fail("validade da autorização divergente");
if (phase.authorizationRules.authorizerRole !== authorizationPolicy.authorizerRole) fail("papel da autoridade divergente");
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");
for (const key of ["humanDecisionRegisterAvailable", "executionAuthorizationIssued", "gatesExecuted", "releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
for (const key of ["automaticGateExecution", "automaticReleaseApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) {
  if (authorizationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync("lib/release/release-gate-execution-authorization.mjs", "utf8");
for (const marker of ["human_review_not_complete_approved", "execution_authorizer_untrusted", "authorization_window_expired", "authorization_validity_too_long", "private_key_does_not_match_execution_authorizer", "execution_authorization_expired"]) {
  if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 208) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-208:assess", "evolution:phase-208:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-208] PASS — somente um release-controller independente pode autorizar, por tempo curto e uso único, o conjunto exato de gates aprovado; nenhum gate, pacote, deploy ou promoção foi executado.");
