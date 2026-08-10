import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledProofExecutionStartMemory,
  inspectControlledProofExecutionStartPolicy,
} from "../lib/release/controlled-proof-execution-start.mjs";
import {
  inspectControlledProofExecutionStartAuthorizationMemory,
  inspectControlledProofExecutionStartAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-start-authorization.mjs";

const fail = (message) => { throw new Error(`[phase-228] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-228-controlled-proof-execution-start.json",
  startPolicy: "config/controlled-proof-execution-start-policy.json",
  startMemory: "config/controlled-proof-execution-start-memory.json",
  startAuthorizationPolicy: "config/controlled-proof-execution-start-authorization-policy.json",
  startAuthorizationMemory: "config/controlled-proof-execution-start-authorization-memory.json",
  permitConsumptionPolicy: "config/controlled-external-publication-execution-permit-consumption-policy.json",
  permitConsumptionMemory: "config/controlled-external-publication-execution-permit-consumption-memory.json",
  permitPolicy: "config/controlled-external-publication-execution-permit-grant-policy.json",
  permitMemory: "config/controlled-external-publication-execution-permit-memory.json",
  acceptancePolicy: "config/controlled-external-publication-execution-acceptance-policy.json",
  acceptanceMemory: "config/controlled-external-publication-execution-acceptance-memory.json",
  handoffPolicy: "config/controlled-external-publication-execution-handoff-policy.json",
  handoffMemory: "config/controlled-external-publication-execution-handoff-memory.json",
  authorizationConsumptionPolicy: "config/controlled-external-publication-authorization-consumption-policy.json",
  authorizationConsumptionMemory: "config/controlled-external-publication-authorization-consumption-memory.json",
  grantPolicy: "config/controlled-external-publication-authorization-grant-policy.json",
  grantMemory: "config/controlled-external-publication-authorization-grant-memory.json",
  reviewPolicy: "config/controlled-external-publication-authorization-review-policy.json",
  documentation: "docs/EVOLUTION_PHASE_228_CONTROLLED_PROOF_EXECUTION_START.md",
  library: "lib/release/controlled-proof-execution-start.mjs",
  runner: "scripts/run-controlled-proof-execution-start-phase-228.mjs",
  test: "tests/contracts/controlled-proof-execution-start.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const startPolicy = readJson(paths.startPolicy);
const startMemory = readJson(paths.startMemory);
const startAuthorizationPolicy = readJson(paths.startAuthorizationPolicy);
const startAuthorizationMemory = readJson(paths.startAuthorizationMemory);
const permitConsumptionPolicy = readJson(paths.permitConsumptionPolicy);
const permitConsumptionMemory = readJson(paths.permitConsumptionMemory);
const permitPolicy = readJson(paths.permitPolicy);
const permitMemory = readJson(paths.permitMemory);
const acceptancePolicy = readJson(paths.acceptancePolicy);
const acceptanceMemory = readJson(paths.acceptanceMemory);
const handoffPolicy = readJson(paths.handoffPolicy);
const handoffMemory = readJson(paths.handoffMemory);
const authorizationConsumptionPolicy = readJson(paths.authorizationConsumptionPolicy);
const authorizationConsumptionMemory = readJson(paths.authorizationConsumptionMemory);
const grantPolicy = readJson(paths.grantPolicy);
const grantMemory = readJson(paths.grantMemory);
const reviewPolicy = readJson(paths.reviewPolicy);
const publicationEvidenceAdjudicationPolicy = readJson("config/publication-execution-evidence-adjudication-policy.json");
const executionPolicy = readJson("config/authorized-publication-execution-policy.json");
const executionAuthorizationPolicy = readJson("config/authorized-publication-execution-authorization-policy.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");

const upstreamContext = {
  controlledExternalPublicationExecutionPermitConsumptionPolicy: permitConsumptionPolicy,
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy,
  controlledExternalPublicationAuthorizationConsumptionPolicy: authorizationConsumptionPolicy,
  controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
  controlledExternalPublicationReviewPolicy: reviewPolicy,
  publicationEvidenceAdjudicationPolicy,
  executionPolicy,
  executionAuthorizationPolicy,
  publicationPolicy,
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
};
const startContext = {
  controlledProofExecutionStartAuthorizationPolicy: startAuthorizationPolicy,
  ...upstreamContext,
};

if (phase.phase !== 228 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledProofExecutionStartAuthorizationPolicy(startAuthorizationPolicy, upstreamContext),
  inspectControlledProofExecutionStartAuthorizationMemory(startAuthorizationMemory, { policy: startAuthorizationPolicy }),
  inspectControlledProofExecutionStartPolicy(startPolicy, startContext),
  inspectControlledProofExecutionStartMemory(startMemory, { policy: startPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (acceptancePolicy.trustedExternalExecutors.length) fail("executor externo real foi inventado");
if (permitPolicy.trustedPermitGrantors.length) fail("concedente de permissão real foi inventado");
if (permitConsumptionPolicy.trustedPermitConsumers.length) fail("consumidor de permissão real foi inventado");
if (startAuthorizationPolicy.trustedStartAuthorizers.length) fail("autorizador de início real foi inventado");
if (startPolicy.trustedStartExecutors.length) fail("executor de início real foi inventado");
if ([
  grantMemory, authorizationConsumptionMemory, handoffMemory, acceptanceMemory, permitMemory,
  permitConsumptionMemory, startAuthorizationMemory, startMemory,
].some((memory) => memory.entries.length)) fail("registro operacional canônico foi inventado");

const bindings = {
  authorizationReviewPolicyHash: reviewPolicy.policyHash,
  authorizationGrantPolicyHash: grantPolicy.policyHash,
  authorizationGrantMemoryHash: grantMemory.memoryHash,
  authorizationConsumptionPolicyHash: authorizationConsumptionPolicy.policyHash,
  authorizationConsumptionMemoryHash: authorizationConsumptionMemory.memoryHash,
  executionHandoffPolicyHash: handoffPolicy.policyHash,
  executionHandoffMemoryHash: handoffMemory.memoryHash,
  executionAcceptancePolicyHash: acceptancePolicy.policyHash,
  executionAcceptanceMemoryHash: acceptanceMemory.memoryHash,
  executionPermitGrantPolicyHash: permitPolicy.policyHash,
  executionPermitMemoryHash: permitMemory.memoryHash,
  executionPermitConsumptionPolicyHash: permitConsumptionPolicy.policyHash,
  executionPermitConsumptionMemoryHash: permitConsumptionMemory.memoryHash,
  controlledProofExecutionStartAuthorizationPolicyHash: startAuthorizationPolicy.policyHash,
  controlledProofExecutionStartAuthorizationMemoryHash: startAuthorizationMemory.memoryHash,
  controlledProofExecutionStartPolicyHash: startPolicy.policyHash,
  controlledProofExecutionStartMemoryHash: startMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedExternalExecutorsConfigured", "trustedPermitGrantorsConfigured", "trustedPermitConsumersConfigured",
  "trustedStartAuthorizersConfigured", "trustedStartExecutorsConfigured", "recordedHandoffs",
  "recordedAcceptanceDecisions", "accepted", "recordedPermits", "activeUnconsumedPermits",
  "consumedPermits", "recordedPermitConsumptions", "consumedSingleUsePermits", "distinctPermits",
  "recordedStartAuthorizations", "authorizedConsumptions", "distinctAuthorizations",
  "recordedExecutionStarts", "consumedStartAuthorizations", "distinctExecutionStarts",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "handoffPrepared", "executionAccepted", "publicationExecutionPermitted", "permitConsumed",
  "controlledProofExecutionStartAuthorized", "controlledProofExecutionStarted", "controlledProofExecutionObserved",
  "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted",
  "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (startPolicy.controlledProofExecutionStartAllowed !== true) fail("início controlado não habilitado");
if (startPolicy.controlledProofExecutionObservationAllowed !== false) fail("observação habilitada antecipadamente");
if (startPolicy.maximumStarts !== 1) fail("início deixou de ser de uso único");
if (startPolicy.publicationExecutionAllowed !== false) fail("publicação habilitada antecipadamente");
for (const key of [
  "networkAccessAllowed", "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
  "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
]) if (startPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_start_authorization_not_recorded",
  "controlled_proof_execution_start_authorization_already_consumed",
  "controlled_proof_execution_start_wrong_target_executor",
  "controlled_proof_execution_start_memory_head_binding_mismatch",
  "private_key_does_not_match_controlled_proof_execution_start_executor",
  "controlledProofExecutionStarted: true",
  "controlledProofExecutionObserved: false",
  "remainingStarts: 0",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (readJson("config/evolution-program-3000.json").currentPhase < 228) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-228:assess", "evolution:phase-228:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-228] PASS — somente autorização registrada, vigente, assinada e destinada ao executor exato inicia uma prova uma vez; observação, publicação, rede, banco, build, deploy e promoção permanecem bloqueados.");
