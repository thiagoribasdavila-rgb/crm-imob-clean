import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { inspectApprovedReleaseMemory, inspectApprovedReleaseMemoryPolicy } from "../lib/release/approved-release-memory-commitment.mjs";
import { inspectApprovedReleasePackageAuthorizationPolicy } from "../lib/release/approved-release-package-authorization.mjs";
import { inspectAuthorizedReleasePackageAssemblyMemory, inspectAuthorizedReleasePackageAssemblyPolicy } from "../lib/release/authorized-release-package-assembly.mjs";
import { inspectAuthorizedPackageEvidenceCommitmentPolicy, inspectAuthorizedPackageEvidenceMemory } from "../lib/release/authorized-package-evidence-commitment.mjs";

const fail = (message) => { throw new Error(`[phase-215] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-215-authorized-package-evidence-commitment.json",
  "config/authorized-package-evidence-commitment-policy.json",
  "config/authorized-package-evidence-memory.json",
  "config/authorized-release-package-assembly-policy.json",
  "config/authorized-release-package-assembly-memory.json",
  "docs/EVOLUTION_PHASE_215_AUTHORIZED_PACKAGE_EVIDENCE_COMMITMENT.md",
  "lib/release/authorized-package-evidence-commitment.mjs",
  "scripts/run-authorized-package-evidence-commitment-phase-215.mjs",
  "tests/contracts/authorized-package-evidence-commitment.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const evidencePolicy = readJson(required[1]);
const evidenceMemory = readJson(required[2]);
const assemblyPolicy = readJson(required[3]);
const assemblyMemory = readJson(required[4]);
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const memoryPolicy = readJson("config/approved-release-memory-policy.json");
const memory = readJson("config/approved-release-memory.json");
const completionMemory = readJson("config/release-module-completion-memory.json");
const graph = buildModuleDependencyGraph({ completionMemory, configuration: readJson("config/release-module-dependency-graph.json") });
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const packetContext = { decision, plan: readJson("config/release-gate-evidence-plan.json"), intakePolicy: readJson("config/release-evidence-intake-policy.json"), provenancePolicy: readJson("config/release-evidence-provenance-policy.json"), admissionPolicy: readJson("config/release-evidence-admission-policy.json"), evaluationPolicy: readJson("config/admitted-evidence-matrix-evaluation-policy.json"), packetPolicy: readJson("config/release-gate-review-packet-policy.json") };
const approvalContext = { packetContext, decisionPolicy: readJson("config/human-release-gate-decision-policy.json"), authorizationPolicy: readJson("config/release-gate-execution-authorization-policy.json"), executionPolicy: readJson("config/authorized-release-gate-execution-policy.json"), adjudicationPolicy: readJson("config/release-gate-result-adjudication-policy.json") };
const approvalPolicy = readJson("config/final-release-approval-policy.json");

if (phase.phase !== 215 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectApprovedReleaseMemoryPolicy(memoryPolicy, { approvalPolicy, ...approvalContext }),
  inspectApprovedReleaseMemory(memory, { policy: memoryPolicy }),
  inspectApprovedReleasePackageAuthorizationPolicy(packageAuthorizationPolicy, { approvalPolicy, memoryPolicy, ...approvalContext }),
  inspectAuthorizedReleasePackageAssemblyPolicy(assemblyPolicy, { packageAuthorizationPolicy, approvalPolicy, memoryPolicy, ...approvalContext }),
  inspectAuthorizedReleasePackageAssemblyMemory(assemblyMemory, { policy: assemblyPolicy }),
  inspectAuthorizedPackageEvidenceCommitmentPolicy(evidencePolicy, { assemblyPolicy, packageAuthorizationPolicy }),
  inspectAuthorizedPackageEvidenceMemory(evidenceMemory, { policy: evidencePolicy })
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);
if (approvalPolicy.trustedApprovers.length || packageAuthorizationPolicy.trustedPackageAuthorizers.length || evidencePolicy.trustedEvidenceCustodians.length) fail("identidade real foi inventada");
if (memory.entries.length || assemblyMemory.entries.length || evidenceMemory.entries.length) fail("evidência canônica foi inventada");
if (phase.currentState.packageAssemblyPolicyHash !== assemblyPolicy.policyHash || phase.currentState.packageAssemblyMemoryHash !== assemblyMemory.memoryHash) fail("vínculo de montagem divergente");
if (phase.currentState.packageEvidencePolicyHash !== evidencePolicy.policyHash || phase.currentState.packageEvidenceMemoryHash !== evidenceMemory.memoryHash) fail("vínculo de evidência divergente");
if (phase.currentState.trustedEvidenceCustodiansConfigured !== 0 || phase.currentState.assembledPackages !== 0 || phase.currentState.committedPackageEvidence !== 0) fail("estado canônico inventado");
for (const key of ["packageGenerated", "evidenceCommitted", "buildExecuted", "deployExecuted", "releasePromoted"]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");
for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion"]) if (evidencePolicy[key] !== false) fail(`${key} habilitado indevidamente`);
const source = readFileSync(required[6], "utf8");
for (const marker of ["package_assembler_and_evidence_custodian_must_be_separate", "package_evidence_duplicate_receipt", "package_evidence_duplicate_package", "package_evidence_commitment_not_committed", "package_evidence_receipt_invalid"]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 215) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-215:assess", "evolution:phase-215:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);
console.log("[phase-215] PASS — evidência de ZIP autorizado exige custodiante independente e vínculo exato; nenhum pacote, build, deploy ou promoção foi executado no estado canônico.");
