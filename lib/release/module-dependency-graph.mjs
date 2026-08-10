import { createHash } from "node:crypto";
import { inspectModuleCompletionMemory } from "./module-completion-memory.mjs";

export const MODULE_DEPENDENCY_GRAPH_SCHEMA = "atlas.release-module-dependency-graph.v1";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function referenceKey(reference) {
  return `${reference.moduleId}@${reference.revision}`;
}

function cleanReference(reference, field) {
  if (!reference || typeof reference !== "object") throw new Error(`${field}_invalid`);
  if (typeof reference.moduleId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(reference.moduleId)) {
    throw new Error(`${field}_module_id_invalid`);
  }
  if (!Number.isInteger(reference.revision) || reference.revision < 1) throw new Error(`${field}_revision_invalid`);
  if (typeof reference.entryHash !== "string" || !/^[a-f0-9]{64}$/.test(reference.entryHash)) {
    throw new Error(`${field}_entry_hash_invalid`);
  }
  return { moduleId: reference.moduleId, revision: reference.revision, entryHash: reference.entryHash };
}

export function createModuleDependencyGraphConfiguration(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.modules)) throw new Error("graph_input_invalid");
  if (typeof input.sourceMemoryHash !== "string" || !/^[a-f0-9]{64}$/.test(input.sourceMemoryHash)) {
    throw new Error("source_memory_hash_invalid");
  }
  const modules = input.modules.map((module, index) => {
    const current = cleanReference(module, `module_${index}`);
    const dependencies = Array.isArray(module.dependencies)
      ? module.dependencies.map((dependency, dependencyIndex) => cleanReference(dependency, `module_${index}_dependency_${dependencyIndex}`))
      : [];
    if (dependencies.some((dependency) => referenceKey(dependency) === referenceKey(current))) {
      throw new Error("self_dependency_invalid");
    }
    const dependencyKeys = dependencies.map(referenceKey);
    if (new Set(dependencyKeys).size !== dependencyKeys.length) throw new Error("duplicate_dependency_invalid");
    return { ...current, dependencies: dependencies.sort((a, b) => referenceKey(a).localeCompare(referenceKey(b))) };
  }).sort((a, b) => referenceKey(a).localeCompare(referenceKey(b)));
  const moduleKeys = modules.map(referenceKey);
  if (new Set(moduleKeys).size !== moduleKeys.length) throw new Error("duplicate_module_invalid");
  const payload = { schema: MODULE_DEPENDENCY_GRAPH_SCHEMA, sourceMemoryHash: input.sourceMemoryHash, modules };
  return { ...payload, configurationHash: digest(payload) };
}

export function inspectModuleDependencyGraphConfiguration(configuration) {
  try {
    const recreated = createModuleDependencyGraphConfiguration(configuration);
    if (recreated.configurationHash !== configuration?.configurationHash) {
      return { ok: false, reason: "configuration_hash_mismatch" };
    }
    return { ok: true, configurationHash: recreated.configurationHash, moduleCount: recreated.modules.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "configuration_invalid" };
  }
}

function detectCycles(nodes) {
  const adjacency = new Map(nodes.map((node) => [node.key, node.dependencies.filter((dependency) => dependency.resolved).map((dependency) => dependency.key)]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = new Set();
  function visit(key, path) {
    if (visiting.has(key)) {
      const start = path.indexOf(key);
      cycles.add([...path.slice(start), key].join(" -> "));
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of adjacency.get(key) ?? []) visit(dependency, [...path, key]);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of adjacency.keys()) visit(key, []);
  return [...cycles].sort();
}

export function buildModuleDependencyGraph({ completionMemory, configuration }) {
  const completionInspection = inspectModuleCompletionMemory(completionMemory);
  if (!completionInspection.ok) throw new Error(`completion_memory_invalid:${completionInspection.reason}`);
  const configurationInspection = inspectModuleDependencyGraphConfiguration(configuration);
  if (!configurationInspection.ok) throw new Error(`dependency_configuration_invalid:${configurationInspection.reason}`);
  if (configuration.sourceMemoryHash !== completionMemory.memoryHash) throw new Error("source_memory_hash_mismatch");

  const entries = new Map(completionMemory.entries.map((entry) => [referenceKey(entry), entry]));
  const configured = new Set(configuration.modules.map(referenceKey));
  const unconfigured = [...entries.keys()].filter((key) => !configured.has(key)).sort();
  const nodes = configuration.modules.map((definition) => {
    const key = referenceKey(definition);
    const entry = entries.get(key);
    const dependencies = definition.dependencies.map((dependency) => {
      const dependencyKey = referenceKey(dependency);
      const dependencyEntry = entries.get(dependencyKey);
      const hashMatches = dependencyEntry?.entryHash === dependency.entryHash;
      return { key: dependencyKey, ...dependency, exists: Boolean(dependencyEntry), hashMatches, resolved: Boolean(dependencyEntry && hashMatches) };
    });
    const structuralBlockers = [];
    if (!entry) structuralBlockers.push("module_missing");
    else if (entry.entryHash !== definition.entryHash) structuralBlockers.push("module_hash_mismatch");
    for (const dependency of dependencies) {
      if (!dependency.exists) structuralBlockers.push(`dependency_missing:${dependency.key}`);
      else if (!dependency.hashMatches) structuralBlockers.push(`dependency_hash_mismatch:${dependency.key}`);
    }
    const releaseBlockers = entry
      ? Object.entries(entry.releaseGates).filter(([, ready]) => !ready).map(([gate]) => `release_gate_pending:${gate}`)
      : [];
    return {
      key,
      moduleId: definition.moduleId,
      revision: definition.revision,
      entryHash: definition.entryHash,
      completionLevel: entry?.completionLevel ?? null,
      dependencies,
      dependencySatisfied: structuralBlockers.length === 0,
      structuralBlockers,
      releaseBlockers,
      releaseReady: structuralBlockers.length === 0 && releaseBlockers.length === 0 && entry?.packaging?.zipEligible === true,
    };
  });
  const cycles = detectCycles(nodes);
  if (cycles.length > 0) {
    for (const node of nodes) {
      node.structuralBlockers.push("dependency_cycle");
      node.dependencySatisfied = false;
      node.releaseReady = false;
    }
  }
  const edges = nodes.flatMap((node) => node.dependencies.map((dependency) => ({ from: node.key, to: dependency.key, resolved: dependency.resolved })));
  const structuralIssues = nodes.reduce((total, node) => total + node.structuralBlockers.length, 0) + unconfigured.length;
  const payload = {
    schema: MODULE_DEPENDENCY_GRAPH_SCHEMA,
    sourceMemoryHash: completionMemory.memoryHash,
    configurationHash: configuration.configurationHash,
    nodes,
    edges,
    cycles,
    unconfigured,
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      resolvedEdges: edges.filter((edge) => edge.resolved).length,
      structuralIssues,
      releaseReady: nodes.filter((node) => node.releaseReady).length,
      blocked: nodes.filter((node) => !node.releaseReady).length,
    },
  };
  return { ...payload, graphHash: digest(payload), ok: structuralIssues === 0 && cycles.length === 0 };
}
