import { createHash } from "node:crypto";
import { MODULE_DEPENDENCY_GRAPH_SCHEMA } from "./module-dependency-graph.mjs";

export const RELEASE_COMPOSITION_PLAN_SCHEMA = "atlas.release-composition-plan.v1";
export const RELEASE_COMPOSITION_DECISION_SCHEMA = "atlas.release-composition-decision.v1";

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

function referenceKey(reference) {
  return `${reference.moduleId}@${reference.revision}`;
}

export function createReleaseCompositionPlan(input) {
  if (!input || typeof input !== "object") throw new Error("composition_input_invalid");
  if (typeof input.compositionId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.compositionId)) {
    throw new Error("composition_id_invalid");
  }
  if (typeof input.sourceGraphHash !== "string" || !/^[a-f0-9]{64}$/.test(input.sourceGraphHash)) {
    throw new Error("source_graph_hash_invalid");
  }
  if (!Array.isArray(input.roots) || input.roots.length === 0) throw new Error("composition_roots_empty");
  const roots = input.roots.map((root, index) => cleanReference(root, `root_${index}`))
    .sort((a, b) => referenceKey(a).localeCompare(referenceKey(b)));
  if (new Set(roots.map(referenceKey)).size !== roots.length) throw new Error("composition_root_duplicate");
  const payload = {
    schema: RELEASE_COMPOSITION_PLAN_SCHEMA,
    compositionId: input.compositionId,
    sourceGraphHash: input.sourceGraphHash,
    roots,
  };
  return { ...payload, planHash: digest(payload) };
}

export function inspectReleaseCompositionPlan(plan) {
  try {
    const recreated = createReleaseCompositionPlan(plan);
    if (recreated.planHash !== plan?.planHash) return { ok: false, reason: "plan_hash_mismatch" };
    return { ok: true, planHash: recreated.planHash, roots: recreated.roots.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "composition_plan_invalid" };
  }
}

export function evaluateReleaseCompositionEligibility({ graph, plan }) {
  if (!graph || graph.schema !== MODULE_DEPENDENCY_GRAPH_SCHEMA || typeof graph.graphHash !== "string") {
    throw new Error("dependency_graph_invalid");
  }
  const inspection = inspectReleaseCompositionPlan(plan);
  if (!inspection.ok) throw new Error(`composition_plan_invalid:${inspection.reason}`);
  if (plan.sourceGraphHash !== graph.graphHash) throw new Error("source_graph_hash_mismatch");

  const nodes = new Map(graph.nodes.map((node) => [node.key, node]));
  const closure = new Set();
  const structuralBlockers = [];
  const visit = (reference, source = "root") => {
    const key = referenceKey(reference);
    const node = nodes.get(key);
    if (!node) {
      structuralBlockers.push(`${source}_missing:${key}`);
      return;
    }
    if (node.entryHash !== reference.entryHash) {
      structuralBlockers.push(`${source}_hash_mismatch:${key}`);
      return;
    }
    if (closure.has(key)) return;
    closure.add(key);
    for (const dependency of node.dependencies) visit(dependency, "dependency");
  };
  for (const root of plan.roots) visit(root);

  if (graph.ok !== true) structuralBlockers.push("dependency_graph_not_structurally_valid");
  for (const key of graph.unconfigured ?? []) structuralBlockers.push(`unconfigured_module:${key}`);
  for (const cycle of graph.cycles ?? []) structuralBlockers.push(`dependency_cycle:${cycle}`);

  const selectedNodes = [...closure].sort().map((key) => nodes.get(key));
  for (const node of selectedNodes) {
    for (const blocker of node.structuralBlockers ?? []) structuralBlockers.push(`${node.key}:${blocker}`);
  }
  const releaseBlockers = selectedNodes.flatMap((node) => (node.releaseBlockers ?? []).map((blocker) => `${node.key}:${blocker}`));
  const eligible = structuralBlockers.length === 0 && releaseBlockers.length === 0 && selectedNodes.length > 0
    && selectedNodes.every((node) => node.releaseReady === true);
  const payload = {
    schema: RELEASE_COMPOSITION_DECISION_SCHEMA,
    compositionId: plan.compositionId,
    sourceGraphHash: graph.graphHash,
    planHash: plan.planHash,
    roots: plan.roots,
    closure: selectedNodes.map((node) => ({
      key: node.key,
      moduleId: node.moduleId,
      revision: node.revision,
      entryHash: node.entryHash,
      dependencySatisfied: node.dependencySatisfied,
      releaseReady: node.releaseReady,
    })),
    structuralBlockers: [...new Set(structuralBlockers)].sort(),
    releaseBlockers: [...new Set(releaseBlockers)].sort(),
    summary: {
      roots: plan.roots.length,
      modulesInClosure: selectedNodes.length,
      structuralBlockers: new Set(structuralBlockers).size,
      releaseBlockers: new Set(releaseBlockers).size,
      eligible,
      packageGenerated: false,
    },
    decision: eligible ? "eligible_for_controlled_packaging" : "blocked_before_packaging",
  };
  return { ...payload, decisionHash: digest(payload) };
}
