import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMAND_CENTER_EXCEPTION_CONTRACT,
  buildCommandCenterExceptionQueue,
  selectCommandCenterSupportIndicators,
} from "../../lib/atlas/command-center-exceptions.ts";
import {
  loadCommandCenterExceptionsRegistry,
  validateCommandCenterExceptions,
} from "../../scripts/check-v3000-phase-52-command-center-exceptions.mjs";

const root = process.cwd();

function candidate(id, title, href, score) {
  return {
    id,
    title,
    detail: `Detalhe ${id}`,
    evidence: `Evidência ${id}`,
    href,
    actionLabel: `Abrir ${id}`,
    tone: "attention",
    score,
  };
}

test("Fase 52 preserva composição curta e fontes autenticadas", () => {
  const registry = loadCommandCenterExceptionsRegistry(root);
  const result = validateCommandCenterExceptions({ root, registry });

  assert.equal(result.phase, 52);
  assert.equal(result.status, "command-center-exceptions-adopted");
  assert.equal(result.primaryDecisions, 1);
  assert.equal(result.exceptionQueueLimit, 3);
  assert.equal(result.supportIndicatorLimit, 3);
  assert.equal(result.maxClicksToOpportunity, 2);
});

test("fila remove a repetição da decisão principal", () => {
  const queue = buildCommandCenterExceptionQueue({
    primary: { title: "Resolver leads atrasados", href: "/leads?overdue=1" },
    candidates: [
      candidate("same", " Resolver leads atrasados ", "/LEADS?OVERDUE=1", 100),
      candidate("other", "Distribuir leads", "/distribution", 90),
    ],
  });

  assert.deepEqual(
    queue.map((item) => item.id),
    ["other"],
  );
});

test("fila elimina exceções repetidas por título e destino", () => {
  const queue = buildCommandCenterExceptionQueue({
    primary: { title: "Principal", href: "/dashboard" },
    candidates: [
      candidate("first", "Revisar módulo", "/projects", 80),
      candidate("duplicate", " revisar   módulo ", "/PROJECTS", 99),
    ],
  });

  assert.deepEqual(
    queue.map((item) => item.id),
    ["first"],
  );
});

test("fila ordena por criticidade e limita a três exceções", () => {
  const queue = buildCommandCenterExceptionQueue({
    primary: { title: "Principal", href: "/dashboard" },
    candidates: [
      candidate("low", "Baixa", "/low", 10),
      candidate("high", "Alta", "/high", 100),
      candidate("middle", "Média", "/middle", 50),
      candidate("second", "Segunda", "/second", 90),
    ],
  });

  assert.deepEqual(
    queue.map((item) => item.id),
    ["high", "second", "middle"],
  );
});

test("empates preservam a ordem factual de entrada", () => {
  const queue = buildCommandCenterExceptionQueue({
    primary: { title: "Principal", href: "/dashboard" },
    candidates: [
      candidate("one", "Primeira", "/one", 80),
      candidate("two", "Segunda", "/two", 80),
      candidate("three", "Terceira", "/three", 80),
    ],
  });

  assert.deepEqual(
    queue.map((item) => item.id),
    ["one", "two", "three"],
  );
});

test("indicadores de apoio são únicos e limitados a três", () => {
  const indicators = selectCommandCenterSupportIndicators([
    {
      id: "health",
      label: "Saúde",
      value: "90%",
      detail: "OK",
      tone: "positive",
    },
    {
      id: " HEALTH ",
      label: "Repetido",
      value: "0",
      detail: "Não",
      tone: "neutral",
    },
    {
      id: "portfolio",
      label: "Portfólio",
      value: "4",
      detail: "Ativos",
      tone: "neutral",
    },
    {
      id: "pipeline",
      label: "Pipeline",
      value: "20",
      detail: "Abertos",
      tone: "attention",
    },
    {
      id: "extra",
      label: "Extra",
      value: "1",
      detail: "Oculto",
      tone: "neutral",
    },
  ]);

  assert.deepEqual(
    indicators.map((item) => item.id),
    ["health", "portfolio", "pipeline"],
  );
});

test("contrato proíbe mutação, migration e chamada de IA", () => {
  assert.equal(COMMAND_CENTER_EXCEPTION_CONTRACT.primaryDecisionCount, 1);
  assert.equal(COMMAND_CENTER_EXCEPTION_CONTRACT.exceptionQueueLimit, 3);
  assert.equal(COMMAND_CENTER_EXCEPTION_CONTRACT.supportIndicatorLimit, 3);
  assert.equal(COMMAND_CENTER_EXCEPTION_CONTRACT.maxClicksToOpportunity, 2);
  assert.equal(COMMAND_CENTER_EXCEPTION_CONTRACT.aiCalls, 0);
  assert.equal(COMMAND_CENTER_EXCEPTION_CONTRACT.businessMutation, false);
  assert.equal(COMMAND_CENTER_EXCEPTION_CONTRACT.databaseMigration, false);
});

test("Fase 52 rejeita ampliação da fila de exceções", () => {
  const registry = structuredClone(loadCommandCenterExceptionsRegistry(root));
  registry.composition.exceptionQueueLimit = 4;

  assert.throws(
    () => validateCommandCenterExceptions({ root, registry }),
    /uma decisão, três exceções e três sinais/,
  );
});
