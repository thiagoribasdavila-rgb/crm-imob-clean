import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";
const email = process.env.ATLAS_TEST_EMAIL || "";
const password = process.env.ATLAS_TEST_PASSWORD || "";
const outputPath =
  process.env.ATLAS_PHASE_361_EVIDENCE_PATH ||
  "artifacts/runtime/phase-361/lead-intake-dimensions.json";

const required = { baseUrl, supabaseUrl, supabaseKey, email, password };
const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  console.error(
    `Phase 361 evidence not captured: missing ${missing.join(", ")}.`,
  );
  process.exit(2);
}

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl);
if (!baseUrl.startsWith("https://") && !isLocal) {
  throw new Error("ATLAS_BASE_URL must use HTTPS outside localhost.");
}

const authResponse = await fetch(
  `${supabaseUrl}/auth/v1/token?grant_type=password`,
  {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  },
);
assert.equal(authResponse.ok, true, "Authenticated evidence user is required.");
const auth = await authResponse.json();
assert.equal(typeof auth.access_token, "string");

const headers = { Authorization: `Bearer ${auth.access_token}` };
const identityResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
  headers,
  cache: "no-store",
});
assert.equal(identityResponse.ok, true, "Identity endpoint must be available.");
const identityEnvelope = await identityResponse.json();
const identity = identityEnvelope.data || identityEnvelope;
assert.ok(identity.organizationId, "Organization context is required.");
assert.ok(
  ["admin", "director", "superintendent", "manager"].includes(
    String(identity.role || "").toLowerCase(),
  ),
  "Management role is required for aggregate evidence.",
);

const response = await fetch(
  `${baseUrl}/api/v1/analytics/lead-intake?days=14`,
  { headers, cache: "no-store" },
);
assert.equal(response.ok, true, "Lead intake analytics must be available.");
const envelope = await response.json();
assert.equal(envelope.ok, true);
const data = envelope.data;
assert.ok(data);
assert.equal(data.scope.organizationId, identity.organizationId);
assert.equal(data.scope.hierarchyApplied, true);
assert.equal(data.scope.personalDataReturned, false);

for (const key of [
  "byDay",
  "byBroker",
  "byProject",
  "bySource",
  "byCampaign",
  "byDeveloper",
]) {
  assert.ok(Array.isArray(data[key]), `${key} must be an array.`);
}

const sampleSize = Number(data.baseline?.sampleSize || 0);
for (const key of ["byProject", "bySource", "byCampaign", "byDeveloper"]) {
  const dimensionTotal = data[key].reduce(
    (sum, row) => sum + Number(row.leads || 0),
    0,
  );
  assert.equal(
    dimensionTotal,
    sampleSize,
    `${key} must reconcile with the operational baseline.`,
  );
}

const dimensionSummary = (rows, idKey) => ({
  groups: rows.length,
  identifiedLeads: rows.reduce(
    (sum, row) => sum + (row[idKey] ? Number(row.leads || 0) : 0),
    0,
  ),
  unidentifiedLeads: rows.reduce(
    (sum, row) => sum + (!row[idKey] ? Number(row.leads || 0) : 0),
    0,
  ),
});

const evidence = {
  schema: "atlas.phase-361-lead-intake-dimensions.v1",
  status: "authenticated_dimension_snapshot_captured",
  capturedAt: new Date().toISOString(),
  scope: {
    hierarchyApplied: true,
    personalDataReturned: false,
    remoteMutation: false,
  },
  sampleSize,
  dimensions: {
    projects: dimensionSummary(data.byProject, "developmentId"),
    campaigns: dimensionSummary(data.byCampaign, "campaignId"),
    developers: dimensionSummary(data.byDeveloper, "developerId"),
    sources: { groups: data.bySource.length, leads: sampleSize },
    brokers: {
      groups: data.byBroker.length,
      receiptsPeriod: data.byBroker.reduce(
        (sum, row) => sum + Number(row.totalPeriod || 0),
        0,
      ),
    },
  },
  warnings: Array.isArray(data.warnings) ? data.warnings.length : 0,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence));
