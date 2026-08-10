import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateLeadRoundtripHomologationPlan } from "./preflight-lead-roundtrip-homologation.mjs";

const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const stageRank = { novo: 0, contato: 1, qualificacao: 2, visita: 3, proposta: 4, contrato: 5, ganho: 6 };

export function runLeadRoundtripLocalRehearsal(plan) {
  const validation = validateLeadRoundtripHomologationPlan(plan);
  if (!validation.approved) throw new Error(`unsafe_plan:${validation.issues.join(",")}`);

  const scenario = {
    organizationReference: plan.tenancy.organizationReference,
    leadReference: "synthetic-lead-001",
    brokerReference: "synthetic-broker-001",
    copilotReference: "synthetic-copilot-001",
    fingerprint: hash(`${plan.scenarioReference}:synthetic-contact-token`)
  };
  const store = { leads: [], activities: [], stageHistory: [], fingerprints: new Set() };
  const audit = [];

  const intake = (candidate) => {
    if (store.fingerprints.has(candidate.fingerprint)) {
      audit.push({ step: "deduplication", result: "duplicate_blocked", leadReference: candidate.leadReference });
      return { created: false, reason: "duplicate" };
    }
    store.fingerprints.add(candidate.fingerprint);
    store.leads.push({ leadReference: candidate.leadReference, organizationReference: candidate.organizationReference, stage: "novo" });
    audit.push({ step: "intake", result: "created", leadReference: candidate.leadReference });
    return { created: true };
  };

  const firstIntake = intake(scenario);
  const duplicateIntake = intake(scenario);
  const lead = store.leads[0];
  const tenantResolved = lead?.organizationReference === scenario.organizationReference && plan.tenancy.crossTenantAccessAllowed === false;

  const assignment = { brokerReferences: [scenario.brokerReference], copilotReferences: [scenario.copilotReference] };
  const uniqueAssignment = assignment.brokerReferences.length === 1 && assignment.copilotReferences.length === 1;
  audit.push({ step: "unique_assignment", result: uniqueAssignment ? "single_owner_confirmed" : "invalid" });

  store.activities.push({ leadReference: scenario.leadReference, type: "synthetic_follow_up", nextAction: "human_review_required" });
  audit.push({ step: "commercial_activity", result: "activity_and_next_action_recorded" });

  for (const nextStage of ["contato", "qualificacao"]) {
    const previousStage = lead.stage;
    if (stageRank[nextStage] <= stageRank[previousStage]) throw new Error("non_forward_pipeline_progression");
    lead.stage = nextStage;
    store.stageHistory.push({ leadReference: scenario.leadReference, previousStage, stage: nextStage });
  }
  audit.push({ step: "pipeline_progression", result: "canonical_forward_history_preserved" });

  const aggregateSignal = {
    eventName: "QualifiedLead",
    eventReference: `crm-stage-${scenario.leadReference}-qualificacao`,
    previousStage: "contato",
    stage: "qualificacao",
    emitted: false,
    customerDataIncluded: false
  };
  audit.push({ step: "aggregate_signal_mapping", result: "signal_prepared_without_emission" });

  const beforeCleanup = { leads: store.leads.length, activities: store.activities.length, history: store.stageHistory.length };
  store.leads.length = 0;
  store.activities.length = 0;
  store.stageHistory.length = 0;
  store.fingerprints.clear();
  const cleanupVerified = store.leads.length === 0 && store.activities.length === 0 && store.stageHistory.length === 0 && store.fingerprints.size === 0;
  audit.push({ step: "cleanup", result: cleanupVerified ? "in_memory_state_cleared" : "failed" });

  const passed = firstIntake.created === true
    && duplicateIntake.created === false
    && tenantResolved
    && uniqueAssignment
    && beforeCleanup.leads === 1
    && beforeCleanup.activities === 1
    && beforeCleanup.history === 2
    && aggregateSignal.emitted === false
    && aggregateSignal.customerDataIncluded === false
    && cleanupVerified;

  return {
    schema: "atlas.lead-roundtrip-local-rehearsal-receipt.v1",
    status: passed ? "local_rehearsal_passed_real_evidence_pending" : "local_rehearsal_failed",
    scenarioReference: plan.scenarioReference,
    scenarioFingerprint: hash(`${plan.scenarioReference}:${scenario.fingerprint}`),
    assertions: {
      syntheticIntakeAccepted: firstIntake.created === true,
      duplicateBlocked: duplicateIntake.created === false,
      tenantResolved,
      singleBroker: assignment.brokerReferences.length === 1,
      singleCopilot: assignment.copilotReferences.length === 1,
      activityAndNextActionRecorded: beforeCleanup.activities === 1,
      forwardPipelineHistoryRecorded: beforeCleanup.history === 2,
      aggregateSignalPrepared: aggregateSignal.eventName === "QualifiedLead",
      signalNotEmitted: aggregateSignal.emitted === false,
      cleanupVerified
    },
    audit,
    safety: {
      personalDataUsed: false,
      databaseTouched: false,
      stagingTouched: false,
      productionTouched: false,
      metaTouched: false,
      providerPayloadUsed: false
    },
    release: {
      realLeadRoundTripValidated: false,
      realRehearsalAllowed: false,
      metaTestAllowed: false,
      productionAllowed: false,
      zipAllowed: false
    }
  };
}

if (process.argv[1]?.endsWith("run-lead-roundtrip-local-rehearsal.mjs")) {
  const plan = JSON.parse(readFileSync(new URL("../config/fixtures/lead-roundtrip-homologation-template.json", import.meta.url), "utf8"));
  const receipt = runLeadRoundtripLocalRehearsal(plan);
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(receipt.status === "local_rehearsal_passed_real_evidence_pending" ? 0 : 1);
}
