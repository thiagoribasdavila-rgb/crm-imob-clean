import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(read("config/evolution-phase-173-conversion-core-isolated-preflight.json"));

test("lead intake stores tenant, project, owner, stage and next action", () => {
  const source = read("app/api/v1/leads/route.ts");
  for (const token of ["organization_id: identity.organizationId", "assigned_user_id: identity.userId", "project_id: project?.id", 'status: "novo"', 'next_action: "Realizar primeiro contato"']) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("compatibility adapter preserves canonical lead meaning", () => {
  const source = read("lib/compat/legacy-v2.ts");
  for (const mapping of [
    'assigned_to: first(row, "assigned_to", "assigned_user_id")',
    'development_id: first(row, "development_id", "project_id")',
    'next_action_at: first(row, "next_action_at", "next_contact")',
    'next_action_label: first(row, "next_action_label", "next_action")',
  ]) assert.ok(source.includes(mapping), mapping);
});

test("Lead 360 resolves related records inside the same organization", () => {
  const source = read("app/api/v1/leads/[id]/route.ts");
  for (const token of ['.from("tasks")', "lead.assigned_to", "lead.development_id", '.eq("organization_id", identity.organizationId)']) {
    assert.ok(source.includes(token), token);
  }
});

test("pipeline uses optimistic concurrency, tenant scope and compensating audit rollback", () => {
  const source = read("app/api/v1/pipeline/route.ts");
  for (const token of ["expectedFromStage", '.eq("organization_id", identity.organizationId)', '.from("pipeline_history")', "const rollback = await admin"]) {
    assert.ok(source.includes(token), token);
  }
});

test("tasks inherit the visible lead owner and keep an auditable lead relation", () => {
  const source = read("app/api/v1/tasks/route.ts");
  for (const token of ["assigned_user_id", '.eq("organization_id", identity.access.organization.id)', "lead_id: leadId", "due_date: dueAt.toISOString()", 'auditTrail: leadId ? "lead_events"']) {
    assert.ok(source.includes(token), token);
  }
});

test("preflight cannot be presented as runtime homologation or release", () => {
  assert.equal(config.evidenceLevel, "static_and_contract_preflight");
  assert.equal(config.runtimeHomologated, false);
  assert.equal(config.releaseGate.authenticatedIsolatedRuntimePassed, false);
  assert.equal(config.releaseGate.sourceTraceabilityPassed, false);
  assert.equal(config.releaseGate.buildAllowed, false);
  assert.equal(config.releaseGate.zipAllowed, false);
  assert.equal(config.safety.productionDatabaseTouched, false);
});
