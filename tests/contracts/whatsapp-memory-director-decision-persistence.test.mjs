import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWhatsAppMemoryDirectorDecisionPersistence } from "../../lib/analytics/whatsapp-memory-director-decision-persistence.ts";

const decisionContract = () => ({
  scope: "authenticated_organization",
  containsPii: false,
  readsMessageContent: false,
  automaticDecision: false,
  contract: {
    status: "ready_for_authenticated_decision_flow",
    technicallyDecidable: true,
    persisted: false,
    executed: false,
    effectiveDecision: null,
    allowedRoles: ["admin", "director"],
    allowedDecisions: ["approve", "reject"],
    minimumReasonLength: 20,
    requiredHumanConfirmations: 2,
    idempotencyKeyRequired: true,
    auditEventRequired: true,
    blockers: [],
  },
  evidenceMeasuredAt: "2026-08-10T12:00:00.000Z",
});

const migration = readFileSync(
  "supabase/migrations/20260810070850_phase_372_whatsapp_memory_director_decision_ledger.sql",
  "utf8",
);

test("declara a fronteira local sem alegar escrita remota", () => {
  const result = buildWhatsAppMemoryDirectorDecisionPersistence(decisionContract());
  assert.equal(result.persistence.persistenceReady, true);
  assert.equal(result.persistence.remoteMigrationApplied, false);
  assert.equal(result.persistence.endpointExposed, true);
  assert.equal(result.persistence.decisionPersisted, false);
  assert.equal(result.persistence.learningActivated, false);
});

test("cria ledger append-only, tenant-scoped e com RLS forçada", () => {
  assert.match(migration, /create table if not exists public\.whatsapp_memory_director_decisions/i);
  assert.match(migration, /unique \(organization_id, idempotency_key\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /organization_id = \(select public\.current_organization_id\(\)\)/i);
  assert.doesNotMatch(migration, /for update\s+to authenticated/i);
  assert.doesNotMatch(migration, /for delete\s+to authenticated/i);
});

test("restringe a escrita ao servidor e valida o decisor", () => {
  assert.match(migration, /revoke all on function public\.record_whatsapp_memory_director_decision[\s\S]*from authenticated/i);
  assert.match(migration, /grant execute on function public\.record_whatsapp_memory_director_decision[\s\S]*to service_role/i);
  assert.match(migration, /v_actor_role is distinct from 'director'/i);
  assert.match(migration, /p\.organization_id = p_organization_id/i);
  assert.match(migration, /p\.active is true/i);
});

test("impõe prova fresca, confirmações e limites de privacidade", () => {
  assert.match(migration, /interval '24 hours'/i);
  assert.match(migration, /p_operational_scope_confirmed is not true/i);
  assert.match(migration, /p_evidence_limits_confirmed is not true/i);
  assert.match(migration, /'containsPii'/i);
  assert.match(migration, /'readsMessageContent'/i);
  assert.match(migration, /'automaticDecision'/i);
  assert.match(migration, /jsonb_array_length\(p_evidence_snapshot -> 'blockers'\) <> 0/i);
});

test("reexecuta a mesma intenção e rejeita reuso conflitante", () => {
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /'replayed', true/i);
  assert.match(migration, /whatsapp_memory_decision_idempotency_conflict/i);
  assert.match(migration, /insert into public\.audit_logs/i);
  assert.match(migration, /'learningActivated', false/i);
});

test("interface preserva a fase de persistência e liga o painel protegido", () => {
  const page = readFileSync("app/(crm)/integrations/whatsapp/page.tsx", "utf8");
  assert.match(page, /data-phase="372-whatsapp-memory-director-decision-persistence"/);
  assert.match(page, /Ledger seguro da decisão/i);
  assert.match(page, /migration local/i);
  assert.match(page, /WhatsAppMemoryDirectorDecisionPanel/);
});
