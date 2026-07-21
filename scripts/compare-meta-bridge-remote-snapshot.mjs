import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMetaBridgeSnapshot } from "./preflight-meta-bridge-isolated.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const phase5 = readJson("config/meta-intelligence-phase-005.json");
const phase7 = readJson("config/meta-intelligence-phase-007.json");

const flagIndex = process.argv.indexOf("--snapshot");
const snapshotFile = flagIndex >= 0 && process.argv[flagIndex + 1]
  ? resolve(process.cwd(), process.argv[flagIndex + 1])
  : resolve(root, phase7.collectionContract.sanitizedSnapshot);
const snapshot = JSON.parse(readFileSync(snapshotFile, "utf8"));
const objects = new Map((snapshot.objects ?? []).map((item) => [item.name, item]));
const functions = new Map((snapshot.functions ?? []).map((item) => [item.name, item]));

const canonicalSources = Object.values(phase5.canonicalSources)
  .filter((source) => !source.endsWith("()"));
const targetObjects = phase5.accessMatrix.map((item) => item.object);
const requiredHelpers = new Set();
for (const contract of phase5.bridgeContracts ?? []) {
  if (!String(contract.kind).includes("helper")) continue;
  for (const candidate of [contract.source, contract.target]) {
    const value = String(candidate ?? "");
    if (/^private\.[a-z_][a-z0-9_]*\([^)]*\)$/i.test(value)) {
      requiredHelpers.add(value.replace(/\([^)]*\)$/, ""));
    }
  }
}
for (const source of Object.values(phase5.canonicalSources)) {
  if (source.endsWith("()")) requiredHelpers.add(source.replace(/\(\)$/, ""));
}

const preflight = validateMetaBridgeSnapshot(snapshot);
const canonicalDetected = canonicalSources.filter((name) => objects.has(name));
const targetDetected = targetObjects.filter((name) => objects.has(name));
const canonicalWithRls = canonicalDetected.filter((name) => objects.get(name)?.rlsEnabled === true);
const broadAnonSources = canonicalDetected.filter((name) => (objects.get(name)?.grants?.anon ?? []).length > 0);
const helpersDetected = [...requiredHelpers].filter((name) => functions.has(name));
const unsafeDefiners = [...functions.values()].filter((fn) => fn.securityDefiner && fn.searchPath !== "");
const sanitizationValid = snapshot.collection?.catalogOnly === true
  && snapshot.collection?.businessRowsRead === false
  && snapshot.collection?.personalDataRead === false
  && snapshot.collection?.secretsRead === false;

const report = {
  phase: phase7.phase,
  mode: phase7.mode,
  collection: {
    valid: sanitizationValid,
    catalogOnly: snapshot.collection?.catalogOnly === true,
    businessRowsRead: snapshot.collection?.businessRowsRead === true,
    personalDataRead: snapshot.collection?.personalDataRead === true,
    secretsRead: snapshot.collection?.secretsRead === true,
    projectIdentifiersPersisted: false,
  },
  baseline: {
    postgresMajor: snapshot.postgresMajor,
    canonicalSources: { expected: canonicalSources.length, detected: canonicalDetected.length },
    targetObjects: { expected: targetObjects.length, detected: targetDetected.length },
    canonicalSourcesWithRls: canonicalWithRls.length,
    canonicalSourcesWithBroadAnonGrants: broadAnonSources.length,
    requiredHelpers: { expected: requiredHelpers.size, detected: helpersDetected.length },
    unsafeSecurityDefiners: unsafeDefiners.length,
    dataApiExposureVerified: snapshot.exposure?.verifiedFromDataApiSettings === true,
    isolationScenariosExecuted: (snapshot.isolationScenarios ?? []).length,
  },
  compatibility: {
    approved: preflight.ok,
    issueCount: preflight.issues.length,
    issueCodes: [...new Set(preflight.issues.map((issue) => issue.code))].sort(),
  },
  readiness: {
    remoteCatalogCollected: true,
    remoteCatalogSanitized: sanitizationValid,
    bridgeImplemented: targetDetected.length === targetObjects.length,
    stagingSnapshotApproved: false,
    tenantIsolationApproved: false,
    migrationReady: false,
    deploymentReady: false,
  },
  governance: {
    databaseMutation: false,
    migrationApplication: false,
    businessRowsRead: false,
    personalDataPrinted: false,
    secretsPrinted: false,
    projectIdentifiersPrinted: false,
  },
};

console.log(JSON.stringify(report, null, 2));

if (!sanitizationValid) process.exit(1);
if (process.argv.includes("--strict-ready") && !report.readiness.deploymentReady) process.exit(1);
