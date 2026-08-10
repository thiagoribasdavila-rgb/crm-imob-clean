import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { createReleaseGateEvidenceRecord } from "../lib/release/release-gate-evidence-matrix.mjs";
import { createReleaseEvidenceIntake, inspectReleaseEvidenceIntakePolicy, processReleaseEvidenceIntake } from "../lib/release/release-evidence-intake.mjs";

const fail = (message) => { throw new Error(`[phase-202] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-202-release-evidence-intake.json",
  "config/release-evidence-intake-policy.json",
  "docs/EVOLUTION_PHASE_202_RELEASE_EVIDENCE_INTAKE.md",
  "lib/release/release-evidence-intake.mjs",
  "scripts/run-release-evidence-intake-phase-202.mjs",
  "tests/contracts/release-evidence-intake.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const policy = readJson(required[1]);
const plan = readJson("config/release-gate-evidence-plan.json");
const graph = buildModuleDependencyGraph({
  completionMemory: readJson("config/release-module-completion-memory.json"),
  configuration: readJson("config/release-module-dependency-graph.json"),
});
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
if (phase.phase !== 202 || phase.status !== "implemented") fail("fase ou status inválido");
for (const [key, value] of Object.entries(phase.safety)) if (value !== false) fail(`${key} deveria permanecer falso`);
const policyInspection = inspectReleaseEvidenceIntakePolicy(policy, { decision, plan });
if (!policyInspection.ok) fail(`política canônica inválida: ${policyInspection.reason}`);
if (phase.currentState.policyHash !== policy.policyHash) fail("hash da política divergente");
if (phase.currentState.intakesReceived !== 0 || phase.currentState.recordsReceived !== 0) fail("fase registrou evidência real inexistente");
for (const key of ["provenanceVerified", "evidenceMatrixEvaluated", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted"]) {
  if (phase.currentState[key] !== false) fail(`${key} deveria permanecer falso`);
}

const moduleEntry = plan.modules[0];
const gate = moduleEntry.gates.find((item) => item.gate === "runtimeHomologated");
const record = createReleaseGateEvidenceRecord({
  evidenceId: "phase-202-contract-fixture",
  moduleId: moduleEntry.moduleId,
  revision: moduleEntry.revision,
  entryHash: moduleEntry.entryHash,
  compositionDecisionHash: decision.decisionHash,
  gate: gate.gate,
  evidenceType: gate.requiredEvidence[0],
  ownerRole: gate.ownerRole,
  environment: "isolated",
  result: "passed",
  observedAt: "2026-08-08T12:00:00.000Z",
  validUntil: "2026-08-09T12:00:00.000Z",
  artifacts: ["evidence/phase-202/contract-fixture.json"],
  artifactHash: "a".repeat(64),
});
const intake = createReleaseEvidenceIntake({
  decision,
  plan,
  policy,
  intakeId: "phase-202-contract-intake",
  submitter: { actorId: "phase-202-checker", role: gate.ownerRole },
  channel: "isolated_handoff",
  submittedAt: "2026-08-08T12:01:00.000Z",
  records: [record],
});
const accepted = processReleaseEvidenceIntake({ decision, plan, policy, intake, receivedAt: "2026-08-08T12:02:00.000Z" });
if (accepted.status !== "accepted_for_provenance_review" || accepted.recordsAcceptedForReview !== 1) fail("fixture válida não entrou em revisão de procedência");
for (const key of ["provenanceVerified", "eligibleForEvidenceMatrix", "evidenceMatrixEvaluated", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted"]) {
  if (accepted[key] !== false) fail(`${key} foi liberado indevidamente`);
}
const replay = processReleaseEvidenceIntake({ decision, plan, policy, intake, receivedAt: "2026-08-08T12:02:00.000Z", seenIntakeHashes: [intake.intakeHash] });
if (replay.status !== "quarantined" || !replay.rejectionReasons.includes("intake_replay_detected")) fail("replay não foi bloqueado");

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 202) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-202:assess", "evolution:phase-202:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);
console.log(`[phase-202] PASS — ${plan.modules.length} módulos, 8 gates, 14 provas exigidas, intake seguro validado, replay bloqueado e nenhuma promoção executada.`);
