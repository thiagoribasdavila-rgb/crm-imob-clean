import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import {
  inspectApprovedReleaseMemory,
  inspectApprovedReleaseMemoryPolicy,
} from "../lib/release/approved-release-memory-commitment.mjs";

const fail = (message) => { throw new Error(`[phase-212] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-212-approved-release-memory-commitment.json",
  "config/approved-release-memory-policy.json",
  "config/approved-release-memory.json",
  "docs/EVOLUTION_PHASE_212_APPROVED_RELEASE_MEMORY_COMMITMENT.md",
  "lib/release/approved-release-memory-commitment.mjs",
  "scripts/run-approved-release-memory-commitment-phase-212.mjs",
  "tests/contracts/approved-release-memory-commitment.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const policy = readJson(required[1]);
const approvedMemory = readJson(required[2]);
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
  packetPolicy: readJson("config/release-gate-review-packet-policy.json")
};
const decisionPolicy = readJson("config/human-release-gate-decision-policy.json");
const authorizationPolicy = readJson("config/release-gate-execution-authorization-policy.json");
const executionPolicy = readJson("config/authorized-release-gate-execution-policy.json");
const adjudicationPolicy = readJson("config/release-gate-result-adjudication-policy.json");
const approvalPolicy = readJson("config/final-release-approval-policy.json");

if (phase.phase !== 212 || phase.status !== "implemented") fail("fase ou status inválido");
if (approvalPolicy.trustedApprovers.length !== 0) fail("aprovador final real foi inventado");
const policyInspection = inspectApprovedReleaseMemoryPolicy(policy, { approvalPolicy, packetContext, decisionPolicy, authorizationPolicy, executionPolicy, adjudicationPolicy });
if (!policyInspection.ok) fail(`política canônica inválida: ${policyInspection.reason}`);
const memoryInspection = inspectApprovedReleaseMemory(approvedMemory, { policy });
if (!memoryInspection.ok) fail(`memória canônica inválida: ${memoryInspection.reason}`);
if (approvedMemory.entries.length !== 0 || approvedMemory.summary.committedApprovals !== 0) fail("aprovação final foi inventada na memória");
if (phase.currentState.approvalPolicyHash !== approvalPolicy.policyHash) fail("hash da política final divergente");
if (phase.currentState.memoryPolicyHash !== policy.policyHash) fail("hash da política de memória divergente");
if (phase.currentState.memoryHash !== approvedMemory.memoryHash) fail("hash da memória divergente");
if (phase.currentState.committedApprovals !== 0) fail("contador de aprovações indevido");
for (const key of ["verifiedFinalApprovalDecisionAvailable", "approvedReleaseCommitted", "packageGenerated", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");
for (const key of ["automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) {
  if (policy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync("lib/release/approved-release-memory-commitment.mjs", "utf8");
for (const marker of ["only_approved_final_release_decision_can_be_committed", "approved_release_memory_decision_duplicate", "approved_release_memory_hash_chain_invalid", "approved_release_memory_entry_hash_mismatch", "release_memory_commit_window_expired"]) {
  if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 212) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-212:assess", "evolution:phase-212:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-212] PASS — a memória é append-only, encadeada por hash e aceita somente aprovação final válida; sem decisão real, pacote, deploy e promoção continuam desligados.");
