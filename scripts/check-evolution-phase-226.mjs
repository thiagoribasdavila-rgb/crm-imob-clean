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

const fail = (message) => { throw new Error(`[phase-226] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-226-controlled-external-publication-execution-permit-consumption.json",
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
  documentation: "docs/EVOLUTION_PHASE_226_CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_CONSUMPTION.md",
  library: "lib/release/controlled-external-publication-execution-permit-consumption.mjs",
  runner: "scripts/run-controlled-external-publication-execution-permit-consumption-phase-226.mjs",
  test: "tests/contracts/controlled-external-publication-execution-permit-consumption.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
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

if (phase.phase !== 226 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledExternalPublicationExecutionHandoffPolicy(handoffPolicy, upstreamContext),
  inspectControlledExternalPublicationExecutionHandoffMemory(handoffMemory, { policy: handoffPolicy }),
  inspectControlledExternalPublicationExecutionAcceptancePolicy(acceptancePolicy, handoffContext),
  inspectControlledExternalPublicationExecutionAcceptanceMemory(acceptanceMemory, { policy: acceptancePolicy }),
  inspectControlledExternalPublicationExecutionPermitGrantPolicy(permitPolicy, permitContext),
  inspectControlledExternalPublicationExecutionPermitMemory(permitMemory, { policy: permitPolicy }),
  inspectControlledExternalPublicationExecutionPermitConsumptionPolicy(permitConsumptionPolicy, permitConsumptionContext),
  inspectControlledExternalPublicationExecutionPermitConsumptionMemory(permitConsumptionMemory, { policy: permitConsumptionPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (acceptancePolicy.trustedExternalExecutors.length) fail("executor externo real foi inventado");
if (permitPolicy.trustedPermitGrantors.length) fail("concedente de permissão real foi inventado");
if (permitConsumptionPolicy.trustedPermitConsumers.length) fail("consumidor de permissão real foi inventado");
if (
  grantMemory.entries.length || authorizationConsumptionMemory.entries.length || handoffMemory.entries.length ||
  acceptanceMemory.entries.length || permitMemory.entries.length || permitConsumptionMemory.entries.length
) fail("concessão, consumo, handoff, aceitação ou permissão canônica foi inventada");

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
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedExternalExecutorsConfigured", "trustedPermitGrantorsConfigured", "trustedPermitConsumersConfigured",
  "recordedHandoffs", "recordedAcceptanceDecisions", "accepted", "recordedPermits", "activeUnconsumedPermits",
  "consumedPermits", "recordedPermitConsumptions", "consumedSingleUsePermits", "distinctPermits",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "handoffPrepared", "executionAccepted", "publicationExecutionPermitted", "permitConsumed", "controlledProofExecutionStarted",
  "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (permitConsumptionPolicy.permitConsumptionAllowed !== true) fail("consumo de permissão não habilitado");
if (permitConsumptionPolicy.controlledProofExecutionStartAllowed !== false) fail("início da prova habilitado antecipadamente");
if (permitConsumptionPolicy.maximumUses !== 1) fail("permissão deixou de ser de uso único");
if (permitConsumptionPolicy.publicationExecutionAllowed !== false) fail("execução de publicação habilitada antecipadamente");
for (const key of [
  "networkAccessAllowed", "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
  "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
]) if (permitConsumptionPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "recorded_unexpired_single_use_execution_permit_required_for_consumption",
  "external_publication_execution_permit_already_consumed",
  "external_publication_execution_permit_consumption_wrong_target_executor",
  "external_publication_execution_permit_not_recorded",
  "external_publication_execution_permit_consumption_memory_head_binding_mismatch",
  "private_key_does_not_match_external_publication_execution_permit_consumer",
  "permitConsumed: true",
  "remainingUses: 0",
  "controlledProofExecutionStartAllowed: false",
  "controlledProofExecutionStarted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);

if (readJson("config/evolution-program-3000.json").currentPhase < 226) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-226:assess", "evolution:phase-226:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-226] PASS — o executor já aceito só pode consumir uma permissão registrada, vigente e de uso único; o consumo é atômico e auditável, enquanto prova, publicação, rede, build, deploy e promoção permanecem bloqueados.");
