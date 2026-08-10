import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationAuthorizationConsumptionMemory,
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy,
} from "../lib/release/controlled-external-publication-authorization-consumption.mjs";
import {
  inspectControlledExternalPublicationAuthorizationGrantMemory,
  inspectControlledExternalPublicationAuthorizationGrantPolicy,
} from "../lib/release/controlled-external-publication-authorization-grant.mjs";

const fail = (message) => { throw new Error(`[phase-222] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-222-controlled-external-publication-authorization-consumption.json",
  consumptionPolicy: "config/controlled-external-publication-authorization-consumption-policy.json",
  consumptionMemory: "config/controlled-external-publication-authorization-consumption-memory.json",
  grantPolicy: "config/controlled-external-publication-authorization-grant-policy.json",
  grantMemory: "config/controlled-external-publication-authorization-grant-memory.json",
  reviewPolicy: "config/controlled-external-publication-authorization-review-policy.json",
  documentation: "docs/EVOLUTION_PHASE_222_CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_CONSUMPTION.md",
  library: "lib/release/controlled-external-publication-authorization-consumption.mjs",
  runner: "scripts/run-controlled-external-publication-authorization-consumption-phase-222.mjs",
  test: "tests/contracts/controlled-external-publication-authorization-consumption.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
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
const context = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };
const grantContext = { controlledExternalPublicationReviewPolicy: reviewPolicy, publicationEvidenceAdjudicationPolicy, ...context };

if (phase.phase !== 222 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledExternalPublicationAuthorizationGrantPolicy(grantPolicy, grantContext),
  inspectControlledExternalPublicationAuthorizationGrantMemory(grantMemory, { policy: grantPolicy }),
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy(consumptionPolicy, {
    controlledExternalPublicationAuthorizationGrantPolicy: grantPolicy,
    ...grantContext,
  }),
  inspectControlledExternalPublicationAuthorizationConsumptionMemory(consumptionMemory, { policy: consumptionPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (consumptionPolicy.trustedConsumers.length) fail("consumidor real foi inventado");
if (grantMemory.entries.length || consumptionMemory.entries.length) fail("concessão ou consumo canônico foi inventado");

const bindings = {
  authorizationReviewPolicyHash: reviewPolicy.policyHash,
  authorizationGrantPolicyHash: grantPolicy.policyHash,
  authorizationGrantMemoryHash: grantMemory.memoryHash,
  authorizationConsumptionPolicyHash: consumptionPolicy.policyHash,
  authorizationConsumptionMemoryHash: consumptionMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedAuthorizationConsumersConfigured",
  "recordedAuthorizationGrants",
  "authorizedGrants",
  "unconsumedSingleUseGrants",
  "recordedConsumptions",
  "consumedSingleUseGrants",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "externalPublicationAuthorized",
  "authorizationConsumed",
  "publicationExecuted",
  "externalPublicationExecuted",
  "packageGenerated",
  "buildExecuted",
  "deployExecuted",
  "releasePromoted",
]) if (phase.currentState[key] !== false) fail(`${key} marcado indevidamente`);
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");

if (consumptionPolicy.externalPublicationAuthorizationConsumptionAllowed !== true) fail("contrato de consumo não habilitado");
if (consumptionPolicy.maximumUses !== 1) fail("consumo não limitado a uso único");
for (const key of [
  "networkAccessAllowed",
  "databaseMutationAllowed",
  "externalPublicationAllowed",
  "automaticPublicationExecution",
  "automaticPackageGeneration",
  "automaticBuild",
  "automaticDeploy",
  "automaticReleasePromotion",
]) if (consumptionPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "external_publication_authorization_consumer_must_be_independent",
  "authorization_grantor_cannot_consume_own_grant",
  "external_publication_authorization_grant_already_consumed",
  "external_publication_authorization_consumption_after_expiration",
  "external_publication_authorization_grant_not_recorded",
  "external_publication_authorization_consumption_memory_head_binding_mismatch",
  "remainingUses: 0",
  "authorizationConsumed: true",
  "externalPublicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 222) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-222:assess", "evolution:phase-222:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-222] PASS — somente concessão externa positiva, registrada, válida e ainda não consumida pode gerar um recibo atômico assinado de uso único; nenhuma publicação, rede, build, deploy ou promoção é executada.");
