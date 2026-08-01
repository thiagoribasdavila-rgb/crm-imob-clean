import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-003.json"));
const conversions = read("lib/meta/conversions.ts");
const funnelLearning = read("lib/atlas/funnel-learning.ts");
const pipeline = read("app/api/v1/pipeline/route.ts");
const approvals = read("app/api/v2/approvals/[id]/route.ts");
const worker = read("app/api/v2/outbox/process/route.ts");
const conversionMigration = read("supabase/migrations/20260716223608_ai_cost_and_meta_conversions.sql");
const outboxMigration = read("supabase/migrations/20260711060000_atlas_level6_resilience.sql");

const has = (source, ...markers) => markers.every((marker) => source.includes(marker));
const safeError = (error) => ({
  category: error?.name || "AuditError",
  code: (typeof error?.code === "string" || typeof error?.code === "number") && String(error.code).trim()
    ? String(error.code)
    : "unavailable",
});

const eventMappings = Object.fromEntries(config.canonicalEvents.map((event) => {
  const implementation = event.eventName === "Lead"
    ? worker
    : event.eventName === "BuyerProfile"
      ? funnelLearning
      : conversions;
  return [event.eventName, {
    mapped: implementation.includes(`"${event.eventName}"`),
    sourceOfTruthDeclared: Boolean(event.sourceOfTruth),
    eventIdTemplateDeclared: Boolean(event.eventIdTemplate),
    evidenceRulesDeclared: event.minimumEvidence.length > 0,
  }];
}));

const staticAudit = {
  contract: {
    versioned: config.contractVersion === "atlas-meta-crm-v1",
    canonicalEvents: Object.keys(eventMappings).length,
    everyEventMapped: Object.values(eventMappings).every((event) => event.mapped),
    everyEventHasSourceOfTruth: Object.values(eventMappings).every((event) => event.sourceOfTruthDeclared),
    everyEventHasEvidenceRule: Object.values(eventMappings).every((event) => event.evidenceRulesDeclared),
  },
  deduplication: {
    databaseUniqueConstraint: has(conversionMigration, "unique (organization_id, event_id)"),
    conflictTargetMatchesConstraint: has(conversions, 'onConflict: "organization_id,event_id"', "ignoreDuplicates: true"),
    eventIdForwardedUnchanged: has(worker, "event_id: conversion.event_id"),
    stageEventIdStable: has(conversions, "crm-stage-${input.leadId}-${normalizedStage}"),
    leadEventIdStable: has(worker, "meta-lead-${metaEvent.external_lead_id}"),
    oneSignalPerLeadMilestone: config.deduplication.oneSignalPerLeadMilestone === true,
  },
  eligibility: {
    configurationMustBeEnabled: has(conversions, "!config?.enabled"),
    queueRestrictedToTestMode: has(conversions, 'config.mode !== "test"'),
    deliveryRestrictedToTestMode: has(worker, 'config.mode !== "test"', "!config.test_event_code"),
    consentCheckedBeforeQueue: has(conversions, "dataSharingConsent !== true"),
    consentCheckedBeforeDelivery: has(worker, "dataSharingConsent !== true"),
    matchKeyCheckedBeforeDelivery: has(worker, "!userData.em && !userData.ph"),
    identifiersHashedServerSide: has(worker, "hashMetaValue(lead.email)", "hashMetaValue(phone)", "external_id"),
    forwardProgressionOnly: has(conversions, "stageRank <= previousRank", "not_forward_progression"),
    regressionInternalOnly: has(funnelLearning, "regression_internal_only", "negative_signal_internal_only"),
    externalPurchaseNotCountedAsAtlasSale: has(funnelLearning, 'eventName: "BuyerProfile"') && !has(funnelLearning, 'buyerElsewhere', 'eventName: "ConvertedLead"'),
  },
  evidence: {
    pipelineHistoryCreatedBeforeLearning: pipeline.indexOf('.from("pipeline_history")') < pipeline.indexOf("recordFunnelLearning({"),
    proposalApprovalCanProduceEvidence: has(approvals, "decide_commercial_proposal", "recordFunnelLearning({"),
    conversionPersistsSourceEvidenceId: has(conversionMigration, "source_event_id") || has(conversions, "source_event_id"),
    conversionPersistsConsentSnapshot: has(conversionMigration, "consent_snapshot") || has(conversions, "consent_snapshot"),
    confirmedOutcomeRequiredForWon: has(conversions, "confirmed_commercial_outcome") || has(funnelLearning, "confirmed_commercial_outcome"),
  },
  delivery: {
    outboxTopic: has(conversions, 'topic: "meta.conversion.send"'),
    outboxTenantScoped: has(outboxMigration, "organization_id", "tenant outbox isolation"),
    retryAndDeadLetter: has(worker, "attempts >= 5", 'status: terminal ? "dead_letter" : "failed"'),
    sameEventIdOnRetry: has(worker, "event_id: conversion.event_id"),
    productionBlocked: has(conversionMigration, "check (mode = 'test')") && has(worker, "Conversões Meta permanecem bloqueadas fora do modo de teste."),
  },
};

