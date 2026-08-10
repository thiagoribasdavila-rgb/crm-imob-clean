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

const fail = (message) => { throw new Error(`[phase-225] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-225-controlled-external-publication-execution-permit-grant.json",
  permitPolicy: "config/controlled-external-publication-execution-permit-grant-policy.json",
  permitMemory: "config/controlled-external-publication-execution-permit-memory.json",
  acceptancePolicy: "config/controlled-external-publication-execution-acceptance-policy.json",
  acceptanceMemory: "config/controlled-external-publication-execution-acceptance-memory.json",
  handoffPolicy: "config/controlled-external-publication-execution-handoff-policy.json",
  handoffMemory: "config/controlled-external-publication-execution-handoff-memory.json",
  consumptionPolicy: "config/controlled-external-publication-authorization-consumption-policy.json",
  consumptionMemory: "config/controlled-external-publication-authorization-consumption-memory.json",
  grantPolicy: "config/controlled-external-publication-authorization-grant-policy.json",
  grantMemory: "config/controlled-external-publication-authorization-grant-memory.json",
  reviewPolicy: "config/controlled-external-publication-authorization-review-policy.json",
  documentation: "docs/EVOLUTION_PHASE_225_CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_GRANT.md",
  library: "lib/release/controlled-external-publication-execution-permit-grant.mjs",
  runner: "scripts/run-controlled-external-publication-execution-permit-grant-phase-225.mjs",
  test: "tests/contracts/controlled-external-publication-execution-permit-grant.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const permitPolicy = readJson(paths.permitPolicy);
const permitMemory = readJson(paths.permitMemory);
const acceptancePolicy = readJson(paths.acceptancePolicy);
const acceptanceMemory = readJson(paths.acceptanceMemory);
const handoffPolicy = readJson(paths.handoffPolicy);
const handoffMemory = readJson(paths.handoffMemory);
const consumptionPolicy = readJson(paths.consumptionPolicy);
const consumptionMemory = readJson(paths.consumptionMemory);
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
  controlledExternalPublicationAuthorizationConsumptionPolicy: consumptionPolicy,
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

if (phase.phase !== 225 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledExternalPublicationExecutionHandoffPolicy(handoffPolicy, upstreamContext),
  inspectControlledExternalPublicationExecutionHandoffMemory(handoffMemory, { policy: handoffPolicy }),
  inspectControlledExternalPublicationExecutionAcceptancePolicy(acceptancePolicy, handoffContext),
  inspectControlledExternalPublicationExecutionAcceptanceMemory(acceptanceMemory, { policy: acceptancePolicy }),
  inspectControlledExternalPublicationExecutionPermitGrantPolicy(permitPolicy, {
    controlledExternalPublicationExecutionAcceptancePolicy: acceptancePolicy,
    ...handoffContext,
  }),
  inspectControlledExternalPublicationExecutionPermitMemory(permitMemory, { policy: permitPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (acceptancePolicy.trustedExternalExecutors.length) fail("executor externo real foi inventado");
if (permitPolicy.trustedPermitGrantors.length) fail("concedente de permissão real foi inventado");
if (grantMemory.entries.length || consumptionMemory.entries.length || handoffMemory.entries.length || acceptanceMemory.entries.length || permitMemory.entries.length) fail("concessão, consumo, handoff, aceitação ou permissão canônica foi inventada");

const bindings = {
  authorizationReviewPolicyHash: reviewPolicy.policyHash,
  authorizationGrantPolicyHash: grantPolicy.policyHash,
  authorizationGrantMemoryHash: grantMemory.memoryHash,
  authorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  authorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  executionHandoffPolicyHash: handoffPolicy.policyHash,
  executionHandoffMemoryHash: handoffMemory.memoryHash,
  executionAcceptancePolicyHash: acceptancePolicy.policyHash,
  executionAcceptanceMemoryHash: acceptanceMemory.memoryHash,
  executionPermitGrantPolicyHash: permitPolicy.policyHash,
  executionPermitMemoryHash: permitMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedExternalExecutorsConfigured",
  "trustedPermitGrantorsConfigured",
  "recordedHandoffs",
  "recordedAcceptanceDecisions",
  "accepted",
  "recordedPermits",
  "activeUnconsumedPermits",
  "consumedPermits",
  "distinctAcceptances",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "handoffPrepared",
  "executionAccepted",
  "publicationExecutionPermitted",
  "permitConsumed",
  "publicationExecuted",
  "externalPublicationExecuted",
  "packageGenerated",
  "buildExecuted",
  "deployExecuted",
  "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (permitPolicy.permitGrantAllowed !== true) fail("concessão de permissão não habilitada");
if (permitPolicy.permitConsumptionAllowed !== false) fail("consumo habilitado antecipadamente");
if (permitPolicy.publicationExecutionAllowed !== false) fail("execução de publicação habilitada antecipadamente");
if (permitPolicy.maximumGrantDelayMs > 300000) fail("prazo de concessão excede cinco minutos");
if (permitPolicy.maximumPermitValidityMs > 120000) fail("validade da permissão excede dois minutos");
for (const key of [
  "networkAccessAllowed",
  "databaseMutationAllowed",
  "externalPublicationAllowed",
  "automaticPublicationExecution",
  "automaticPackageGeneration",
  "automaticBuild",
  "automaticDeploy",
  "automaticReleasePromotion",
]) if (permitPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "eligible_recorded_execution_acceptance_required_for_permit",
  "external_publication_execution_acceptance_already_permitted",
  "external_publication_execution_permit_grantor_must_be_independent",
  "external_publication_execution_permit_expiration_exceeds_handoff",
  "external_publication_execution_permit_not_recorded",
  "external_publication_execution_permit_memory_head_binding_mismatch",
  "publicationExecutionPermitted: true",
  "permitConsumed: false",
  "externalPublicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 225) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-225:assess", "evolution:phase-225:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-225] PASS — somente um concedente independente pode emitir permissão assinada, curta e de uso único para uma aceitação registrada; publicação, rede, build, deploy e promoção permanecem bloqueados.");
