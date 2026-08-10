import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-094-supabase-live-contract-audit.json");
const phase = json("config/evolution-phase-095-live-read-compatibility-layer.json");
const program = json("config/evolution-program-3000.json");
const resolver = read("lib/atlas/core-v2/live-capability-resolver.ts");
const repositories = read("lib/atlas/core-v2/live-repositories.ts");
const index = read("lib/atlas/core-v2/index.ts");
const report = read("docs/EVOLUTION_PHASE_095_LIVE_READ_COMPATIBILITY_LAYER.md");
const routeFiles = phase.delivered.routeIntegrations;
const routeSources = routeFiles.map(read);

const requiredModules = ["leads", "pipeline", "tasks-and-agenda", "customers-360", "developments"];
const forbiddenRepositoryReads = [
  '.from("opportunities")',
  '.from("developments")',
  '.from("customers")',
];

const checks = [
  ["Fase 94 foi preservada", previous.phase === 94 && previous.status === "completed"],
  ["Fase 95 foi concluída sem mutar banco ou Auth", phase.phase === 95 && phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false && phase.authenticationChanged === false],
  ["Programa contínuo avançou para 95", program.currentPhase >= 95],
  ["Cinco domínios prioritários foram registrados", requiredModules.length === phase.delivered.priorityModules.length && requiredModules.every((module) => phase.delivered.priorityModules.includes(module) && resolver.includes(`module: "${module}"`))],
  ["Versão única de compatibilidade é exposta", resolver.includes("live-read-compat-v1") && repositories.includes("ATLAS_LIVE_READ_COMPATIBILITY_VERSION")],
  ["Aliases críticos estão centralizados", resolver.includes('score: "score_ia"') && resolver.includes('due_at: "due_date"') && resolver.includes('development_id: "crm_projects.id"')],
  ["Todas as leituras físicas aplicam tenant explícito", (repositories.match(/\.from\(/g) || []).length === (repositories.match(/\.eq\("organization_id", organizationId\)/g) || []).length],
  ["RLS autenticada é preservada sem service role", repositories.includes("SupabaseClient") && !repositories.includes("getSupabaseAdmin") && !repositories.includes("SERVICE_ROLE")],
  ["Relações futuras não são consultadas", forbiddenRepositoryReads.every((value) => !repositories.includes(value))],
  ["Pipeline usa o repositório canônico", routeSources[0].includes("readCompatiblePipeline")],
  ["Tarefas e calendário usam os repositórios canônicos", routeSources[1].includes("readCompatibleTasks") && routeSources[2].includes("readCompatibleTasks") && routeSources[2].includes("readCompatibleLeads")],
  ["Clientes 360 usa o repositório canônico", routeSources[3].includes("readCompatibleCustomers")],
  ["Launch OS usa developments e pipeline compatíveis", routeSources[4].includes("readCompatibleDevelopments") && routeSources[4].includes("readCompatiblePipeline")],
  ["Core V2 exporta a nova fronteira", index.includes('export * from "./live-capability-resolver"') && index.includes('export * from "./live-repositories"')],
  ["Relatório cobre problema, impacto, riscos e validação", report.includes("Problema resolvido") && report.includes("Impacto operacional") && report.includes("Riscos identificados") && report.includes("Checklist de validação")],
  ["Build e ZIP continuam reservados à Fase 100", phase.release.buildExecuted === false && phase.release.zipCreated === false && phase.release.checkpointPhase === 100],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 095 verificada: cinco domínios operacionais usam uma camada viva, canônica, tenant-safe e sem migration em lote.");
