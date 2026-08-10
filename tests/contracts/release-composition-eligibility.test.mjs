import assert from "node:assert/strict";
import test from "node:test";
import { createModuleCompletionMemory } from "../../lib/release/module-completion-memory.mjs";
import { buildModuleDependencyGraph, createModuleDependencyGraphConfiguration } from "../../lib/release/module-dependency-graph.mjs";
import { createReleaseCompositionPlan, evaluateReleaseCompositionEligibility, inspectReleaseCompositionPlan } from "../../lib/release/release-composition-eligibility.mjs";

function entry(moduleId, gates = {}) {
  return {
    moduleId,
    moduleName: moduleId,
    canonicalOwner: "conversion-core",
    revision: 1,
    completionLevel: gates.runtimeHomologated ? "runtime_homologated" : "locally_verified",
    outcome: "resultado verificável",
    sourcePaths: [`lib/${moduleId}.mjs`],
    evidencePaths: [`tests/${moduleId}.test.mjs`],
    checks: { contracts: true, typecheck: true, lint: true, secretScan: true },
    releaseGates: {
      runtimeHomologated: gates.runtimeHomologated === true,
      cleanBuildVerified: gates.cleanBuildVerified === true,
      rollbackReady: gates.rollbackReady === true,
      directorApproved: gates.directorApproved === true,
    },
  };
}

function fixture(gates = {}) {
  const memory = createModuleCompletionMemory([entry("foundation", gates), entry("readiness", gates)]);
  const [foundation, readiness] = memory.entries;
  const configuration = createModuleDependencyGraphConfiguration({
    sourceMemoryHash: memory.memoryHash,
    modules: [
      { moduleId: foundation.moduleId, revision: 1, entryHash: foundation.entryHash, dependencies: [] },
      { moduleId: readiness.moduleId, revision: 1, entryHash: readiness.entryHash, dependencies: [{ moduleId: foundation.moduleId, revision: 1, entryHash: foundation.entryHash }] },
    ],
  });
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration });
  const plan = createReleaseCompositionPlan({
    compositionId: "conversion-core-candidate",
    sourceGraphHash: graph.graphHash,
    roots: [{ moduleId: readiness.moduleId, revision: 1, entryHash: readiness.entryHash }],
  });
  return { graph, plan, foundation, readiness };
}

test("calcula clausura transitiva pela raiz exata", () => {
  const { graph, plan } = fixture();
  const decision = evaluateReleaseCompositionEligibility({ graph, plan });
  assert.deepEqual(decision.closure.map((item) => item.key), ["foundation@1", "readiness@1"]);
  assert.equal(decision.summary.modulesInClosure, 2);
});

test("gates fechados bloqueiam composição sem gerar pacote", () => {
  const { graph, plan } = fixture();
  const decision = evaluateReleaseCompositionEligibility({ graph, plan });
  assert.equal(decision.summary.eligible, false);
  assert.equal(decision.summary.releaseBlockers, 8);
  assert.equal(decision.summary.packageGenerated, false);
  assert.equal(decision.decision, "blocked_before_packaging");
});

test("todos os gates reais permitem somente a elegibilidade controlada", () => {
  const gates = { runtimeHomologated: true, cleanBuildVerified: true, rollbackReady: true, directorApproved: true };
  const { graph, plan } = fixture(gates);
  const decision = evaluateReleaseCompositionEligibility({ graph, plan });
  assert.equal(decision.summary.eligible, true);
  assert.equal(decision.summary.packageGenerated, false);
  assert.equal(decision.decision, "eligible_for_controlled_packaging");
});

test("recusa raiz inexistente e hash divergente", () => {
  const { graph, plan } = fixture();
  const missing = createReleaseCompositionPlan({
    compositionId: "missing-root",
    sourceGraphHash: graph.graphHash,
    roots: [{ moduleId: "missing", revision: 1, entryHash: "0".repeat(64) }],
  });
  const missingDecision = evaluateReleaseCompositionEligibility({ graph, plan: missing });
  assert.equal(missingDecision.summary.structuralBlockers, 1);
  assert.equal(missingDecision.summary.eligible, false);
  const changed = structuredClone(plan);
  changed.roots[0].entryHash = "0".repeat(64);
  changed.planHash = createReleaseCompositionPlan(changed).planHash;
  const mismatchDecision = evaluateReleaseCompositionEligibility({ graph, plan: changed });
  assert.match(mismatchDecision.structuralBlockers[0], /root_hash_mismatch/);
});

test("recusa adulteração do plano e grafo diferente", () => {
  const { graph, plan } = fixture();
  const changed = structuredClone(plan);
  changed.compositionId = "changed";
  assert.equal(inspectReleaseCompositionPlan(changed).ok, false);
  const wrongGraph = { ...graph, graphHash: "f".repeat(64) };
  assert.throws(() => evaluateReleaseCompositionEligibility({ graph: wrongGraph, plan }), /source_graph_hash_mismatch/);
});
