import test from "node:test";
import assert from "node:assert/strict";
import {
  appendModuleCompletionMemory,
  createModuleCompletionMemory,
  inspectModuleCompletionMemory,
} from "../../lib/release/module-completion-memory.mjs";

const base = {
  moduleId: "conversion-core-capture-governance",
  moduleName: "Governança local de captura do núcleo de conversão",
  canonicalOwner: "conversion-core",
  completionLevel: "locally_verified",
  outcome: "Evidências locais verificáveis sem contato remoto.",
  sourcePaths: ["lib/testing/capture.mjs"],
  evidencePaths: ["tests/contracts/capture.test.mjs"],
  checks: { contracts: true, typecheck: true, lint: true, secretScan: true },
  runtimeHomologated: false,
  cleanBuildVerified: false,
  rollbackReady: false,
  directorApproved: false,
};

test("registra módulo local sem promovê-lo indevidamente ao ZIP", () => {
  const memory = createModuleCompletionMemory([base]);
  const result = inspectModuleCompletionMemory(memory);
  assert.equal(result.ok, true);
  assert.equal(memory.summary.locallyVerified, 1);
  assert.equal(memory.summary.zipEligible, 0);
  assert.deepEqual(result.zipEligibleModuleIds, []);
});

test("libera ZIP somente com runtime, build, rollback e aprovação", () => {
  const memory = createModuleCompletionMemory([{
    ...base,
    completionLevel: "runtime_homologated",
    runtimeHomologated: true,
    cleanBuildVerified: true,
    rollbackReady: true,
    directorApproved: true,
  }]);
  assert.equal(memory.entries[0].packaging.zipEligible, true);
  assert.deepEqual(inspectModuleCompletionMemory(memory).zipEligibleModuleIds, [base.moduleId]);
});

test("recusa evidência local incompleta", () => {
  assert.throws(
    () => createModuleCompletionMemory([{ ...base, checks: { ...base.checks, lint: false } }]),
    /check_lint_not_verified/,
  );
});

test("recusa homologação remota apenas declarada", () => {
  assert.throws(
    () => createModuleCompletionMemory([{ ...base, completionLevel: "runtime_homologated" }]),
    /runtime_homologation_evidence_missing/,
  );
});

test("recusa caminhos absolutos, fuga de raiz e arquivos sensíveis", () => {
  for (const sourcePaths of [["/tmp/file"], ["../file"], [".env.local"]]) {
    assert.throws(() => createModuleCompletionMemory([{ ...base, sourcePaths }]));
  }
});

test("detecta adulteração de conteúdo e resumo", () => {
  const memory = createModuleCompletionMemory([base]);
  const changedEntry = structuredClone(memory);
  changedEntry.entries[0].outcome = "alterado";
  assert.equal(inspectModuleCompletionMemory(changedEntry).ok, false);
  const changedSummary = structuredClone(memory);
  changedSummary.summary.zipEligible = 1;
  assert.equal(inspectModuleCompletionMemory(changedSummary).ok, false);
});

test("mantém cadeia e revisão sequencial por módulo", () => {
  const memory = createModuleCompletionMemory([
    base,
    { ...base, revision: 2, outcome: "Evidência ampliada e novamente verificada." },
  ]);
  assert.equal(memory.entries[1].previousEntryHash, memory.entries[0].entryHash);
  assert.equal(inspectModuleCompletionMemory(memory).ok, true);
});

test("recusa salto de revisão", () => {
  const memory = createModuleCompletionMemory([{ ...base, revision: 2 }]);
  assert.equal(inspectModuleCompletionMemory(memory).ok, false);
});

test("anexa módulo ou revisão sem romper a cadeia existente", () => {
  const memory = createModuleCompletionMemory([base]);
  const appended = appendModuleCompletionMemory(memory, {
    ...base,
    moduleId: "commercial-memory",
    moduleName: "Memória comercial",
    canonicalOwner: "ai",
    revision: 1,
  });
  assert.equal(appended.entries.length, 2);
  assert.equal(appended.entries[1].previousEntryHash, appended.entries[0].entryHash);
  assert.equal(inspectModuleCompletionMemory(appended).ok, true);
});

test("impede anexar revisão fora da sequência", () => {
  const memory = createModuleCompletionMemory([base]);
  assert.throws(
    () => appendModuleCompletionMemory(memory, { ...base, revision: 3 }),
    /module_revision_invalid/,
  );
});
