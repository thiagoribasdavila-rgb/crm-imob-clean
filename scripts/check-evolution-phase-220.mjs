import { existsSync, readFileSync } from "node:fs";
import {
  inspectControlledExternalPublicationAuthorizationReviewMemory,
  inspectControlledExternalPublicationAuthorizationReviewPolicy,
} from "../lib/release/controlled-external-publication-authorization-review.mjs";
import {
  inspectPublicationExecutionEvidenceAdjudicationMemory,
  inspectPublicationExecutionEvidenceAdjudicationPolicy,
} from "../lib/release/publication-execution-evidence-adjudication.mjs";

const fail = (message) => { throw new Error(`[phase-220] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const paths = {
  phase: "config/evolution-phase-220-controlled-external-publication-authorization-review.json",
  reviewPolicy: "config/controlled-external-publication-authorization-review-policy.json",
  reviewMemory: "config/controlled-external-publication-authorization-review-memory.json",
  adjudicationPolicy: "config/publication-execution-evidence-adjudication-policy.json",
  adjudicationMemory: "config/publication-execution-evidence-adjudication-memory.json",
  documentation: "docs/EVOLUTION_PHASE_220_CONTROLLED_EXTERNAL_PUBLICATION_AUTHORIZATION_REVIEW.md",
  library: "lib/release/controlled-external-publication-authorization-review.mjs",
  runner: "scripts/run-controlled-external-publication-authorization-review-phase-220.mjs",
  test: "tests/contracts/controlled-external-publication-authorization-review.test.mjs",
};
for (const path of Object.values(paths)) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(paths.phase);
const authorizationReviewPolicy = readJson(paths.reviewPolicy);
const authorizationReviewMemory = readJson(paths.reviewMemory);
const evidenceAdjudicationPolicy = readJson(paths.adjudicationPolicy);
const evidenceAdjudicationMemory = readJson(paths.adjudicationMemory);
const executionPolicy = readJson("config/authorized-publication-execution-policy.json");
const executionAuthorizationPolicy = readJson("config/authorized-publication-execution-authorization-policy.json");
const publicationPolicy = readJson("config/authorized-package-publication-decision-policy.json");
const evidencePolicy = readJson("config/authorized-package-evidence-commitment-policy.json");
const assemblyPolicy = readJson("config/authorized-release-package-assembly-policy.json");
const packageAuthorizationPolicy = readJson("config/approved-release-package-authorization-policy.json");
const context = { executionPolicy, executionAuthorizationPolicy, publicationPolicy, evidencePolicy, assemblyPolicy, packageAuthorizationPolicy };

if (phase.phase !== 220 || phase.status !== "implemented") fail("fase ou status inválido");
const inspections = [
  inspectPublicationExecutionEvidenceAdjudicationPolicy(evidenceAdjudicationPolicy, context),
  inspectPublicationExecutionEvidenceAdjudicationMemory(evidenceAdjudicationMemory, { policy: evidenceAdjudicationPolicy }),
  inspectControlledExternalPublicationAuthorizationReviewPolicy(authorizationReviewPolicy, {
    publicationEvidenceAdjudicationPolicy: evidenceAdjudicationPolicy,
    ...context,
  }),
  inspectControlledExternalPublicationAuthorizationReviewMemory(authorizationReviewMemory, { policy: authorizationReviewPolicy }),
];
const failed = inspections.find((item) => !item.ok);
if (failed) fail(`contexto canônico inválido: ${failed.reason}`);

if (evidenceAdjudicationPolicy.trustedAdjudicators.length || authorizationReviewPolicy.trustedReviewers.length) fail("julgador ou revisor real foi inventado");
if (evidenceAdjudicationMemory.entries.length || authorizationReviewMemory.entries.length) fail("adjudicação ou revisão canônica foi inventada");

const bindings = {
  evidenceAdjudicationPolicyHash: evidenceAdjudicationPolicy.policyHash,
  evidenceAdjudicationMemoryHash: evidenceAdjudicationMemory.memoryHash,
  authorizationReviewPolicyHash: authorizationReviewPolicy.policyHash,
  authorizationReviewMemoryHash: authorizationReviewMemory.memoryHash,
};
for (const [key, value] of Object.entries(bindings)) if (phase.currentState[key] !== value) fail(`vínculo divergente: ${key}`);
for (const key of [
  "trustedAuthorizationReviewersConfigured",
  "recordedAdjudications",
  "acceptedEvidence",
  "rejectedEvidence",
  "recordedAuthorizationReviews",
  "eligibleProofs",
  "ineligibleProofs",
]) if (phase.currentState[key] !== 0) fail(`${key} inventado`);
for (const key of [
  "authorizationEligibilityReviewed",
  "eligibleForAuthorizationGrant",
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
]) if (authorizationReviewPolicy[key] !== false) fail(`${key} habilitado indevidamente`);

const source = readFileSync(paths.library, "utf8");
for (const marker of [
  "external_publication_authorization_reviewer_must_be_independent",
  "evidence_adjudicator_cannot_review_own_authorization_eligibility",
  "accepted_recorded_evidence_required_for_authorization_eligibility",
  "publication_evidence_adjudication_decision_not_recorded",
  "publication_evidence_decision_already_reviewed",
  "externalPublicationAuthorized: false",
  "externalPublicationExecuted: false",
]) if (!source.includes(marker)) fail(`proteção ausente: ${marker}`);
if (readJson("config/evolution-program-3000.json").currentPhase < 220) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-220:assess", "evolution:phase-220:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log("[phase-220] PASS — somente prova aceita e registrada pode ser declarada elegível por revisor independente; a revisão é assinada e append-only, mas não concede nem executa publicação externa, build, deploy ou promoção.");
