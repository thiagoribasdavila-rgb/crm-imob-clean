import test from "node:test";
import assert from "node:assert/strict";
import { createModuleCompletionMemory } from "../../lib/release/module-completion-memory.mjs";
import {
  buildModuleDependencyGraph,
  createModuleDependencyGraphConfiguration,
  inspectModuleDependencyGraphConfiguration,
} from "../../lib/release/module-dependency-graph.mjs";

const moduleInput = (moduleId) => ({
  moduleId,
  moduleName: moduleId,
  canonicalOwner: "conversion-core",
  revision: 1,
  completionLevel: "locally_verified",
  outcome: "Verificado localmente.",
  sourcePaths: [`lib/${moduleId}.mjs`],
  evidencePaths: [`tests/${moduleId}.test.mjs`],
  checks: { contracts: true, typecheck: true, lint: true, secretScan: true },
  runtimeHomologated: false,
  cleanBuildVerified: false,
  rollbackReady: false,
  directorApproved: false,
});

function fixture() {
  const memory = createModuleCompletionMemory([moduleInput("capture"), moduleInput("readiness")]);
  const [capture, readiness] = memory.entries;
  const configuration = createModuleDependencyGraphConfiguration({
    sourceMemoryHash: memory.memoryHash,
    modules: [
      { moduleId: capture.moduleId, revision: 1, entryHash: capture.entryHash, dependencies: [] },
      { moduleId: readiness.moduleId, revision: 1, entryHash: readiness.entryHash, dependencies: [{ moduleId: capture.moduleId, revision: 1, entryHash: capture.entryHash }] },
    ],
  });
  return { memory, configuration };
}

test("resolve dependência exata por módulo, revisão e hash", () => {
  const { memory, configuration } = fixture();
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration });
  assert.equal(graph.ok, true);
  assert.deepEqual(graph.summary, { nodes: 2, edges: 1, resolvedEdges: 1, structuralIssues: 0, releaseReady: 0, blocked: 2 });
  assert.equal(graph.nodes.find((node) => node.moduleId === "readiness").dependencySatisfied, true);
});

test("dependência satisfeita não promove runtime ou ZIP", () => {
  const { memory, configuration } = fixture();
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration });
  assert.equal(graph.nodes.every((node) => node.releaseReady === false), true);
  assert.equal(memory.summary.runtimeHomologated, 0);
  assert.equal(memory.summary.zipEligible, 0);
});

test("detecta dependência ausente", () => {
  const { memory, configuration } = fixture();
  const changed = structuredClone(configuration);
  changed.modules[1].dependencies[0].moduleId = "missing";
  const recreated = createModuleDependencyGraphConfiguration(changed);
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration: recreated });
  assert.equal(graph.ok, false);
  assert.match(graph.nodes[1].structuralBlockers.join(" "), /dependency_missing/);
});

test("detecta ciclos", () => {
  const { memory } = fixture();
  const [capture, readiness] = memory.entries;
  const configuration = createModuleDependencyGraphConfiguration({
    sourceMemoryHash: memory.memoryHash,
    modules: [
      { moduleId: capture.moduleId, revision: 1, entryHash: capture.entryHash, dependencies: [{ moduleId: readiness.moduleId, revision: 1, entryHash: readiness.entryHash }] },
      { moduleId: readiness.moduleId, revision: 1, entryHash: readiness.entryHash, dependencies: [{ moduleId: capture.moduleId, revision: 1, entryHash: capture.entryHash }] },
    ],
  });
  const graph = buildModuleDependencyGraph({ completionMemory: memory, configuration });
  assert.equal(graph.ok, false);
  assert.equal(graph.cycles.length, 1);
});

test("recusa adulteração da configuração e divergência da memória", () => {
  const { configuration } = fixture();
  const changed = structuredClone(configuration);
  changed.modules[0].entryHash = "0".repeat(64);
  assert.equal(inspectModuleDependencyGraphConfiguration(changed).ok, false);
  const otherMemory = createModuleCompletionMemory([moduleInput("capture")]);
  assert.throws(() => buildModuleDependencyGraph({ completionMemory: otherMemory, configuration }), /source_memory_hash_mismatch/);
});
