import { readFileSync } from "node:fs";
import { createModuleDependencyGraphConfiguration, buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectAdmittedEvidenceMatrixEvaluationPolicy } from "../lib/release/admitted-evidence-matrix-evaluation.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const memory = readJson("config/release-module-completion-memory.json");
const graphConfiguration = readJson("config/release-module-dependency-graph.json");
createModuleDependencyGraphConfiguration(graphConfiguration);
const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: graphConfiguration });
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const plan = readJson("config/release-gate-evidence-plan.json");
const intakePolicy = readJson("config/release-evidence-intake-policy.json");
const provenancePolicy = readJson("config/release-evidence-provenance-policy.json");
const admissionPolicy = readJson("config/release-evidence-admission-policy.json");
const evaluationPolicy = readJson("config/admitted-evidence-matrix-evaluation-policy.json");
const inspection = inspectAdmittedEvidenceMatrixEvaluationPolicy(evaluationPolicy, { decision, plan, intakePolicy, provenancePolicy, admissionPolicy });
if (!inspection.ok) throw new Error(`admitted_evidence_matrix_evaluation_policy_invalid:${inspection.reason}`);

console.log(JSON.stringify({
  schema: "atlas.admitted-evidence-matrix-evaluation-readiness.v1",
  phase: 205,
  compositionId: decision.compositionId,
  evaluationPolicyHash: evaluationPolicy.policyHash,
  trustedSignersConfigured: provenancePolicy.trustedSigners.length,
  readiness: provenancePolicy.trustedSigners.length > 0 ? "awaiting_admitted_evidence" : "awaiting_trusted_signer_configuration",
  admissionsEvaluated: 0,
  recordsEvaluated: 0,
  evidenceMatrixEvaluated: false,
  evidenceCoverageComplete: false,
  gatesExecuted: false,
  releaseMemoryUpdated: false,
  packageGenerated: false,
  deployExecuted: false,
  releasePromoted: false
}, null, 2));
