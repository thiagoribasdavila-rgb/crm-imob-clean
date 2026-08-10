import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationExecutionAcceptanceMemory,
  inspectControlledExternalPublicationExecutionAcceptancePolicy,
} from "../lib/release/controlled-external-publication-execution-acceptance.mjs";
import {
  inspectControlledExternalPublicationExecutionHandoffMemory,
  inspectControlledExternalPublicationExecutionHandoffPolicy,
} from "../lib/release/controlled-external-publication-execution-handoff.mjs";

const fail = (message) => { throw new Error(`[phase-224] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-224-controlled-external-publication-execution-acceptance.json",
  acceptancePolicy: "config/controlled-external-publication-execution-acceptance-policy.json",
  acceptanceMemory: "config/controlled-external-publication-execution-acceptance-memory.json",
  handoffPolicy: "config/controlled-external-publication-execution-handoff-policy.json",
  handoffMemory: "config/controlled-external-publication-execution-handoff-memory.json",
  consumptionPolicy: "config/controlled-external-publication-authorization-consumption-policy.json",
  consumptionMemory: "config/controlled-external-publication-authorization-consumption-memory.json",
  grantPolicy: "config/controlled-external-publication-authorization-grant-policy.json",
  grantMemory: "config/controlled-external-publication-authorization-grant-memory.json",
  reviewPolicy: "config/controlled-external-publication-authorization-review-policy.json",
  documentation: "docs/EVOLUTION_PHASE_224_CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_ACCEPTANCE.md",
  library: "lib/release/controlled-external-publication-execution-acceptance.mjs",
  runner: "scripts/run-controlled-external-publication-execution-acceptance-phase-224.mjs",
  test: "tests/contracts/controlled-external-publication-execution-acceptance.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
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

if (phase.phase !== 224 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledExternalPublicationExecutionHandoffPolicy(handoffPolicy, upstreamContext),
  inspectControlledExternalPublicationExecutionHandoffMemory(handoffMemory, { policy: handoffPolicy }),
  inspectControlledExternalPublicationExecutionAcceptancePolicy(acceptancePolicy, {
    controlledExternalPublicationExecutionHandoffPolicy: handoffPolicy,
    ...upstreamContext,
  }),
  inspectControlledExternalPublicationExecutionAcceptanceMemory(acceptanceMemory, { policy: acceptancePolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (acceptancePolicy.trustedExternalExecutors.length) fail("executor externo real foi inventado");
if (grantMemory.entries.length || consumptionMemory.entries.length || handoffMemory.entries.length || acceptanceMemory.entries.length) fail("concessão, consumo, handoff ou decisão canônica foi inventada");

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
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedExternalExecutorsConfigured",
  "recordedHandoffs",
  "recordedAcceptanceDecisions",
  "accepted",
  "rejected",
  "distinctHandoffs",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "handoffPrepared",
  "executionAccepted",
  "publicationExecutionPermitted",
  "publicationExecuted",
  "externalPublicationExecuted",
  "packageGenerated",
  "buildExecuted",
  "deployExecuted",
  "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (acceptancePolicy.executionAcceptanceAllowed !== true) fail("aceitação de execução não habilitada");
if (acceptancePolicy.publicationExecutionAllowed !== false) fail("execução de publicação habilitada antecipadamente");
if (acceptancePolicy.maximumAcceptanceDelayMs > 300000) fail("prazo de aceitação excede cinco minutos");
for (const key of [
  "networkAccessAllowed",
  "databaseMutationAllowed",
  "externalPublicationAllowed",
  "automaticPublicationExecution",
  "automaticPackageGeneration",
  "automaticBuild",
  "automaticDeploy",
  "automaticReleasePromotion",
]) if (acceptancePolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "external_publication_execution_acceptance_wrong_target_executor",
  "external_publication_execution_handoff_decision_already_recorded",
  "external_publication_execution_acceptance_after_handoff_expiration",
  "external_publication_execution_acceptance_not_recorded",
  "external_publication_execution_acceptance_memory_head_binding_mismatch",
  "executionAccepted: decision === \"accepted\"",
  "publicationExecutionPermitted: false",
  "externalPublicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 224) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-224:assess", "evolution:phase-224:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-224] PASS — somente o executor externo direcionado pode aceitar ou rejeitar o handoff com decisão assinada e terminal; publicação, rede, build, deploy e promoção permanecem bloqueados.");
