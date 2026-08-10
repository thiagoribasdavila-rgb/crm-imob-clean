import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");
const worker = read("app/api/v2/outbox/process/route.ts");
const webhook = read("app/api/webhooks/meta/route.ts");
const dashboard = read("app/api/v1/integrations/meta/route.ts");
const page = read("app/(crm)/integrations/meta/page.tsx");

for (const fragment of [
  "x-hub-signature-256",
  "META_APP_SECRET",
  "meta.lead.fetch",
  "external_lead_id",
]) {
  assert.ok(webhook.includes(fragment), `Webhook must contain: ${fragment}`);
}

for (const fragment of [
  "findExistingLead",
  "email_normalized",
  "phone_normalized",
  "identity_conflict",
  "updated_existing_lead",
  "assigned_to: sourceResult.data?.default_owner_id || null",
  "match.lead ? \"updated\" : \"created\"",
]) {
  assert.ok(worker.includes(fragment), `Meta worker must contain: ${fragment}`);
}

for (const fragment of [
  "leadTracking",
  "linkedToCrm",
  "lastImportedAt",
]) {
  assert.ok(dashboard.includes(fragment), `Meta API must contain: ${fragment}`);
  assert.ok(page.includes(fragment), `Meta interface must contain: ${fragment}`);
}

console.log("Meta Lead Ads → CRM tracking contract passed.");
