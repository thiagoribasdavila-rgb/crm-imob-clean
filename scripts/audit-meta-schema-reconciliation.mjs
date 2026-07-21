import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMetaSchemaReconciliationEvidence } from "./preflight-meta-schema-reconciliation.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => readFileSync(resolve(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const phase = readJson("config/meta-intelligence-phase-010.json");
const previous = readJson(phase.sourceBaseline);
const phaseEight = readJson(previous.sourceBaseline);
const baseline = readJson(phaseEight.baselineFixture);
const manifest = readJson(phase.reconciliationManifest);
const evidence = readJson(phase.executionEvidenceTemplate);
const bridge = read(phase.bridgeMigrationEvidence);
const compatibility = phase.compatibilityEvidence.map((file) => ({ file, source: read(file) }));
const evidenceResult = validateMetaSchemaReconciliationEvidence(evidence, manifest.requiredContractTests);
const bridgeWithoutComments = bridge.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const remoteProfileColumns = baseline.remoteColumns["public.profiles"] ?? [];
const remoteLeadColumns = baseline.remoteColumns["public.leads"] ?? [];

const hasScoreDefaultBeforeBackfill = /add column if not exists score integer not null default 0/i.test(bridge);
const scoreBackfillUsesCanonicalFirst = /set score\s*=\s*coalesce\(score\s*,\s*score_ia\s*,\s*0\)/i.test(bridge);
const explicitGrantOrRevoke = /\b(grant|revoke)\b/i.test(bridgeWithoutComments);
const syncTriggerPattern = /create\s+(or\s+replace\s+)?function[\s\S]*(assigned_user_id[\s\S]*assigned_to|project_id[\s\S]*development_id|score_ia[\s\S]*score)[\s\S]*create\s+trigger/i;
const allCompatibility = compatibility.map((item) => item.source).join("\n");

const report = {
  phase: phase.phase,
  mode: phase.mode,
  status: phase.status,
  bridge: {
    file: phase.bridgeMigrationEvidence,
    exists: true,
    additive: bridge.includes("add column if not exists"),
    transactional: /^\s*begin\s*;/i.test(bridge) && /\bcommit\s*;/i.test(bridge),
    historicalMigrationImmutable: manifest.historicalBridgeModificationAllowed === false,
    replaySafe: false
  },
  defects: {
    scoreDefaultInstalledBeforeLegacyBackfill: hasScoreDefaultBeforeBackfill,
    scoreBackfillReadsCanonicalBeforeLegacy: scoreBackfillUsesCanonicalFirst,
    legacyScoreCanBeMaskedByDefaultZero: hasScoreDefaultBeforeBackfill && scoreBackfillUsesCanonicalFirst,
    unknownRoleFallsBackToBroker: /else\s+'broker'\s+end/i.test(bridge),
    reportsToAutomaticallyInferable: false,
    explicitDataApiGrantsVersioned: explicitGrantOrRevoke,
    guardedDualWriteTriggerDetected: syncTriggerPattern.test(bridge)
  },
  compatibilityLayer: {
    files: compatibility.map((item) => item.file),
    mapsOwnerContracts: allCompatibility.includes('first(row, "assigned_to", "assigned_user_id")'),
    mapsProjectContracts: allCompatibility.includes('first(row, "development_id", "project_id")'),
    mapsScoreContracts: allCompatibility.includes('first(row, "score", "score_ia")'),
    mapsProfileNameContracts: allCompatibility.includes('first(row, "full_name", "name")'),
    applicationUsesLegacyAndCanonicalContracts: true
  },
  remoteBaseline: {
    profileColumns: remoteProfileColumns,
    leadColumns: remoteLeadColumns,
    legacyOwnerPresent: remoteLeadColumns.includes("assigned_user_id"),
    canonicalOwnerPresent: remoteLeadColumns.includes("assigned_to"),
    legacyRolePresent: remoteProfileColumns.includes("role"),
    canonicalRolePresent: remoteProfileColumns.includes("commercial_role"),
    separateStagingDetected: phaseEight.observedBaseline.separateStagingProjectDetected
  },
  manifest: {
    stageCount: manifest.orderedStages.length,
    rollbackCount: manifest.orderedStages.filter((item) => Boolean(item.rollback)).length,
    requiredTestCount: manifest.requiredContractTests.length,
    allStagesBlocked: manifest.orderedStages.every((item) => item.ready === false),
    correctedCliMigrationRequired: manifest.correctedMigrationRequired,
    historicalBridgeReplayAllowed: manifest.historicalBridgeReplayAllowed,
    productionExecutionAllowed: manifest.productionExecutionAllowed
  },
  executionEvidence: {
    approved: evidenceResult.approved,
    issueCodes: evidenceResult.issueCodes
  },
  readiness: {
    manifestComplete: manifest.orderedStages.length === 10 && manifest.requiredContractTests.length === 13,
    bridgeSafeToReplay: false,
    scoreBackfillSafe: !(hasScoreDefaultBeforeBackfill && scoreBackfillUsesCanonicalFirst),
    dualWriteReady: syncTriggerPattern.test(bridge),
    explicitDataApiGrantsReady: explicitGrantOrRevoke,
    isolatedStagingReady: false,
    correctedMigrationCreated: false,
    runtimeEvidenceApproved: false,
    migrationReady: false,
    deploymentReady: false
  },
  governance: phase.governance
};

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--strict-ready") && !report.readiness.deploymentReady) process.exit(1);
