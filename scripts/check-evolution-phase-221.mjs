import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationAuthorizationGrantMemory,
  inspectControlledExternalPublicationAuthorizationGrantPolicy,
} from "../lib/release/controlled-external-publication-authorization-grant.mjs";
import {
  inspectControlledExternalPublicationAuthorizationReviewMemory,
  inspectControlledExternalPublicationAuthorizationReviewPolicy,
} from "../lib/release/controlled-external-publication-authorization-review.mjs";

const fail = (message) => { throw new Error(`[phase-221] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-221-controlled-external-publication-authorization-grant.json",
  grantPolicy: "config/controlled-external-publication-authorization-grant-policy.json",
  grantMemory: "config/controlled-external-publication-authorization-grant-memory.json",
  reviewPolicy: "config/controlled-external-publication-authorization-review-policy.json",
  reviewMemory: "config/controlled-external-publication-authorization-review-memory.json",
  documentation: "docs/EVOLUTION_PHASE_221_CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_GRANT.md",
  library: "lib/release/controlled-external-publication-authorization-grant.mjs",
  runner: "scripts/run-controlled-external-publication-authorization-grant-phase-221.mjs",
  test: "tests/contracts/controlled-external-publication-authorization-grant.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const authorizationGrantPolicy = readJson(paths.grantPolicy);
const authorizationGrantMemory = readJson(paths.grantMemory);
const controlledExternalPublicationReviewPolicy = readJson(paths.reviewPolicy);
const controlledExternalPublicationReviewMemory = readJson(paths.reviewMemory);
const publicationEvidenceAdjudicationPolicy = readJson("config/publication-execution-evidence-adjudication-policy.json");
const executionPolicy = readJson("config/authorized-publication-execution-policy.json");
const executionAuthorizationPolicy = readJson("config/authorized-publication-execution-authorization-policy.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const context = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };

if (phase.phase !== 221 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectControlledExternalPublicationAuthorizationReviewPolicy(controlledExternalPublicationReviewPolicy, {
    publicationEvidenceAdjudicationPolicy,
    ...context,
  }),
  inspectControlledExternalPublicationAuthorizationReviewMemory(controlledExternalPublicationReviewMemory, {
    policy: controlledExternalPublicationReviewPolicy,
  }),
  inspectControlledExternalPublicationAuthorizationGrantPolicy(authorizationGrantPolicy, {
    controlledExternalPublicationReviewPolicy,
    publicationEvidenceAdjudicationPolicy,
    ...context,
  }),
  inspectControlledExternalPublicationAuthorizationGrantMemory(authorizationGrantMemory, {
    policy: authorizationGrantPolicy,
  }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (controlledExternalPublicationReviewPolicy.trustedReviewers.length || authorizationGrantPolicy.trustedGrantors.length) fail("revisor ou concedente real foi inventado");
if (controlledExternalPublicationReviewMemory.entries.length || authorizationGrantMemory.entries.length) fail("revisão ou concessão canônica foi inventada");

const bindings = {
  authorizationReviewPolicyHash: controlledExternalPublicationReviewPolicy.policyHash,
  authorizationReviewMemoryHash: controlledExternalPublicationReviewMemory.memoryHash,
  authorizationGrantPolicyHash: authorizationGrantPolicy.policyHash,
  authorizationGrantMemoryHash: authorizationGrantMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedAuthorizationGrantorsConfigured",
  "recordedAuthorizationReviews",
  "eligibleProofs",
  "ineligibleProofs",
  "recordedAuthorizationGrants",
  "authorizedGrants",
  "deniedGrants",
  "unconsumedSingleUseGrants",
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

if (authorizationGrantPolicy.externalPublicationAuthorizationGrantAllowed !== true) fail("contrato de concessão não habilitado");
if (authorizationGrantPolicy.maximumUses !== 1) fail("concessão não limitada a uso único");
for (const key of [
  "networkAccessAllowed",
  "databaseMutationAllowed",
  "externalPublicationAllowed",
  "automaticAuthorizationConsumption",
  "automaticPackageGeneration",
  "automaticBuild",
  "automaticDeploy",
  "automaticReleasePromotion",
]) if (authorizationGrantPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "external_publication_authorization_grantor_must_be_independent",
  "authorization_reviewer_cannot_grant_own_review",
  "eligible_recorded_review_required_for_external_publication_authorization_grant",
  "external_publication_authorization_review_not_recorded",
  "external_publication_authorization_review_already_granted",
  "singleUse: true",
  "authorizationConsumed: false",
  "externalPublicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 221) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-221:assess", "evolution:phase-221:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-221] PASS — somente revisão elegível e registrada pode receber concessão externa curta, assinada, independente e de uso único; a autorização permanece não consumida e nenhuma publicação, rede, build, deploy ou promoção é executada.");
