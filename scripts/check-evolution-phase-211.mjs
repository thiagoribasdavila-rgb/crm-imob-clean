import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectFinalReleaseApprovalPolicy } from "../lib/release/final-release-approval-decision.mjs";

const fail = (message) => { throw new Error(`[phase-211] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-211-final-release-approval-decision.json",
  "config/final-release-approval-policy.json",
  "docs/EVOLUTION_PHASE_211_FINAL_RELEASE_APPROVAL_DECISION.md",
  "lib/release/final-release-approval-decision.mjs",
  "scripts/run-final-release-approval-decision-phase-211.mjs",
  "tests/contracts/final-release-approval-decision.test.mjs",
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
const executionPolicy = readJson("config/authorized-release-gate-execution-policy.json");
const adjudicationPolicy = readJson("config/release-gate-result-adjudication-policy.json");
const approvalPolicy = readJson(required[1]);

if (phase.phase !== 211 || phase.status !== "implemented") fail("fase ou status inválido");
if (approvalPolicy.trustedApprovers.length !== 0) fail("aprovador final real foi inventado");
const inspection = inspectFinalReleaseApprovalPolicy(approvalPolicy, { packetContext, decisionPolicy, authorizationPolicy, executionPolicy, adjudicationPolicy });
if (!inspection.ok) fail(`política canônica inválida: ${inspection.reason}`);
if (phase.currentState.approvalPolicyHash !== approvalPolicy.policyHash) fail("hash da política divergente");
if (phase.approvalRules.approverRole !== approvalPolicy.approverRole) fail("papel do aprovador divergente");
if (phase.approvalRules.signatureAlgorithm !== approvalPolicy.signatureAlgorithm) fail("algoritmo de assinatura divergente");
if (phase.approvalRules.maximumDecisionDelaySeconds !== approvalPolicy.maxDecisionDelaySeconds) fail("janela de decisão divergente");
if (phase.approvalRules.minimumReasonLength !== approvalPolicy.minReasonLength) fail("razão mínima divergente");
if (phase.approvalRules.acceptedGateResultsRequiredForApproval !== approvalPolicy.acceptedGateResultsRequiredForApproval) fail("regra de aceite dos gates divergente");
if (phase.approvalRules.independentFinalApproverRequired !== approvalPolicy.independentFinalApproverRequired) fail("separação do aprovador divergente");
if (phase.approvalRules.exactAdjudicationRegisterBindingRequired !== approvalPolicy.exactAdjudicationRegisterBindingRequired) fail("vínculo da adjudicação divergente");
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");
for (const key of ["verifiedAdjudicationRegisterAvailable", "finalDecisionAvailable", "releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
if (phase.currentState.finalDecisionOutcome !== null) fail("resultado final foi inventado");
for (const key of ["automaticReleaseApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) {
  if (approvalPolicy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync("lib/release/final-release-approval-decision.mjs", "utf8");
for (const marker of ["release_execution_and_final_approval_authority_must_be_separate", "prior_release_actor_cannot_approve_final_release", "unaccepted_gate_results_cannot_approve_release", "final_release_approval_adjudication_register_mismatch", "final_release_approval_signature_invalid", "final_release_approval_decision_hash_mismatch"]) {
  if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 211) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-211:assess", "evolution:phase-211:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-211] PASS — somente uma adjudicação integralmente aceita permite aprovação humana final independente; memória, pacote, deploy e promoção continuam desligados.");
