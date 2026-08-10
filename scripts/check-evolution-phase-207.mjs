import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectHumanReleaseGateDecisionPolicy } from "../lib/release/human-release-gate-decisions.mjs";

const fail = (message) => { throw new Error(`[phase-207] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-207-human-release-gate-decisions.json",
  "config/human-release-gate-decision-policy.json",
  "docs/EVOLUTION_PHASE_207_HUMAN_RELEASE_GATE_DECISIONS.md",
  "lib/release/human-release-gate-decisions.mjs",
  "scripts/run-human-release-gate-decisions-phase-207.mjs",
  "tests/contracts/human-release-gate-decisions.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const memory = readJson("config/release-module-completion-memory.json");
const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: readJson("config/release-module-dependency-graph.json") });
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const plan = readJson("config/release-gate-evidence-plan.json");
const intakePolicy = readJson("config/release-evidence-intake-policy.json");
const provenancePolicy = readJson("config/release-evidence-provenance-policy.json");
const admissionPolicy = readJson("config/release-evidence-admission-policy.json");
const evaluationPolicy = readJson("config/admitted-evidence-matrix-evaluation-policy.json");
const packetPolicy = readJson("config/release-gate-review-packet-policy.json");
const decisionPolicy = readJson(required[1]);
const context = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, packetPolicy };

if (phase.phase !== 207 || phase.status !== "implemented") fail("fase ou status inválido");
if (provenancePolicy.trustedSigners.length !== 0) fail("signatário real foi inventado");
const inspection = inspectHumanReleaseGateDecisionPolicy(decisionPolicy, context);
if (!inspection.ok) fail(`política canônica inválida: ${inspection.reason}`);
if (phase.currentState.humanDecisionPolicyHash !== decisionPolicy.policyHash) fail("hash da política divergente");
if (phase.decisionRules.maximumDecisionDelaySeconds !== decisionPolicy.maxDecisionDelaySeconds) fail("janela de decisão divergente");
if (phase.decisionRules.maximumRecordingDelaySeconds !== decisionPolicy.maxRecordingDelaySeconds) fail("janela de registro divergente");
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido na fase");
for (const key of ["reviewPacketAvailable", "humanDecisionsRecorded", "explicitReviewComplete", "unanimousExplicitApproval", "releaseApproved", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted", "releasePromoted"]) {
  if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
}
for (const key of ["automaticGateExecution", "automaticReleaseApproval", "automaticReleaseMemoryUpdate", "automaticPackageGeneration", "automaticDeploy", "automaticReleasePromotion"]) {
  if (decisionPolicy[key] !== false) fail(`${key} habilitado indevidamente`);
}
const source = readFileSync("lib/release/human-release-gate-decisions.mjs", "utf8");
for (const marker of ["reviewer_role_mismatch", "duplicate_module_gate_decision", "decision_window_expired", "decision_recording_window_expired", "signature_verification_failed"]) {
  if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 207) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-207:assess", "evolution:phase-207:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-207] PASS — decisões exigem papel, motivo, vínculo e assinatura; sem signatários reais não há decisão, execução, aprovação, pacote, deploy ou promoção.");