async function auditRuntime() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { status: "not_verified", reason: "supabase_credentials_unavailable" };
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [configs, events, outbox] = await Promise.all([
    supabase.from("meta_conversion_configs").select("mode,enabled,consent_required,test_event_code").limit(1000),
    supabase.from("meta_conversion_events").select("organization_id,event_id,event_name,status").limit(30_000),
    supabase.from("integration_outbox").select("status", { count: "exact" }).eq("topic", "meta.conversion.send").limit(1),
  ]);
  const errors = [configs.error, events.error, outbox.error].filter(Boolean);
  if (errors.length) return { status: "blocked", errors: errors.map(safeError) };
  const seen = new Set();
  let duplicateRows = 0;
  for (const event of events.data || []) {
    const key = `${event.organization_id}:${event.event_id}`;
    if (seen.has(key)) duplicateRows += 1;
    seen.add(key);
  }
  return {
    status: "verified_read_only",
    configs: {
      total: configs.data?.length || 0,
      testOnly: (configs.data || []).every((item) => item.mode === "test"),
      consentRequired: (configs.data || []).every((item) => item.consent_required === true),
      enabledWithTestCode: (configs.data || []).filter((item) => item.enabled && item.test_event_code).length,
    },
    events: {
      total: events.data?.length || 0,
      duplicateRows,
      unexpectedEventNames: [...new Set((events.data || []).map((item) => item.event_name).filter((name) => !config.canonicalEvents.some((event) => event.eventName === name)))].length,
    },
    outbox: { conversionRows: outbox.count || 0 },
  };
}

const runtime = await auditRuntime().catch((error) => ({ status: "failed_read_only", error: safeError(error) }));
const staticSections = [staticAudit.contract, staticAudit.deduplication, staticAudit.eligibility, staticAudit.delivery];
const staticReady = staticSections.every((section) => Object.values(section).every((value) => value === true || typeof value === "number"));
const evidenceReady = Object.values(staticAudit.evidence).every(Boolean);
const runtimeReady = runtime.status === "verified_read_only" && runtime.events?.duplicateRows === 0 && runtime.events?.unexpectedEventNames === 0;

console.log(JSON.stringify({
  phase: config.phase,
  mode: config.mode,
  staticAudit,
  runtime,
  readiness: {
    staticContractReady: staticReady,
    sourceEvidenceReady: evidenceReady,
    runtimeReady,
    safeForSingleTestEvent: staticReady && evidenceReady && runtimeReady,
    productionDeliveryEnabled: false,
  },
  blockers: [
    ...(!evidenceReady ? ["source_evidence_not_persisted"] : []),
    ...(runtime.status !== "verified_read_only" ? ["runtime_schema_not_ready"] : []),
    ...(runtime.events?.duplicateRows ? ["runtime_duplicates_detected"] : []),
  ],
  governance: {
    identifiersPrinted: false,
    personalDataPrinted: false,
    secretsPrinted: false,
    campaignMutation: false,
    databaseMutation: false,
    realEventDelivered: false,
  },
}, null, 2));
