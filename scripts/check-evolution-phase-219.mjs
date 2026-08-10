import { existsSync, readFileSync } from "node:fs";
import {
  inspectPublicationExecutionEvidenceAdjudicationMemory,
  inspectPublicationExecutionEvidenceAdjudicationPolicy,
} from "../lib/release/publication-execution-evidence-adjudication.mjs";
import {
  inspectAuthorizedPublicationExecutionMemory,
  inspectAuthorizedPublicationExecutionPolicy,
} from "../lib/release/authorized-publication-execution.mjs";

const fail = (message) => { throw new Error(`[phase-219] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-219-publication-execution-evidence-adjudication.json",
  adjudicationPolicy: "config/publication-execution-evidence-adjudication-policy.json",
  adjudicationMemory: "config/publication-execution-evidence-adjudication-memory.json",
  executionPolicy: "config/authorized-publication-execution-policy.json",
  executionMemory: "config/authorized-publication-execution-memory.json",
  documentation: "docs/EVOLUTION_PHASE_219_PUBLICATION_EXECUTION_EVIDENCE_ADJUDICATION.md",
  library: "lib/release/publication-execution-evidence-adjudication.mjs",
  runner: "scripts/run-publication-execution-evidence-adjudication-phase-219.mjs",
  test: "tests/contracts/publication-execution-evidence-adjudication.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const publicationEvidenceAdjudicationPolicy = readJson(paths.adjudicationPolicy);
const publicationEvidenceAdjudicationMemory = readJson(paths.adjudicationMemory);
const executionPolicy = readJson(paths.executionPolicy);
const executionMemory = readJson(paths.executionMemory);
const executionAuthorizationPolicy = readJson("config/authorized-publication-execution-authorization-policy.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const context = { executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };

if (phase.phase !== 219 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectAuthorizedPublicationExecutionPolicy(executionPolicy, context),
  inspectAuthorizedPublicationExecutionMemory(executionMemory, { policy: executionPolicy }),
  inspectPublicationExecutionEvidenceAdjudicationPolicy(publicationEvidenceAdjudicationPolicy, { executionPolicy, ...context }),
  inspectPublicationExecutionEvidenceAdjudicationMemory(publicationEvidenceAdjudicationMemory, { policy: publicationEvidenceAdjudicationPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (
  executionPolicy.trustedExecutors.length ||
  executionPolicy.trustedPublicationHandlers.length ||
  publicationEvidenceAdjudicationPolicy.trustedAdjudicators.length
) fail("executor, handler ou julgador real foi inventado");
if (executionMemory.entries.length || publicationEvidenceAdjudicationMemory.entries.length) fail("execução ou adjudicação canônica foi inventada");

const bindings = {
  executionPolicyHash: executionPolicy.policyHash,
  executionMemoryHash: executionMemory.memoryHash,
  evidenceAdjudicationPolicyHash: publicationEvidenceAdjudicationPolicy.policyHash,
  evidenceAdjudicationMemoryHash: publicationEvidenceAdjudicationMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedEvidenceAdjudicatorsConfigured",
  "recordedExecutions",
  "successfulLocalProofs",
  "failedLocalProofs",
  "recordedAdjudications",
  "acceptedEvidence",
  "rejectedEvidence",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "publicationProofAdjudicated",
  "evidenceAccepted",
  "externalPublicationAuthorized",
  "publicationExecuted",
  "externalPublicationExecuted",
  "packageGenerated",
  "buildExecuted",
  "deployExecuted",
  "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");
for (const key of [
  "externalPublicationAuthorizationAllowed",
  "networkAccessAllowed",
  "databaseMutationAllowed",
  "externalPublicationAllowed",
  "automaticPackageGeneration",
  "automaticBuild",
  "automaticDeploy",
  "automaticReleasePromotion",
]) if (publicationEvidenceAdjudicationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "publication_evidence_adjudicator_must_be_independent",
  "executor_cannot_adjudicate_own_publication_proof",
  "publication_execution_receipt_invalid",
  "publication_execution_receipt_not_recorded",
  "publication_execution_evidence_already_adjudicated",
  "externalPublicationAuthorized: false",
  "externalPublicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 219) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-219:assess", "evolution:phase-219:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-219] PASS — prova local só pode ser aceita por julgador independente, com recibo assinado, execução registrada, vínculos exatos e memória append-only; nenhuma autorização ou publicação externa foi executada no estado canônico.");
