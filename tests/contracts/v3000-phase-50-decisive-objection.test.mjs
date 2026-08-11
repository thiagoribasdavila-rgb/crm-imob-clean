import assert from "node:assert/strict";
import test from "node:test";
import {
  DECISIVE_OBJECTION_CONTRACT,
  buildDecisiveObjection,
} from "../../lib/atlas/decisive-objection.ts";
import {
  loadDecisiveObjectionRegistry,
  validateDecisiveObjection,
} from "../../scripts/check-v3000-phase-50-decisive-objection.mjs";

const root = process.cwd();

function compatibility(overrides = {}) {
  return {
    status: "evidence_available",
    project_id: "project-1",
    project_name: "Inside Perdizes",
    signals: [],
    evidence_count: 0,
    missing: null,
    evaluated_without_ai: true,
    ...overrides,
  };
}

function silenceSignal() {
  return {
    decisionImpact: "Definir contato agora.",
    detail: "Sem interação registrada há 5 dias.",
    kind: "silence",
    label: "Silêncio operacional",
    occurredAt: "2026-08-06T12:00:00.000Z",
    source: "CRM",
    tone: "warning",
  };
}

test("Fase 50 limita o card a um bloqueio factual", () => {
  const registry = loadDecisiveObjectionRegistry(root);
  const result = validateDecisiveObjection({ root, registry });

  assert.equal(result.phase, 50);
  assert.equal(result.status, "decisive-objection-adopted");
  assert.equal(result.maxVisible, DECISIVE_OBJECTION_CONTRACT.maxVisible);
  assert.equal(result.registeredFactsOnly, true);
  assert.equal(result.freeTextNotesAreEvidence, false);
});

test("objeção explícita de preço gera pergunta objetiva", () => {
  const snapshot = buildDecisiveObjection({
    metadata: { active_objection: "Preço acima da faixa aprovada" },
  });

  assert.equal(snapshot.kind, "price");
  assert.equal(snapshot.status, "active_objection");
  assert.equal(snapshot.source, "Metadados estruturados");
  assert.match(snapshot.question ?? "", /faixa ou condição/i);
});

test("nota livre não é convertida em objeção", () => {
  const snapshot = buildDecisiveObjection({
    metadata: {
      notes: "Cliente achou caro e talvez precise de financiamento.",
      observations: "Prefere outro bairro.",
    },
  });

  assert.equal(snapshot.status, "clear");
  assert.equal(snapshot.kind, null);
});

test("objeção estruturada resolvida deixa de aparecer", () => {
  const snapshot = buildDecisiveObjection({
    metadata: {
      objection: {
        category: "crédito",
        label: "Pré-análise pendente",
        status: "resolvida",
      },
    },
  });

  assert.equal(snapshot.status, "clear");
});

test("incompatibilidade de projeto antecede silêncio e lacuna", () => {
  const snapshot = buildDecisiveObjection({
    behavioralSignals: [silenceSignal()],
    projectCompatibility: compatibility({
      signals: [
        {
          key: "region",
          label: "Região",
          state: "attention",
          evidence: "Cliente busca Moema · projeto em Perdizes",
        },
      ],
      evidence_count: 1,
      missing: {
        key: "timeline",
        label: "Prazo de compra",
        question: "Quando este cliente pretende comprar?",
      },
    }),
  });

  assert.equal(snapshot.kind, "region");
  assert.equal(snapshot.source, "Compatibilidade do projeto");
});

test("silêncio factual oferece retomada antes da lacuna de qualificação", () => {
  const snapshot = buildDecisiveObjection({
    behavioralSignals: [silenceSignal()],
    projectCompatibility: compatibility({
      missing: {
        key: "timeline",
        label: "Prazo de compra",
        question: "Quando este cliente pretende comprar?",
      },
    }),
  });

  assert.equal(snapshot.kind, "no-return");
  assert.equal(snapshot.actionLabel, "Retomar contato agora");
});

test("lacuna de prazo mantém a pergunta registrada pelo matching", () => {
  const snapshot = buildDecisiveObjection({
    projectCompatibility: compatibility({
      missing: {
        key: "timeline",
        label: "Prazo de compra",
        question: "Quando este cliente pretende comprar?",
      },
    }),
  });

  assert.equal(snapshot.kind, "deadline");
  assert.equal(snapshot.status, "qualification_gap");
  assert.equal(snapshot.question, "Quando este cliente pretende comprar?");
});

test("objeção explícita de crédito tem prioridade máxima", () => {
  const snapshot = buildDecisiveObjection({
    behavioralSignals: [silenceSignal()],
    metadata: { current_objection: "Financiamento ainda sem aprovação" },
    projectCompatibility: compatibility({
      signals: [
        {
          key: "budget",
          label: "Faixa de preço",
          state: "attention",
          evidence: "Faixas não se sobrepõem",
        },
      ],
      evidence_count: 1,
    }),
  });

  assert.equal(snapshot.kind, "credit");
  assert.equal(snapshot.source, "Metadados estruturados");
});

test("Fase 50 rejeita usar notas livres como evidência", () => {
  const registry = structuredClone(loadDecisiveObjectionRegistry(root));
  registry.scope.freeTextNotesAreEvidence = true;

  assert.throws(
    () => validateDecisiveObjection({ root, registry }),
    /sem usar notas livres/,
  );
});
