import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationExecutionAcceptanceMemory,
  inspectControlledExternalPublicationExecutionAcceptancePolicy,
} from "../lib/release/controlled-external-publication-execution-acceptance.mjs";
import {
  inspectControlledExternalPublicationExecutionHandoffMemory,
  inspectControlledExternalPublicationExecutionHandoffPolicy,
} from "../lib/release/controlled-external-publication-execution-handoff.mjs";
import {
  inspectControlledExternalPublicationExecutionPermitGrantPolicy,
  inspectControlledExternalPublicationExecutionPermitMemory,
} from "../lib/release/controlled-external-publication-execution-permit-grant.mjs";
import {
  inspectControlledExternalPublicationExecutionPermitConsumptionMemory,
  inspectControlledExternalPublicationExecutionPermitConsumptionPolicy,
} from "../lib/release/controlled-external-publication-execution-permit-consumption.mjs";
import {
  inspectControlledProofExecutionStartAuthorizationMemory,
  inspectControlledProofExecutionStartAuthorizationPolicy,
} from "../lib/release/controlled-proof-execution-start-authorization.mjs";

const fail = (message) => { throw new Error(`[phase-227] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-227-controlled-proof-execution-start-authorization.json",
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
  documentation: "docs/EVOLUTION_PHASE_227_CONTROLLED_PROOF_EXECUTION_START_AUTHORIZATION.md",
  library: "lib/release/controlled-proof-execution-start-authorization.mjs",
  runner: "scripts/run-controlled-proof-execution-start-authorization-phase-227.mjs",
  test: "tests/contracts/controlled-proof-execution-start-authorization.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
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
const handoffContext = {
  controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy,
  ...upstreamContext,
};
const permitContext = {
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  ...handoffContext,
};
const permitConsumptionContext = {
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  ...handoffContext,
};
const startAuthorizationContext = {
  controlledExternalPublicationExecutionPermitConsumptionPolicy: permitConsumptionPolicy,
  controlledExternalPublicationExecutionPermitGrantPolicy: permitPolicy,
  controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
  ...handoffContext,
};

if (phase.phase !== 227 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledExternalPublicationExecutionHandoffPolicy(handoffPolicy, upstreamContext),
  inspectControlledExternalPublicationExecutionHandoffMemory(handoffMemory, { policy: handoffPolicy }),
  inspectControlledExternalPublicationExecutionAcceptancePolicy(acceptancePolicy, handoffContext),
  inspectControlledExternalPublicationExecutionAcceptanceMemory(acceptanceMemory, { policy: acceptancePolicy }),
  inspectControlledExternalPublicationExecutionPermitGrantPolicy(permitPolicy, permitContext),
  inspectControlledExternalPublicationExecutionPermitMemory(permitMemory, { policy: permitPolicy }),
  inspectControlledExternalPublicationExecutionPermitConsumptionPolicy(permitConsumptionPolicy, permitConsumptionContext),
  inspectControlledExternalPublicationExecutionPermitConsumptionMemory(permitConsumptionMemory, { policy: permitConsumptionPolicy }),
  inspectControlledProofExecutionStartAuthorizationPolicy(startAuthorizationPolicy, startAuthorizationContext),
  inspectControlledProofExecutionStartAuthorizationMemory(startAuthorizationMemory, { policy: startAuthorizationPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (acceptancePolicy.trustedExternalExecutors.length) fail("executor externo real foi inventado");
if (permitPolicy.trustedPermitGrantors.length) fail("concedente de permissão real foi inventado");
if (permitConsumptionPolicy.trustedPermitConsumers.length) fail("consumidor de permissão real foi inventado");
if (startAuthorizationPolicy.trustedStartAuthorizers.length) fail("autorizador de início real foi inventado");
if (
  grantMemory.entries.length || authorizationConsumptionMemory.entries.length || handoffMemory.entries.length ||
  acceptanceMemory.entries.length || permitMemory.entries.length || permitConsumptionMemory.entries.length ||
  startAuthorizationMemory.entries.length
) fail("concessão, consumo, handoff, aceitação, permissão ou autorização canônica foi inventada");

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
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedExternalExecutorsConfigured", "trustedPermitGrantorsConfigured", "trustedPermitConsumersConfigured",
  "trustedStartAuthorizersConfigured", "recordedHandoffs", "recordedAcceptanceDecisions", "accepted",
  "recordedPermits", "activeUnconsumedPermits", "consumedPermits", "recordedPermitConsumptions",
  "consumedSingleUsePermits", "distinctPermits", "recordedStartAuthorizations", "authorizedConsumptions",
  "distinctAuthorizations",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "handoffPrepared", "executionAccepted", "publicationExecutionPermitted", "permitConsumed",
  "controlledProofExecutionStartAuthorized", "controlledProofExecutionStarted", "publicationExecuted",
  "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (startAuthorizationPolicy.controlledProofExecutionStartAuthorizationAllowed !== true) fail("autorização do início não habilitada");
if (startAuthorizationPolicy.controlledProofExecutionStartAllowed !== false) fail("início da prova habilitado antecipadamente");
if (startAuthorizationPolicy.maximumAuthorizationTtlSeconds !== 300) fail("TTL máximo divergente");
if (startAuthorizationPolicy.maximumStarts !== 1) fail("autorização deixou de ser de uso único");
if (startAuthorizationPolicy.publicationExecutionAllowed !== false) fail("execução de publicação habilitada antecipadamente");
for (const key of [
  "networkAccessAllowed", "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
  "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
]) if (startAuthorizationPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "controlled_proof_execution_start_consumption_not_recorded",
  "controlled_proof_execution_start_consumption_already_authorized",
  "controlled_proof_execution_start_authorization_wrong_target_executor",
  "controlled_proof_execution_start_authorization_memory_head_binding_mismatch",
  "private_key_does_not_match_controlled_proof_execution_start_authorizer",
  "controlledProofExecutionStartAuthorized: true",
  "remainingStarts: 1",
  "controlledProofExecutionStarted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (readJson("config/evolution-program-3000.json").currentPhase < 227) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-227:assess", "evolution:phase-227:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-227] PASS — somente um consumo registrado, íntegro e válido pode receber uma autorização assinada, curta e de uso único; prova, publicação, rede, banco, build, deploy e promoção permanecem bloqueados.");
