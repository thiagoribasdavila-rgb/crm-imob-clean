import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationExecutionHandoffMemory,
  inspectControlledExternalPublicationExecutionHandoffPolicy,
} from "../lib/release/controlled-external-publication-execution-handoff.mjs";
import {
  inspectControlledExternalPublicationAuthorizationConsumptionMemory,
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy,
} from "../lib/release/controlled-external-publication-authorization-consumption.mjs";

const fail = (message) => { throw new Error(`[phase-223] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-223-controlled-external-publication-execution-handoff.json",
  handoffPolicy: "config/controlled-external-publication-execution-handoff-policy.json",
  handoffMemory: "config/controlled-external-publication-execution-handoff-memory.json",
  consumptionPolicy: "config/controlled-external-publication-authorization-consumption-policy.json",
  consumptionMemory: "config/controlled-external-publication-authorization-consumption-memory.json",
  grantPolicy: "config/controlled-external-publication-authorization-grant-policy.json",
  grantMemory: "config/controlled-external-publication-authorization-grant-memory.json",
  reviewPolicy: "config/controlled-external-publication-authorization-review-policy.json",
  documentation: "docs/EVOLUTION_PHASE_223_CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_HANDOFF.md",
  library: "lib/release/controlled-external-publication-execution-handoff.mjs",
  runner: "scripts/run-controlled-external-publication-execution-handoff-phase-223.mjs",
  test: "tests/contracts/controlled-external-publication-execution-handoff.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
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

if (phase.phase !== 223 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy(consumptionPolicy, upstreamContext),
  inspectControlledExternalPublicationAuthorizationConsumptionMemory(consumptionMemory, { policy: consumptionPolicy }),
  inspectControlledExternalPublicationExecutionHandoffPolicy(handoffPolicy, {
    controlledExternalPublicationAuthorizationConsumptionPolicy: consumptionPolicy,
    ...upstreamContext,
  }),
  inspectControlledExternalPublicationExecutionHandoffMemory(handoffMemory, { policy: handoffPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (handoffPolicy.trustedHandoffIssuers.length) fail("emissor de handoff real foi inventado");
if (handoffPolicy.trustedExternalExecutors.length) fail("executor externo real foi inventado");
if (grantMemory.entries.length || consumptionMemory.entries.length || handoffMemory.entries.length) fail("concessão, consumo ou handoff canônico foi inventado");

const bindings = {
  authorizationReviewPolicyHash: reviewPolicy.policyHash,
  authorizationGrantPolicyHash: grantPolicy.policyHash,
  authorizationGrantMemoryHash: grantMemory.memoryHash,
  authorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  authorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
  executionHandoffPolicyHash: handoffPolicy.policyHash,
  executionHandoffMemoryHash: handoffMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedHandoffIssuersConfigured",
  "trustedExternalExecutorsConfigured",
  "recordedConsumptions",
  "recordedHandoffs",
  "distinctConsumedAuthorizations",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "authorizationConsumed",
  "handoffPrepared",
  "executionAccepted",
  "publicationExecuted",
  "externalPublicationExecuted",
  "packageGenerated",
  "buildExecuted",
  "deployExecuted",
  "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (handoffPolicy.executionHandoffPreparationAllowed !== true) fail("preparação de handoff não habilitada");
if (handoffPolicy.executionAcceptanceAllowed !== false) fail("aceitação de execução habilitada antecipadamente");
if (handoffPolicy.maximumHandoffLifetimeMs > 300000) fail("validade de handoff excede cinco minutos");
for (const key of [
  "networkAccessAllowed",
  "databaseMutationAllowed",
  "externalPublicationAllowed",
  "automaticPublicationExecution",
  "automaticPackageGeneration",
  "automaticBuild",
  "automaticDeploy",
  "automaticReleasePromotion",
]) if (handoffPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "external_publication_execution_handoff_actors_must_be_independent",
  "handoff_issuer_and_external_executor_must_be_independent",
  "external_publication_execution_consumption_handoff_already_recorded",
  "external_publication_execution_handoff_before_authorization_consumption",
  "external_publication_execution_handoff_not_recorded",
  "external_publication_execution_handoff_memory_head_binding_mismatch",
  "handoffPrepared: true",
  "executionAccepted: false",
  "externalPublicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 223) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-223:assess", "evolution:phase-223:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-223] PASS — somente consumo registrado pode originar handoff assinado para executor externo independente; aceitação, publicação, rede, build, deploy e promoção permanecem bloqueados.");
