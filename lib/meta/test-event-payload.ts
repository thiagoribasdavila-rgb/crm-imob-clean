import { createHash } from "node:crypto";
import type { MetaLeadCandidate } from "@/lib/meta/test-lead-candidate";

export const META_TEST_PAYLOAD_SCHEMA = "atlas.meta.test-event.v1";

export type FrozenMetaTestPayload = {
  actionSource: "system_generated";
  approvalId: string;
  approvedContextFingerprint: string;
  deliveryAuthorized: false;
  eventName: "Lead";
  externalEventSent: false;
  leadId: string;
  projectName: string;
  schemaVersion: typeof META_TEST_PAYLOAD_SCHEMA;
  source: string;
};

export function metaCandidateContext(candidate: MetaLeadCandidate) {
  return {
    hasConsent: candidate.hasConsent,
    hasEmail: candidate.hasEmail,
    hasOrigin: candidate.hasOrigin,
    hasPhone: candidate.hasPhone,
    id: candidate.id,
    projectName: candidate.projectName,
    readinessPct: candidate.readinessPct,
    source: candidate.source,
  };
}

export function fingerprintMetaCandidate(candidate: MetaLeadCandidate) {
  return createHash("sha256")
    .update(JSON.stringify(metaCandidateContext(candidate)))
    .digest("hex");
}

export function buildFrozenMetaTestPayload(
  candidate: MetaLeadCandidate,
  approvalId: string,
  approvedContextFingerprint: string,
): FrozenMetaTestPayload {
  return {
    actionSource: "system_generated",
    approvalId,
    approvedContextFingerprint,
    deliveryAuthorized: false,
    eventName: "Lead",
    externalEventSent: false,
    leadId: candidate.id,
    projectName: candidate.projectName,
    schemaVersion: META_TEST_PAYLOAD_SCHEMA,
    source: candidate.source,
  };
}

export function fingerprintFrozenMetaTestPayload(payload: FrozenMetaTestPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
