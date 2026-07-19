import fs from "node:fs";
import ts from "typescript";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const phase = json("config/evolution-phase-090-atlas-core-v2-contracts.json");
const foundation = json("config/evolution-phase-089-atlas-core-v1-baseline.json");
const manifest = json("config/atlas-core-v2-contracts.json");
const program = json("config/evolution-program-3000.json");
const pageContract = read("lib/atlas/core-v2/page-contract.ts");
const dataContract = read("lib/atlas/core-v2/data-contract.ts");
const eventContract = read("lib/atlas/core-v2/event-contract.ts");
const registry = read("lib/atlas/core-v2/page-registry.ts");
const publicIndex = read("lib/atlas/core-v2/index.ts");
const report = read("docs/EVOLUTION_PHASE_090_ATLAS_CORE_V2_CONTRACTS.md");

function loadTranspiled(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const runtimeModule = { exports: {} };
  new Function("exports", "module", output)(runtimeModule.exports, runtimeModule);
  return runtimeModule.exports;
}

const pageRuntime = loadTranspiled(pageContract);
const eventRuntime = loadTranspiled(eventContract);
const validPage = {
  id: "test-page",
  route: "/test",
  businessOutcome: "Executar uma decisão comercial verificável.",
  primaryAction: { id: "act", label: "Executar", href: "/test", outcome: "Avançar" },
  decisionMetrics: [],
  depths: ["glance", "workspace", "context"],
  priorityQueue: { title: "Fila", ordering: ["risk"] },
  roleScopes: { director: "organization", superintendent: "management-tree", manager: "team", broker: "own-portfolio" },
  allowedAccessRoles: ["admin"],
  dataDependencies: [{ domain: "test", query: "test", tenantScoped: true, fallback: "empty-state" }],
  copilot: { contextId: "test", capabilities: [], maximumAutonomy: 1 },
  rendering: { strategy: "server-first", interactiveIslands: [] },
};
const tooManyMetrics = { ...validPage, decisionMetrics: Array.from({ length: 6 }, (_, index) => ({ id: String(index), label: "Metric", decisionQuestion: "Question" })) };
const unsafeDependency = { ...validPage, dataDependencies: [{ domain: "test", query: "test", tenantScoped: false, fallback: "empty-state" }] };

const validEvent = {
  id: "event-1",
  eventType: "lead.next_action_recorded",
  schemaVersion: 1,
  organizationId: "org-1",
  entity: { type: "lead", id: "lead-1" },
  actor: { kind: "human", id: "user-1" },
  source: "crm",
  occurredAt: "2026-07-18T12:00:00.000Z",
  recordedAt: "2026-07-18T12:00:01.000Z",
  idempotencyKey: "lead-1-action-1",
  piiClassification: "personal",
  payload: { nextAction: "call" },
  immutable: true,
};
const unsafeAgentEvent = { ...validEvent, actor: { kind: "agent", id: "atlas-sales", autonomyLevel: 3 } };

const runtimeContractValid = pageRuntime.validateAtlasPageContract(validPage).valid === true
  && pageRuntime.validateAtlasPageContract(tooManyMetrics).errors.includes("maximum-five-decision-metrics")
  && pageRuntime.validateAtlasPageContract(unsafeDependency).errors.includes("every-commercial-dependency-must-be-tenant-scoped")
  && eventRuntime.validateAtlasCommercialEvent(validEvent).valid === true
  && eventRuntime.validateAtlasCommercialEvent(unsafeAgentEvent).errors.includes("agent-execution-requires-human-approval");

const registeredModules = ["command-center", "leads", "pipeline", "customers-360", "tasks-and-agenda", "developments"];
const registryValid = registeredModules.every((module) => registry.includes(`id: "${module}"`))
  && (registry.match(/defineAtlasPageContract\(\{/g) ?? []).length >= registeredModules.length;

const checks = [
  ["Core V1 anterior foi preservado", foundation.status === "completed" && foundation.phase === 89],
  ["Fase 90 conclui contratos sem alterar runtime, schema ou dados", phase.status === "completed" && phase.runtimeBehaviorChanged === false && phase.databaseSchemaChanged === false && phase.productionDataModified === false],
  ["Programa contínuo avançou para 90", program.currentPhase >= 90],
  ["Manifesto diferencia Core V2 do legado removido", manifest.product === "ATLAS V3" && manifest.meaning.includes("not-the-retired-legacy-v2")],
  ["Contratos de página e evento rejeitam violações em runtime", runtimeContractValid],
  ["Página limita métricas, exige tenant e usa server-first", pageContract.includes("maximum-five-decision-metrics") && pageContract.includes("every-commercial-dependency-must-be-tenant-scoped") && pageContract.includes('strategy: "server-first"')],
  ["Seis superfícies comerciais fundadoras preservam contrato oficial", registryValid],
  ["Dados exigem tenant e idempotência", dataContract.includes("AtlasTenantContext") && dataContract.includes("idempotencyKey") && dataContract.includes("AtlasRepository")],
  ["Supabase exige grants explícitos e RLS", dataContract.includes("AtlasDataApiGrant") && dataContract.includes("rowLevelSecurity") && dataContract.includes("explicit-data-api-grant-is-required") && dataContract.includes("rls-policy-is-required")],
  ["Fallback de organização é restrito à homologação administrativa", dataContract.includes("controlled-homologation-fallback") && dataContract.includes("homologation-fallback-is-admin-only")],
  ["Evento é versionado, idempotente, imutável e classifica PII", eventContract.includes("schemaVersion") && eventContract.includes("idempotencyKey") && eventContract.includes("immutable: true") && eventContract.includes("piiClassification")],
  ["Agente em execução exige aprovação humana", eventContract.includes("autonomyLevel >= 3") && eventContract.includes("humanApproval")],
  ["Índice público reúne os contratos V2", publicIndex.includes('export * from "./data-contract"') && publicIndex.includes('export * from "./event-contract"') && publicIndex.includes('export * from "./page-registry"')],
  ["Relatório registra negócio, Supabase, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Supabase e segurança") && report.includes("Riscos identificados") && report.includes("Próxima etapa recomendada")],
  ["Release continua bloqueado até a fase 100", manifest.releaseGate.checkpointPhase === 100 && phase.release.zipCreated === false && phase.release.buildExecuted === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 090 verificada: Core V2 com contratos únicos de página, tenant, Data API e eventos governados.");
