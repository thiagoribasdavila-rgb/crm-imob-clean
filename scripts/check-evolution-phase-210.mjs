import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectReleaseGateResultAdjudicationPolicy } from "../lib/release/release-gate-result-adjudication.mjs";

const fail = (message) => { throw new Error(`[phase-210] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-210-release-gate-result-adjudication.json",
  "config/release-gate-result-adjudication-policy.json",
  "docs/EVOLUTION_PHASE_210_RELEASE_GATE_RESULT_ADJUDICATION.md",
  "lib/release/release-gate-result-adjudication.mjs",
  "scripts/run-release-gate-result-adjudication-phase-210.mjs",
  "tests/contracts/release-gate-result-adjudication.test.mjs",
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
const adjudicationPolicy = readJson(required[1]);

if (phase.phase !== 210 || phase.status !== "implemented") fail("fase ou status inválido");
if (adjudicationPolicy.trustedAdjudicators.length !== 0) fail("adjudicador real foi inventado");
const inspection = inspectReleaseGateResultAdjudicationPolicy(adjudicationPolicy, { packetContext, decisionPolicy, authorizationPolicy, executionPolicy });
if (!inspection.ok) fail(`política canônica inválida: ${inspection.reason}`);
if (phase.currentState.adjudicationPolicyHash !== adjudicationPolicy.policyHash) fail("hash da política divergente");
if (phase.adjudicationRules.maximumAdjudicationDelaySeconds !== adjudicationPolicy.maxAdjudicationDelaySeconds) fail("janela de adjudicação divergente");
if (phase.adjudicationRules.adjudicatorRole !== adjudicationPolicy.adjudicatorRole) fail("papel do adjudicador divergente");
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");
for (const key of ["verifiedExecutionRegisterAvailable", "adjudicationRegisterAvailable", "resultSetAdjudicated", "gateResultsAccepted", "releaseApproved", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
for (const key of ["automaticReleaseApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) {
  if (adjudicationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync("lib/release/release-gate-result-adjudication.mjs", "utf8");
for (const marker of ["executor_cannot_adjudicate_own_results", "failed_gate_result_cannot_be_accepted", "gate_result_decision_receipt_set_mismatch", "gate_result_adjudication_execution_register_mismatch", "gate_result_adjudication_signature_invalid", "gate_result_adjudication_register_hash_mismatch"]) {
  if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 210) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-210:assess", "evolution:phase-210:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-210] PASS — cada recibo assinado exige adjudicação humana independente; falha não pode ser aceita e nenhum resultado aprova, empacota, publica ou promove a release automaticamente.");
