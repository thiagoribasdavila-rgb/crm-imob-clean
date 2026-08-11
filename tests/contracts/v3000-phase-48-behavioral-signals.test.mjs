import assert from "node:assert/strict";
import test from "node:test";
import {
  BEHAVIORAL_SIGNALS_CONTRACT,
  buildBehavioralSignals,
} from "../../lib/atlas/behavioral-signals.ts";
import {
  loadBehavioralSignalsRegistry,
  validateBehavioralSignals,
} from "../../scripts/check-v3000-phase-48-behavioral-signals.mjs";

const root = process.cwd();

test("Fase 48 mantém três sinais factuais e histórico no Lead 360", () => {
  const registry = loadBehavioralSignalsRegistry(root);
  const result = validateBehavioralSignals({ root, registry });

  assert.equal(result.phase, 48);
  assert.equal(result.status, "behavioral-signals-adopted");
  assert.equal(result.maxSignals, 3);
  assert.equal(result.registeredFactsOnly, true);
  assert.equal(result.timelineInCard, false);
  assert.equal(result.fullHistoryRoute, "/leads/[id]");
});

test("mais de três fatos retorna somente os três que mais alteram a decisão", () => {
  const signals = buildBehavioralSignals({
    conversationContinuity: {
      channel: "whatsapp",
      channelConfirmed: true,
      lastContactAt: "2026-08-11T10:00:00.000Z",
      responseState: "waiting_customer",
    },
    evaluatedAt: "2026-08-15T12:00:00.000Z",
    metadata: {
      last_material_name: "Book do empreendimento",
      material_opened_at: "2026-08-10T09:00:00.000Z",
      preference_change_summary: "Mudou de dois para três dormitórios.",
      preference_changed_at: "2026-08-09T09:00:00.000Z",
      visit_completed_at: "2026-08-08T14:00:00.000Z",
    },
  });

  assert.equal(signals.length, BEHAVIORAL_SIGNALS_CONTRACT.maxSignals);
  assert.deepEqual(
    signals.map((signal) => signal.kind),
    ["silence", "visit", "preference-change"],
  );
});

test("silêncio usa relógio fixo e fato operacional registrado", () => {
  const signals = buildBehavioralSignals({
    createdAt: "2026-08-01T08:00:00.000Z",
    evaluatedAt: "2026-08-05T09:00:00.000Z",
  });

  assert.equal(signals[0]?.kind, "silence");
  assert.equal(signals[0]?.source, "CRM");
  assert.match(signals[0]?.detail ?? "", /4 dias/);
});

test("retorno confirmado suprime o alerta de silêncio", () => {
  const signals = buildBehavioralSignals({
    conversationContinuity: {
      channel: "whatsapp",
      channelConfirmed: true,
      lastContactAt: "2026-08-01T08:00:00.000Z",
      responseState: "customer_replied",
    },
    evaluatedAt: "2026-08-11T12:00:00.000Z",
  });

  assert.deepEqual(
    signals.map((signal) => signal.kind),
    ["customer-return"],
  );
});

test("sem fatos ou datas registradas não inventa comportamento", () => {
  const signals = buildBehavioralSignals({});
  assert.deepEqual(signals, []);
});

test("etapa de visita não presume que a visita aconteceu", () => {
  const signals = buildBehavioralSignals({
    status: "visita",
    updatedAt: "2026-08-11T08:00:00.000Z",
  });

  assert.equal(signals[0]?.label, "Etapa de visita");
  assert.match(signals[0]?.detail ?? "", /conclusão não presumida/i);
});

test("Fase 48 rejeita ampliar o card para quatro sinais", () => {
  const registry = structuredClone(loadBehavioralSignalsRegistry(root));
  registry.scope.maxSignals = 4;

  assert.throws(
    () => validateBehavioralSignals({ root, registry }),
    /limitado a três sinais/,
  );
});
