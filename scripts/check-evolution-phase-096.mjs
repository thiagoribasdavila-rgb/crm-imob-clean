import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-095-live-read-compatibility-layer.json");
const phase = json("config/evolution-phase-096-module-operational-health.json");
const program = json("config/evolution-program-3000.json");
const health = read("lib/atlas/core-v2/live-operational-health.ts");
const route = read("app/api/v1/core-v2/module-health/route.ts");
const dashboard = read("app/(crm)/dashboard/page.tsx");
const index = read("lib/atlas/core-v2/index.ts");
const report = read("docs/EVOLUTION_PHASE_096_MODULE_OPERATIONAL_HEALTH.md");

const requiredModules = ["leads", "pipeline", "tasks-and-agenda", "customers-360", "developments"];
const directBrowserReads = [
  '.from("leads")',
  '.from("tasks")',
  '.from("crm_projects")',
  '.from("profiles")',
];

const checks = [
  ["Fase 95 foi preservada", previous.phase === 95 && previous.status === "completed"],
  ["Fase 96 foi concluída sem mutar banco, Auth ou dados reais", phase.phase === 96 && phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false && phase.authenticationChanged === false],
  ["Programa contínuo avançou para 96", program.currentPhase >= 96],
  ["Cinco módulos prioritários têm saúde independente", requiredModules.every((module) => phase.delivered.priorityModules.includes(module) && health.includes(`"${module}"`))],
  ["Estados operacionais são explícitos", ["operational", "degraded", "unavailable"].every((state) => health.includes(`"${state}"`))],
  ["Zero registros é saudável", phase.delivered.emptyDataIsHealthy === true && health.includes("Carteira pronta para receber leads")],
  ["Serviço reaproveita os repositórios canônicos", health.includes("readCompatibleLeads") && health.includes("readCompatibleTasks") && health.includes("readCompatibleDevelopments")],
  ["Leitura adicional de perfis aplica tenant explícito", health.includes('.from("profiles")') && health.includes('.eq("organization_id", organizationId)')],
  ["Serviço preserva RLS e não usa chave administrativa", health.includes("SupabaseClient") && !health.includes("getSupabaseAdmin") && !health.includes("SERVICE_ROLE")],
  ["Rota exige rate limit e contexto autenticado", route.includes("enforceRateLimit") && route.includes("requireAccessContext") && route.includes("readOperationalModuleHealth")],
  ["Rota não expõe erro bruto", !route.includes("error.message") && !route.includes("error.details")],
  ["Command Center usa uma única fronteira protegida", dashboard.includes('fetch("/api/v1/core-v2/module-health"') && directBrowserReads.every((value) => !dashboard.includes(value))],
  ["Command Center apresenta os cinco semáforos", dashboard.includes("Saúde operacional dos módulos") && dashboard.includes("INITIAL_MODULE_HEALTH")],
  ["Falha parcial não é anunciada como pane geral", dashboard.includes("Atualização parcial do Command Center") && !dashboard.includes("Alguns módulos estão indisponíveis")],
  ["Core V2 exporta a saúde operacional", index.includes('export * from "./live-operational-health"')],
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
console.log("Fase 096 verificada: Command Center usa uma fronteira protegida e mede cinco módulos sem confundir base vazia com falha.");
